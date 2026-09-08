/**
 * Persistent wallet construction for long-running test networks.
 *
 * A fresh wallet syncs by replaying EVERY zswap and DUST ledger event from
 * genesis over the indexer WebSocket. On Preview (~760k blocks) that takes
 * hours, and the default in-memory wallet state means every process restart
 * begins again from zero. These helpers serialize the shielded and dust
 * wallet states to disk (gzipped snapshots that include the sync position),
 * and restore them on the next run so the sync resumes where it left off —
 * the same persistence trick the Lace wallet uses.
 */
import { existsSync } from 'node:fs';
import { throttleTime } from 'rxjs';
import pino from 'pino';
import {
  ZswapSecretKeys,
  DustSecretKey,
  LedgerParameters,
  unshieldedToken,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  createKeystore,
  DustWallet,
  type WalletFacade,
  type FacadeState,
} from '@midnight-ntwrk/wallet-sdk';
import {
  FluentWalletBuilder,
  WalletFactory,
  WalletSeeds,
  DEFAULT_DUST_OPTIONS,
  WalletSaveStateProvider,
  MidnightWalletProvider,
  syncWallet,
} from '@midnight-ntwrk/testkit-js';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';

const STATE_DIR = process.env['MIDNIGHT_WALLET_STATE_DIR'] ?? '.states';

export type PersistentWallet = {
  provider: MidnightWalletProvider;
  facade: WalletFacade;
  saveState: () => Promise<void>;
};

const shieldedStateFile = (network: string) => `wallet.${network}.shielded.state.gz`;
const dustStateFile = (network: string) => `wallet.${network}.dust.state.gz`;

type WalletConfig = Parameters<typeof WalletFactory.createShieldedWallet>[0];
type ShieldedWalletInstance = ReturnType<typeof WalletFactory.createShieldedWallet>;
type UnshieldedWalletInstance = ReturnType<typeof WalletFactory.createUnshieldedWallet>;
type DustWalletInstance = ReturnType<
  typeof WalletFactory.createDustWallet extends (config: never, seed: never, options: never) => infer R
    ? () => R
    : never
>;

/**
 * Builds a wallet whose shielded and dust sync positions are restored from
 * disk when snapshots exist, and can be saved back with `saveState()`.
 */
export async function buildPersistentWallet(
  logger: pino.Logger,
  envConfig: EnvironmentConfiguration,
  network: string,
  seed: string,
): Promise<PersistentWallet> {
  const builder = FluentWalletBuilder.forEnvironment(envConfig);
  const config = (builder as unknown as { config: WalletConfig }).config;
  const seeds = WalletSeeds.fromMasterSeed(seed);
  const keystore = createKeystore(seeds.unshielded, envConfig.walletNetworkId);

  const shieldedSaver = new WalletSaveStateProvider(
    logger,
    seed,
    STATE_DIR,
    shieldedStateFile(network),
  );
  const dustSaver = new WalletSaveStateProvider(logger, seed, STATE_DIR, dustStateFile(network));

  let shieldedWallet: ShieldedWalletInstance;
  if (existsSync(shieldedSaver.filePath)) {
    logger.info(`Restoring shielded wallet state from ${shieldedSaver.filePath} (zswap sync resumes)`);
    shieldedWallet = await WalletFactory.restoreShieldedWallet(config, await shieldedSaver.load());
  } else {
    logger.info('No saved shielded state: first sync will replay zswap history from genesis');
    shieldedWallet = WalletFactory.createShieldedWallet(config, seeds.shielded);
  }

  const dustConfig = {
    ...config,
    costParameters: {
      ledgerParams: DEFAULT_DUST_OPTIONS.ledgerParams,
      additionalFeeOverhead: DEFAULT_DUST_OPTIONS.additionalFeeOverhead,
      feeBlocksMargin: DEFAULT_DUST_OPTIONS.feeBlocksMargin,
    },
  } as WalletConfig;
  const Dust = DustWallet(dustConfig as never);
  let dustWallet: ReturnType<typeof Dust.startWithSeed>;
  if (existsSync(dustSaver.filePath)) {
    logger.info(`Restoring dust wallet state from ${dustSaver.filePath} (DUST ledger sync resumes)`);
    dustWallet = Dust.restore(await dustSaver.load());
  } else {
    dustWallet = Dust.startWithSeed(seeds.dust, LedgerParameters.initialParameters().dust);
  }

  const unshieldedWallet: UnshieldedWalletInstance = WalletFactory.createUnshieldedWallet(
    config,
    keystore,
  );
  const facade = await WalletFactory.createWalletFacade(
    config as unknown as Parameters<typeof WalletFactory.createWalletFacade>[0],
    shieldedWallet,
    unshieldedWallet,
    dustWallet as unknown as DustWalletInstance,
  );
  const started = await WalletFactory.startWalletFacade(facade, seeds.shielded, seeds.dust);

  const provider = await MidnightWalletProvider.withWallet(
    logger,
    envConfig,
    started,
    ZswapSecretKeys.fromSeed(seeds.shielded),
    DustSecretKey.fromSeed(seeds.dust),
    keystore,
  );

  const saveState = async (): Promise<void> => {
    try {
      await shieldedSaver.save(started.shielded as never);
      await dustSaver.save(started.dust as never);
    } catch (error) {
      logger.warn(`Could not save wallet state: ${String(error)}`);
    }
  };

  return { provider, facade: started, saveState };
}

