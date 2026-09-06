/**
 * Prints the wallet's unshielded address (mn_addr_<network>1...).
 * Paste this address into the network faucet to fund the wallet:
 *   Preview: https://midnight-tmnight-preview.nethermind.dev/
 *   Preprod: https://midnight-tmnight-preprod.nethermind.dev/
 *
 * Usage: tsx scripts/address.ts [preview|preprod]
 */
import { WebSocket } from 'ws';
import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MidnightWalletProvider } from '@midnight-ntwrk/testkit-js';
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

const logger = pino({ level: 'info', transport: { target: 'pino-pretty' } });
const envConfig: EnvironmentConfiguration = {
  walletNetworkId: config.networkId as EnvironmentConfiguration['walletNetworkId'],
  ...config,
};

const wallet = await MidnightWalletProvider.build(
  logger,
  envConfig,
  secret.kind === 'seed' ? secret.value : undefined,
);

console.log('\n════════════════════════════════════════════════════════');
console.log(`  Network:            ${network}`);
console.log(`  Unshielded address: ${wallet.unshieldedKeystore.getBech32Address().asString()}`);
console.log('════════════════════════════════════════════════════════');
console.log(`\nFund this address at the faucet: ${config.faucet}`);
console.log('The faucet sends 1,000 tNIGHT. Then register it for tDUST');
console.log('with "Generate tDUST" in Lace, or just run the deploy script');
console.log('(it registers NIGHT for DUST generation automatically).\n');

await wallet.stop();
