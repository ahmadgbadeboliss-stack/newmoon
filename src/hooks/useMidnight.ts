import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ConnectedAPI,
  InitialAPI,
  APIError,
} from '@midnight-ntwrk/dapp-connector-api';
import { ErrorCodes } from '@midnight-ntwrk/dapp-connector-api';
import { PREVIEW_CONFIG } from '../config';

/** The network this dApp talks to. Preview, per the deployed contract. */
export const NETWORK_ID = PREVIEW_CONFIG.networkId;

export type WalletInfo = {
  /** Reverse-DNS id the wallet registers itself under, e.g. `mn.lace`. */
  rdns: string;
  name: string;
  icon: string;
  apiVersion: string;
};

export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; address: string; api: ConnectedAPI }
  | { status: 'error'; message: string; hint?: string };

/**
 * Wallets inject themselves into `window.midnight` keyed by rdns. Lace
 * registers asynchronously as its content script loads, so a dApp that reads
 * the object once on mount can miss it — we poll briefly instead.
 */
const discoverWallets = (): Record<string, InitialAPI> => window.midnight ?? {};

const isAPIError = (e: unknown): e is APIError =>
  typeof e === 'object' && e !== null && (e as { type?: string }).type === 'DAppConnectorAPIError';

/** Turns connector error codes into something a user can act on. */
const describeError = (e: unknown): { message: string; hint?: string } => {
  if (isAPIError(e)) {
    switch (e.code) {
      case ErrorCodes.Rejected:
      case ErrorCodes.PermissionRejected:
        return {
          message: 'Connection request rejected.',
          hint: 'You dismissed the wallet prompt. Click Connect and approve it to continue.',
        };
      case ErrorCodes.Disconnected:
        return {
          message: 'The wallet disconnected.',
          hint: 'Reopen the Lace extension and connect again.',
        };
      case ErrorCodes.InvalidRequest:
        return { message: 'The wallet rejected the request as invalid.', hint: e.reason };
      case ErrorCodes.InternalError:
      default:
        return { message: 'The wallet could not process the request.', hint: e.reason };
    }
  }
  return { message: e instanceof Error ? e.message : String(e) };
};

export function useMidnight() {
  const [wallets, setWallets] = useState<Record<string, InitialAPI>>(discoverWallets);
  const [state, setState] = useState<ConnectionState>({ status: 'disconnected' });

  // Poll for wallet injection over the first few seconds after load.
  useEffect(() => {
    if (Object.keys(wallets).length > 0) return;
    let elapsed = 0;
    const id = setInterval(() => {
      const found = discoverWallets();
      elapsed += 250;
      if (Object.keys(found).length > 0) {
        setWallets({ ...found });
        clearInterval(id);
      } else if (elapsed >= 3000) {
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
  }, [wallets]);

  const available = useMemo<WalletInfo[]>(
    () =>
      Object.entries(wallets).map(([rdns, api]) => ({
        rdns,
        name: api.name ?? rdns,
        icon: api.icon ?? '',
        apiVersion: api.apiVersion ?? 'unknown',
      })),
    [wallets],
  );

  const connect = useCallback(
    async (rdns?: string) => {
      const found = discoverWallets();
      const keys = Object.keys(found);
      if (keys.length === 0) {
        setState({
          status: 'error',
          message: 'No Midnight wallet detected.',
          hint: 'Install the Lace wallet extension, enable the Midnight network, then reload this page.',
        });
        return;
      }

      const key = rdns ?? keys[0]!;
      const wallet = found[key];
      if (!wallet) {
        setState({ status: 'error', message: `Wallet "${key}" is no longer available.` });
        return;
      }

      setState({ status: 'connecting' });
      try {
        const api = await wallet.connect(NETWORK_ID);

        // A wallet pointed at a different network will happily connect but
        // every transaction would fail, so surface the mismatch up front.
        const config = await api.getConfiguration();
        if (config.networkId && config.networkId !== NETWORK_ID) {
          setState({
            status: 'error',
            message: `Network mismatch: the wallet is on "${config.networkId}", this dApp needs "${NETWORK_ID}".`,
            hint: `Switch the Lace network to ${NETWORK_ID} and connect again.`,
          });
          return;
        }

        const { unshieldedAddress } = await api.getUnshieldedAddress();
        setState({ status: 'connected', address: unshieldedAddress, api });
      } catch (e) {
        setState({ status: 'error', ...describeError(e) });
      }
    },
    [],
  );

  const disconnect = useCallback(() => {
    // The connector exposes no revoke call; dropping the API handle and
    // clearing state is the disconnect the dApp side can perform.
    setState({ status: 'disconnected' });
  }, []);

  return { state, available, connect, disconnect };
}
