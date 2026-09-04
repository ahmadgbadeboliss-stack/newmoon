import path from 'node:path';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract } from '../managed/counter/contract/index.js';
import { witnesses, type CounterPrivateState } from './witnesses.js';

export {
  Contract,
  ledger,
  type Ledger,
  type ImpureCircuits,
} from '../managed/counter/contract/index.js';

export { witnesses, type CounterPrivateState, createCounterPrivateState } from './witnesses.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');

/** Path to the compiled contract artifacts (keys/ and zkir/). */
export const zkConfigPath = path.resolve(currentDir, '..', 'managed', 'counter');

/** The compiled contract, with witnesses attached, ready for deployment. */
export const CompiledCounterContract = CompiledContract.make('CounterContract', Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