const pct = (applied: bigint, highest: bigint): string =>
  highest > 0n ? `${(Number((applied * 100n) / highest))}%` : 'starting…';

const describeProgress = (state: FacadeState): string => {
  const shielded = state.shielded.state.progress;
  const dust = state.dust.state.progress;
  return (
    `shielded ${shielded.appliedIndex}/${shielded.highestIndex} (${pct(shielded.appliedIndex, shielded.highestIndex)}), ` +
    `dust ${dust.appliedIndex}/${dust.highestIndex} (${pct(dust.appliedIndex, dust.highestIndex)})`
  );
};

/**
 * Waits for the wallet to fully sync, logging real progress and saving state
 * snapshots along the way so a crash or restart resumes rather than
 * restarting from genesis. Retries around the per-slice sync timeout.
 *
 * @param totalBudgetMs overall wall-clock budget for the sync (default 4h)
 */
export async function syncWithProgress(
  logger: pino.Logger,
  wallet: PersistentWallet,
  totalBudgetMs: number = Number(process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? 4 * 60 * 60_000),
): Promise<void> {
  const sliceMs = Math.min(15 * 60_000, totalBudgetMs);
  const saveEveryMs = 5 * 60_000;
  let lastSave = Date.now();

  const progressSubscription = wallet.facade
    .state()
    .pipe(throttleTime(30_000))
    .subscribe({
      next: (state) => {
        logger.info(`Sync progress: ${describeProgress(state)}`);
        if (Date.now() - lastSave >= saveEveryMs) {
          lastSave = Date.now();
          void wallet.saveState();
        }
      },
    });

  const deadline = Date.now() + totalBudgetMs;
  try {
    for (;;) {
      try {
        await syncWallet(wallet.provider.wallet, 5_000, sliceMs);
        await wallet.saveState();
        logger.info('Wallet fully synced; state saved');
        return;
      } catch (error) {
        if (Date.now() >= deadline) {
          await wallet.saveState();
          logger.error('Sync budget exhausted; progress saved — run the script again to continue');
          throw error;
        }
        logger.warn(
          `Sync slice timed out (${sliceMs}ms); progress saved, retrying until the ${totalBudgetMs}ms budget is exhausted`,
        );
        await wallet.saveState();
      }
    }
  } finally {
    progressSubscription.unsubscribe();
  }
}
