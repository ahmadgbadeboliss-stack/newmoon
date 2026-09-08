/**
 * Checks the wallet's NIGHT balance on a network without deploying anything.
 * Exit code 0 = funded, 1 = not funded.
 *
 * Usage: tsx scripts/balance.ts [preview|preprod]
 */
import { WebSocket } from 'ws';
import pino from 'pino';
import { firstValueFrom } from 'rxjs';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
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

const logger = pino({ level: 'warn' });
const envConfig: EnvironmentConfiguration = {
  walletNetworkId: config.networkId as EnvironmentConfiguration['walletNetworkId'],
  ...config,
};

const wallet = await buildPersistentWallet(logger, envConfig, network, secret.value);
const provider = wallet.provider;
const address = provider.unshieldedKeystore.getBech32Address().asString();
console.log(`Network:            ${network}`);
console.log(`Unshielded address: ${address}`);

// start(false) + explicit long sync: a fresh wallet syncing from genesis can
// take more than the built-in 90s default, which would time out prematurely.
await provider.start(false);
await syncWithProgress(logger, wallet, Number(process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? 30 * 60_000));

const state = await firstValueFrom(provider.wallet.state());
const night = unshieldedToken().raw;
const balance = state.unshielded.balances?.[night] ?? 0n;
console.log(`NIGHT balance:      ${balance}`);

if (balance > 0n) {
  console.log('FUNDED');
} else {
  console.log(`NOT FUNDED — request tNIGHT at the faucet: ${config.faucet}`);
}

await wallet.saveState();
await provider.stop();
if (balance === 0n) process.exit(1);
