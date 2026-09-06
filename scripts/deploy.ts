/**
 * Deploys the counter contract to a network and verifies it on-chain.
 *
 * Usage: tsx scripts/deploy.ts [preview|preprod]
 *
 * Requires:
 *   - .env.<network> with MIDNIGHT_<NET>_SEED (see .env.example)
 *   - the wallet funded with tNIGHT from the network faucet
 *   - the local proof server running: docker compose up -d proof-server
 *
 * The script syncs the wallet, registers NIGHT for DUST generation
 * (idempotent), deploys, performs a demo increment, verifies the
 * public tally through the indexer, and writes deployment.json.
 */
import { writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  findDeployedContract,
  type DeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import {
  MidnightWalletProvider,
  waitForFunds,
  syncWallet,
  type EnvironmentConfiguration,
} from '@midnight-ntwrk/testkit-js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import {
  CompiledCounterContract,
  Contract,
  ledger,
  zkConfigPath,
  type CounterPrivateState,
} from '../contracts/index.js';
import { getConfig, type NetworkName } from '../src/config.js';
import { loadEnvFile, resolveSecret } from './env.js';

// ─── setup ────────────────────────────────────────────────────────────
const network = (process.argv[2] ?? 'preview') as NetworkName;
loadEnvFile(network);
const secret = resolveSecret(network);
if (secret.kind !== 'seed') {
  throw new Error('The deploy script requires MIDNIGHT_<NET>_SEED (hex seed), not a mnemonic.');
}
const config = getConfig(network);

// @ts-expect-error WebSocket global assignment for GraphQL subscriptions
globalThis.WebSocket = WebSocket;
setNetworkId(config.networkId);

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const PRIVATE_STATE_ID = 'counterPrivateState';
const SYNC_TIMEOUT_MS = Number(process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? 60 * 60_000);

// The owner key: a fresh random 32-byte secret for this deployment.
// Only its hash commitment ever reaches the chain.
const ownerKey = crypto.getRandomValues(new Uint8Array(32));
const initialPrivateState: CounterPrivateState = { ownerKey };

const envConfig: EnvironmentConfiguration = {
  walletNetworkId: config.networkId as EnvironmentConfiguration['walletNetworkId'],
  ...config,
};

// ─── wallet ───────────────────────────────────────────────────────────
logger.info(`Building wallet for '${network}'...`);
const wallet = await MidnightWalletProvider.build(logger, envConfig, secret.value);
const address = wallet.unshieldedKeystore.getBech32Address().asString();
logger.info(`Wallet address: ${address}`);
await wallet.start();
await syncWallet(wallet.wallet, undefined, SYNC_TIMEOUT_MS);
logger.info('Wallet synced');

// NIGHT -> DUST registration (idempotent). Requires faucet tNIGHT.
const nightBalance = await waitForFunds(wallet.wallet, envConfig, false, wallet.unshieldedKeystore);
logger.info(`Wallet NIGHT balance: ${nightBalance}`);

// ─── providers ───────────────────────────────────────────────────────
const zkConfigProvider = new NodeZkConfigProvider<'increment'>(zkConfigPath);
const providers: MidnightProviders<'increment', typeof PRIVATE_STATE_ID, CounterPrivateState> = {
  privateStateProvider: levelPrivateStateProvider({
    privateStateStoreName: 'counter-private-state',
    signingKeyStoreName: 'counter-signing-keys',
    privateStoragePasswordProvider: () =>
      process.env['MIDNIGHT_PRIVATE_STATE_PASSWORD'] ?? 'newmoon-counter-demo-password',
    accountId: wallet.getCoinPublicKey(),
  }),
  publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
  zkConfigProvider,
  proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
  walletProvider: wallet,
  midnightProvider: wallet,
};

// ─── deploy ───────────────────────────────────────────────────────────
logger.info('Deploying counter contract...');
const deployed: DeployedContract<Contract> = await deployContract(providers, {
  compiledContract: CompiledCounterContract,
  privateStateId: PRIVATE_STATE_ID,
  initialPrivateState,
});

const contractAddress = deployed.deployTxData.public.contractAddress;
logger.info(`Deploy transaction submitted (txId: ${deployed.deployTxData.public.txId})`);

console.log('\n════════════════════════════════════════════════════════');
console.log('  CONTRACT DEPLOYED');
console.log(`  Network:          ${network}`);
console.log(`  Contract address: ${contractAddress}`);
console.log('════════════════════════════════════════════════════════\n');

// ─── demo call + on-chain verification ─────────────────────────────────
logger.info('Calling increment() from the deployer wallet...');
const found = await findDeployedContract(providers, {
  contractAddress,
  compiledContract: CompiledCounterContract,
  privateStateId: PRIVATE_STATE_ID,
  initialPrivateState,
});
const call = await found.callTx.increment();
logger.info(`Increment submitted (txId: ${call.public.txId}, block ${call.public.blockHeight})`);

const state = await providers.publicDataProvider.queryContractState(contractAddress);
const onChain = ledger(state!.data);
logger.info(`On-chain count after increment: ${onChain.count}`);

if (onChain.count !== 1n) {
  throw new Error(`Expected on-chain count 1, got ${onChain.count}`);
}

// ─── persist deployment info (gitignored — contains the owner key) ────
writeFileSync(
  'deployment.json',
  JSON.stringify(
    {
      network,
      contractAddress,
      ownerKeyHex: Buffer.from(ownerKey).toString('hex'),
      deployTxId: deployed.deployTxData.public.txId,
      deployedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
logger.info('Saved deployment.json');

await wallet.stop();
logger.info('Done. The counter is live — the owner key never touched the chain.');
