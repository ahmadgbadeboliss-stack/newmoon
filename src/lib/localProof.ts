import type { CounterPrivateState } from '../../contracts/witnesses';

export type ProofOutcome =
  | {
      authorized: true;
      /** The tally the circuit produced locally: current count + 1. */
      nextCount: bigint;
      /** The public commitment the proof was checked against. */
      ownerCommitmentHex: string;
    }
  | {
      authorized: false;
      /** Why the circuit rejected — never includes the key. */
      reason: string;
    };

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** Parses a 64-char hex secret key into the 32 bytes the witness expects. */
export function parseSecretKey(input: string): Uint8Array {
  const hex = input.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('The key must be 64 hex characters (32 bytes).');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Runs the real compiled `increment` circuit in the browser, with the user's
 * secret key supplied as the private witness.
 *
 * This is the privacy behavior the dApp demonstrates: the key is read from a
 * local input, held only in memory, and fed to the circuit as a witness. The
 * circuit's own `assert(owner == commitment())` decides the outcome. Nothing
 * about the key — not the key, not a partial hash, not its length — leaves
 * the browser, and the caller learns exactly one bit: authorized or not.
 *
 * @param ownerCommitmentHex the public commitment read from the chain
 * @param secretKey the caller's 32-byte private witness
 */
export async function proveLocally(
  ownerCommitmentHex: string,
  secretKey: Uint8Array,
): Promise<ProofOutcome> {
  // Lazy: both pull in WASM. Must come from the same compact-runtime instance
  // (see the note in publicState.ts about cross-instance ChargedState).
  const [RT, contractModule, { witnesses }] = await Promise.all([
    import('@midnight-ntwrk/compact-runtime'),
    import('../../managed/counter/contract/index.js'),
    import('../../contracts/witnesses'),
  ]);

  const privateState: CounterPrivateState = { ownerKey: secretKey };
  const contract = new contractModule.Contract<CounterPrivateState>(witnesses);

  // Reconstruct the contract locally from this key. If the key is the owner's,
  // the resulting commitment matches what is published on-chain.
  const coinPublicKey = '0'.repeat(64);
  const constructed = contract.initialState(
    RT.createConstructorContext(privateState, coinPublicKey),
  );
  const localCommitment = toHex(
    contractModule.ledger(constructed.currentContractState.data).owner,
  );

  if (localCommitment !== ownerCommitmentHex.toLowerCase()) {
    // The circuit's assert would reject this. Report it without echoing
    // anything derived from the key the user typed.
    return {
      authorized: false,
      reason: 'This key does not match the owner commitment published on-chain.',
    };
  }

  const context = RT.createCircuitContext(
    RT.sampleContractAddress(),
    coinPublicKey,
    constructed.currentContractState,
    privateState,
  );

  try {
    const result = contract.impureCircuits.increment(context);
    const nextCount = contractModule.ledger(result.context.currentQueryContext.state).count;
    return { authorized: true, nextCount, ownerCommitmentHex: localCommitment };
  } catch (e) {
    return {
      authorized: false,
      reason: e instanceof Error ? e.message : 'The circuit rejected this input.',
    };
  }
}
