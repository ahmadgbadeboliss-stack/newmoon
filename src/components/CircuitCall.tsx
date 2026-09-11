import { useCallback, useEffect, useState } from 'react';
import type { ConnectionState } from '../hooks/useMidnight';
import { readPublicState, type PublicState } from '../lib/publicState';
import { parseSecretKey, proveLocally, type ProofOutcome } from '../lib/localProof';

type Props = {
  contractAddress: string;
  connection: ConnectionState;
};

type ProvingState =
  | { phase: 'idle' }
  | { phase: 'proving' }
  | { phase: 'done'; outcome: ProofOutcome }
  | { phase: 'error'; message: string };

const shortHex = (hex: string) => `${hex.slice(0, 16)}…${hex.slice(-8)}`;

export function CircuitCall({ contractAddress, connection }: Props) {
  const [publicState, setPublicState] = useState<PublicState | null>(null);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [secretKey, setSecretKey] = useState('');
  const [proving, setProving] = useState<ProvingState>({ phase: 'idle' });

  const refresh = useCallback(async () => {
    setLoadingState(true);
    setPublicError(null);
    try {
      setPublicState(await readPublicState(contractAddress));
    } catch (e) {
      setPublicError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingState(false);
    }
  }, [contractAddress]);

  useEffect(() => {
    if (contractAddress) void refresh();
    else setLoadingState(false);
  }, [contractAddress, refresh]);

  const onProve = useCallback(async () => {
    if (!publicState) return;
    setProving({ phase: 'proving' });
    try {
      const key = parseSecretKey(secretKey);
      const outcome = await proveLocally(publicState.ownerCommitmentHex, key);
      // Drop the key from component state the moment it is no longer needed.
      setSecretKey('');
      setProving({ phase: 'done', outcome });
    } catch (e) {
      setProving({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [publicState, secretKey]);

  return (
    <section className="card" aria-labelledby="circuit-heading">
      <div className="card-head">
        <h2 id="circuit-heading">Counter</h2>
        <button className="btn btn-ghost" onClick={() => void refresh()} disabled={loadingState}>
          {loadingState ? 'Reading…' : 'Refresh'}
        </button>
      </div>

      {/* ── Public state: readable by anyone, no wallet required ── */}
      {publicError ? (
        <div className="alert" role="alert">
          <strong>Could not read public state.</strong>
          <span>{publicError}</span>
        </div>
      ) : (
        <dl className="kv">
          <dt>Public tally</dt>
          <dd className="tally">{loadingState ? '…' : (publicState?.count.toString() ?? '—')}</dd>
          <dt>Owner commitment</dt>
          <dd>
            <code title={publicState?.ownerCommitmentHex}>
              {publicState ? shortHex(publicState.ownerCommitmentHex) : '—'}
            </code>
            <span className="muted small"> hash of the key, not the key</span>
          </dd>
        </dl>
      )}

      <hr />

      {/* ── The circuit call: private witness in, one bit out ── */}
      <h3>Prove you are the owner</h3>
      <p className="muted small">
        Your key is used as a private witness to the <code>increment</code> circuit and never
        leaves this browser — it is not sent to the chain, the indexer, or any server.
      </p>

      <label className="field">
        <span>Owner secret key (64 hex characters)</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="••••••••••••••••••••••••••••••••"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          disabled={proving.phase === 'proving'}
        />
      </label>

      <button
        className="btn"
        onClick={() => void onProve()}
        disabled={!publicState || secretKey.length === 0 || proving.phase === 'proving'}
      >
        {proving.phase === 'proving' ? (
          <>
            <span className="spinner" aria-hidden="true" /> Generating proof…
          </>
        ) : (
          'Prove & increment'
        )}
      </button>

      {proving.phase === 'proving' && (
        <p className="muted small" role="status">
          Running the compiled circuit locally. This proves key ownership without disclosing the
          key.
        </p>
      )}

      {proving.phase === 'error' && (
        <div className="alert" role="alert">
          <strong>Could not run the circuit.</strong>
          <span>{proving.message}</span>
        </div>
      )}

      {proving.phase === 'done' &&
        (proving.outcome.authorized ? (
          <div className="result result-ok" role="status">
            <strong>Authorized — proof verified locally.</strong>
            <span>
              The circuit accepted your key and produced tally{' '}
              <b>{proving.outcome.nextCount.toString()}</b>.
            </span>
            <span className="privacy-label">Proved without revealing your input</span>
          </div>
        ) : (
          <div className="result result-no" role="status">
            <strong>Not authorized.</strong>
            <span>{proving.outcome.reason}</span>
            <span className="privacy-label">
              The chain learns nothing about the key you tried
            </span>
          </div>
        ))}

      {connection.status !== 'connected' && proving.phase === 'done' && (
        <p className="muted small">
          Connect a wallet to submit an authorized increment as an on-chain transaction.
        </p>
      )}
    </section>
  );
}
