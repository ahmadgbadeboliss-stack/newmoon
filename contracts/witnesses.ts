import { Ledger } from '../managed/counter/contract/index.js';
import { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

/**
 * Shape of the contract's private state, held by the DApp's
 * private state provider. `ownerKey` is the secret key: it lives
 * off-chain only and is never written to the ledger.
 */
export type CounterPrivateState = {
  readonly ownerKey: Uint8Array;
};

export const createCounterPrivateState = (ownerKey: Uint8Array): CounterPrivateState => ({
  ownerKey,
});

/**
 * TypeScript implementation of the Compact `ownerKey` witness.
 *
 * The witness reads the secret key from private state and returns
 * `[newPrivateState, witnessResult]`. The result enters the circuit
 * as a private input; nothing here is ever disclosed on-chain.
 */
export const witnesses = {
  ownerKey: ({
    privateState,
  }: WitnessContext<Ledger, CounterPrivateState>): [CounterPrivateState, Uint8Array] => [
    privateState,
    privateState.ownerKey,
  ],
};
