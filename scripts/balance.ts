/**
 * Checks the wallet's NIGHT balance on a network without deploying anything.
 * Exit code 0 = funded, 1 = not funded.
 *
 * NIGHT is held by the *unshielded* wallet, which syncs in seconds. The
 * shielded and dust wallets replay from genesis and take hours on Preview,
 * so this check deliberately waits only for unshielded sync — a funding
 * check should not block on state it never reads. Pass --full (or set
 * MIDNIGHT_FULL_SYNC=1) to wait for a complete sync and refresh the
 * .states/ snapshots that deploy.ts resumes from.
 *
 * Usage: tsx scripts/balance.ts [preview|preprod] [--full]
 */
import { WebSocket } from 'ws';
import pino from 'pino';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { buildPersistentWallet, syncWithProgress } from '../src/wallet.js';
import { getConfig, type NetworkName } from '../src/config.js';
import { loadEnvFile, resolveSecret } from './env.js';

const args = process.argv.slice(2);
const network = (args.find((a) => !a.startsWith('--')) ?? 'preview') as NetworkName;
const fullSync = args.includes('--full') || process.env['MIDNIGHT_FULL_SYNC'] === '1';
loadEnvFile(network);
const secret = resolveSecret(network);
const config = getConfig(network);

// @ts-expect-error WebSocket global assignment for GraphQL subscriptions
globalThis.WebSocket = WebSocket;
setNetworkId(config.networkId);

// Default to 'info' so the sync progress from syncWithProgress is visible;
// a multi-hour operation should not run silently. LOG_LEVEL overrides it.
const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});
const envConfig: EnvironmentConfiguration = {
  walletNetworkId: config.networkId as EnvironmentConfiguration['walletNetworkId'],
  ...config,
};

const wallet = await buildPersistentWallet(logger, envConfig, network, secret.value);
const provider = wallet.provider;
const address = provider.unshieldedKeystore.getBech32Address().asString();

// start(false) + an explicit wait: the built-in 90s default would time out
// prematurely against a network this far from genesis.
await provider.start(false);

const UNSHIELDED_TIMEOUT_MS = Number(process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? 5 * 60_000);

if (fullSync) {
  logger.info('Full sync requested: replaying shielded + dust history (this takes hours)');
  await syncWithProgress(logger, wallet);
} else {
  logger.info('Waiting for unshielded sync (NIGHT balance only; pass --full for a complete sync)');
  await firstValueFrom(
    wallet.facade.state().pipe(
      filter((s) => s.unshielded.progress.isStrictlyComplete()),
      timeout(UNSHIELDED_TIMEOUT_MS),
    ),
  );
  logger.info('Unshielded wallet synced');
}

const state = await firstValueFrom(provider.wallet.state());
const night = unshieldedToken().raw;
const balance = state.unshielded.balances?.[night] ?? 0n;

// DUST -- not NIGHT -- pays transaction fees on Midnight. It is generated
// over time by NIGHT that has been registered for dust generation, so a
// wallet can hold plenty of NIGHT and still be unable to pay for a deploy.
// Reported only after a --full sync, since the dust wallet must be caught up
// for this figure to mean anything.
let dustNote = fullSync ? '0' : '(needs --full to read)';
if (fullSync) {
  try {
    dustNote = state.dust.balance(new Date()).toString();
  } catch {
    dustNote = '(unavailable)';
  }
}

console.log('\n════════════════════════════════════════════════════════');
console.log(`  Network:            ${network}`);
console.log(`  Unshielded address: ${address}`);
console.log(`  NIGHT balance:      ${balance}`);
console.log(`  DUST balance:       ${dustNote}   <- pays fees`);
console.log('════════════════════════════════════════════════════════');

if (balance > 0n) {
  console.log('\nFUNDED (NIGHT)');
  if (fullSync && dustNote === '0') {
    console.log('But DUST is 0, so no transaction can pay its fee yet.');
    console.log('Register NIGHT for dust generation ("Generate tDUST" in Lace,');
    console.log('or run the deploy script, which registers automatically), then');
    console.log('wait for dust to accrue.');
  }
  console.log();
} else {
  console.log(`\nNOT FUNDED — request tNIGHT at the faucet:\n  ${config.faucet}\n`);
}

await wallet.saveState();
await provider.stop();
if (balance === 0n) process.exit(1);
