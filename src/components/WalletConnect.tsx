import type { ConnectionState, WalletInfo } from '../hooks/useMidnight';
import { NETWORK_ID } from '../hooks/useMidnight';

type Props = {
  state: ConnectionState;
  available: WalletInfo[];
  onConnect: (rdns?: string) => void;
  onDisconnect: () => void;
};

/** Abbreviates a bech32 address for display without hiding its identity. */
const short = (addr: string) =>
  addr.length <= 32 ? addr : `${addr.slice(0, 18)}…${addr.slice(-10)}`;

export function WalletConnect({ state, available, onConnect, onDisconnect }: Props) {
  return (
    <section className="card" aria-labelledby="wallet-heading">
      <div className="card-head">
        <h2 id="wallet-heading">Wallet</h2>
        <span className={`badge badge-${state.status}`}>
          {state.status === 'connected'
            ? 'Connected'
            : state.status === 'connecting'
              ? 'Connecting…'
              : state.status === 'error'
                ? 'Error'
                : 'Disconnected'}
        </span>
      </div>

      {state.status === 'connected' ? (
        <>
          <dl className="kv">
            <dt>Network</dt>
            <dd>{NETWORK_ID}</dd>
            <dt>Address</dt>
            <dd>
              <code className="addr" title={state.address}>
                {short(state.address)}
              </code>
            </dd>
          </dl>
          <button className="btn btn-secondary" onClick={onDisconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            {state.status === 'connecting'
              ? 'Approve the connection request in your wallet…'
              : `Connect a Midnight wallet on ${NETWORK_ID} to call the contract.`}
          </p>

          {state.status === 'error' && (
            <div className="alert" role="alert">
              <strong>{state.message}</strong>
              {state.hint && <span>{state.hint}</span>}
            </div>
          )}

          {available.length > 1 ? (
            <div className="wallet-list">
              {available.map((w) => (
                <button
                  key={w.rdns}
                  className="btn"
                  disabled={state.status === 'connecting'}
                  onClick={() => onConnect(w.rdns)}
                >
                  {w.icon && <img src={w.icon} alt="" width={18} height={18} />}
                  Connect {w.name}
                </button>
              ))}
            </div>
          ) : (
            <button
              className="btn"
              disabled={state.status === 'connecting'}
              onClick={() => onConnect()}
            >
              {state.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
            </button>
          )}

          {available.length === 0 && state.status !== 'connecting' && (
            <p className="muted small">
              No wallet detected.{' '}
              <a href="https://www.lace.io/" target="_blank" rel="noreferrer">
                Install Lace
              </a>{' '}
              and enable the Midnight {NETWORK_ID} network.
            </p>
          )}
        </>
      )}
    </section>
  );
}
