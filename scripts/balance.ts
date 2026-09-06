/**
 * Checks the wallet's NIGHT balance on a network without deploying anything.
 * Exit code 0 = funded, 1 = not funded.
 *
 * Usage: tsx scripts/balance.ts [preview|preprod]
 */
import { WebSocket } from 'ws';
import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MidnightWalletProvider, waitForFunds } from '@midnight-ntwrk/testkit-js';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
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

const wallet = await MidnightWalletProvider.build(
  logger,
  envConfig,
  secret.kind === 'seed' ? secret.value : undefined,
);

const address = wallet.unshieldedKeystore.getBech32Address().asString();
console.log(`Network:            ${network}`);
console.log(`Unshielded address: ${address}`);

const BALANCE_TIMEOUT_MS = 30_000;
try {
  const balance = await waitForFunds(
    wallet.wallet,
    envConfig,
    false,
    wallet.unshieldedKeystore,
    BigInt(BALANCE_TIMEOUT_MS),
  );
  console.log(`NIGHT balance:      ${balance}`);
  console.log('FUNDED');
} catch {
  console.log('NIGHT balance:      0 (not funded)');
  console.log(`NOT FUNDED — request tNIGHT at the faucet: ${config.faucet}`);
  await wallet.stop();
  process.exit(1);
}

await wallet.stop();
