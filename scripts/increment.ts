/**
 * Increments the deployed counter contract and verifies the on-chain tally.
 *
 * Usage: tsx scripts/increment.ts [preview|preprod]
 * Reads the contract address and owner key from deployment.json.
 */
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
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
import { buildPersistentWallet, syncWithProgress } from '../src/wallet.js';
import { getConfig, type NetworkName } from '../src/config.js';
import { loadEnvFile, resolveSecret } from './env.js';

const network = (process.argv[2] ?? 'preview') as NetworkName;
loadEnvFile(network);
const secret = resolveSecret(network);
const config = getConfig(network);

// @ts-expect-error WebSocket global assignment for GraphQL subscriptions
globalThis.WebSocket = WebSocket;
setNetworkId(config.networkId);

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const deployment = JSON.parse(readFileSync('deployment.json', 'utf8')) as {
  contractAddress: string;
  ownerKeyHex: string;
};
const initialPrivateState: CounterPrivateState = {
  ownerKey: Buffer.from(deployment.ownerKeyHex, 'hex'),
};

const PRIVATE_STATE_ID = 'counterPrivateState';
const envConfig: EnvironmentConfiguration = {
  walletNetworkId: config.networkId as EnvironmentConfiguration['walletNetworkId'],
  ...config,
};

const wallet = await buildPersistentWallet(logger, envConfig, network, secret.value);
const provider = wallet.provider;
// start(false) + explicit long sync: the built-in funds wait uses a hard 90s
// sync timeout, too short for a fresh Preview wallet syncing from genesis.
await provider.start(false);
await syncWithProgress(logger, wallet);

const zkConfigProvider = new NodeZkConfigProvider<'increment'>(zkConfigPath);
const providers: MidnightProviders<'increment', typeof PRIVATE_STATE_ID, CounterPrivateState> = {
  privateStateProvider: levelPrivateStateProvider({
    privateStateStoreName: 'counter-private-state',
    signingKeyStoreName: 'counter-signing-keys',
    privateStoragePasswordProvider: () =>
      process.env['MIDNIGHT_PRIVATE_STATE_PASSWORD'] ?? 'newmoon-counter-demo-password',
    accountId: provider.getCoinPublicKey(),
  }),
  publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
  zkConfigProvider,
  proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
  walletProvider: provider,
  midnightProvider: provider,
};

const found = await findDeployedContract(providers, {
  contractAddress: deployment.contractAddress,
  compiledContract: CompiledCounterContract,
  privateStateId: PRIVATE_STATE_ID,
  initialPrivateState,
});

const stateBefore = ledger(
  (await providers.publicDataProvider.queryContractState(deployment.contractAddress))!.data,
);
logger.info(`Current count: ${stateBefore.count}`);

const call = await found.callTx.increment();
logger.info(`Increment submitted (txId: ${call.public.txId}, block ${call.public.blockHeight})`);

const stateAfter = ledger(
  (await providers.publicDataProvider.queryContractState(deployment.contractAddress))!.data,
);
console.log(`\n  Count: ${stateBefore.count} -> ${stateAfter.count}  (owner key never revealed)\n`);

await wallet.saveState();
await provider.stop();
