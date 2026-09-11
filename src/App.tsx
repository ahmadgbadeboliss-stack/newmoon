import { WalletConnect } from './components/WalletConnect';
import { CircuitCall } from './components/CircuitCall';
import { useMidnight, NETWORK_ID } from './hooks/useMidnight';

/**
 * The deployed contract address. Set VITE_CONTRACT_ADDRESS at build time
 * (Vercel/Netlify env var, or .env.local for a local run).
 */
const CONTRACT_ADDRESS = import.meta.env['VITE_CONTRACT_ADDRESS'] ?? '';

export default function App() {
  const { state, available, connect, disconnect } = useMidnight();

  return (
    <div className="page">
      <header className="header">
        <h1>Private Allowlist Counter</h1>
        <p className="tagline">
          A public tally only the key holder can advance — proven in zero knowledge, on Midnight{' '}
          {NETWORK_ID}.
        </p>
      </header>

      <main className="grid">
        <WalletConnect
          state={state}
          available={available}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        {CONTRACT_ADDRESS ? (
          <CircuitCall contractAddress={CONTRACT_ADDRESS} connection={state} />
        ) : (
          <section className="card">
            <h2>Counter</h2>
            <div className="alert" role="alert">
              <strong>No contract address configured.</strong>
              <span>
                Set <code>VITE_CONTRACT_ADDRESS</code> to the deployed Preview address and rebuild.
              </span>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="privacy-note">
          <h3>What an observer can and cannot learn</h3>
          <ul>
            <li>
              <b>Visible on-chain:</b> the tally, the owner commitment (a hash), and that a valid
              increment occurred.
            </li>
            <li>
              <b>Never on-chain:</b> the secret key. It is a private witness, held only in this
              browser for the duration of the proof.
            </li>
          </ul>
        </div>
        {CONTRACT_ADDRESS && (
          <p className="muted small">
            Contract <code>{CONTRACT_ADDRESS}</code>
          </p>
        )}
      </footer>
    </div>
  );
}
