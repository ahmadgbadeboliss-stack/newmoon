import { describe, it, expect } from 'vitest';
import * as RT from '@midnight-ntwrk/compact-runtime';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { Contract, ledger } from '../managed/counter/contract/index.js';
import { witnesses, type CounterPrivateState } from '../contracts/witnesses.js';

setNetworkId('undeployed');

const COIN = '0'.repeat(64);
const ADDR = RT.sampleContractAddress();

/** Deterministic test key: 32 bytes with the given value in the last slot. */
const key = (n: number): Uint8Array => {
  const bytes = new Uint8Array(32);
  bytes[31] = n;
  return bytes;
};

type Setup = {
  contract: Contract<CounterPrivateState>;
  ctx: RT.CircuitContext<CounterPrivateState>;
};

/** Deploy the contract off-chain, as the owner of `secretKey`. */
const setup = (secretKey: Uint8Array = key(7)): Setup => {
  const contract = new Contract<CounterPrivateState>(witnesses);
  const ctor = contract.initialState(
    RT.createConstructorContext({ ownerKey: secretKey }, COIN),
  );
  const ctx = RT.createCircuitContext(
    ADDR,
    COIN,
    ctor.currentContractState,
    { ownerKey: secretKey },
  );
  return { contract, ctx };
};

const readLedger = (ctx: RT.CircuitContext<CounterPrivateState>) =>
  ledger(ctx.currentQueryContext.state);

/** All byte-string values published in the ledger. */
const ledgerByteValues = (ctx: RT.CircuitContext<CounterPrivateState>): Uint8Array[] => {
  const state = ledger(ctx.currentQueryContext.state);
  return Object.values(state).filter((v): v is Uint8Array => v instanceof Uint8Array);
};

describe('Counter contract', () => {
  it('circuit logic: increments the public tally by exactly one per call', () => {
    const { contract, ctx } = setup();
    let current = ctx;

    let state = readLedger(current);
    expect(state.count).toBe(0n);

    current = contract.impureCircuits.increment(current).context;
    state = readLedger(current);
    expect(state.count).toBe(1n);

    current = contract.impureCircuits.increment(current).context;
    state = readLedger(current);
    expect(state.count).toBe(2n);
  });

  it('state transitions: initializes deterministically and keeps the owner commitment stable', () => {
    const secretKey = key(42);
    const a = setup(secretKey);
    const b = setup(secretKey);

    // Same key deployed twice -> identical public ledger state
    expect(readLedger(a.ctx)).toEqual(readLedger(b.ctx));
    expect(readLedger(a.ctx).count).toBe(0n);

    // The owner commitment is 32 bytes and never changes across increments
    const before = readLedger(a.ctx).owner;
    expect(before).toBeInstanceOf(Uint8Array);
    expect(before.length).toBe(32);

    const incremented = a.contract.impureCircuits.increment(a.ctx).context;
    expect(readLedger(incremented).owner).toEqual(before);
    expect(readLedger(incremented).count).toBe(1n);
  });

  it('privacy: the secret key never appears in any public ledger value', () => {
    const secretKey = key(99);
    const { contract, ctx } = setup(secretKey);
    const current = contract.impureCircuits.increment(ctx).context;

    // No published ledger value equals the secret key
    const published = ledgerByteValues(current);
    expect(published.length).toBeGreaterThan(0);
    for (const value of published) {
      expect(value).not.toEqual(secretKey);
    }

    // The commitment is a hash: it is NOT the key, and it reveals nothing
    // about it. A different key must produce a different commitment.
    const otherOwner = readLedger(setup(key(100)).ctx).owner;
    const thisOwner = readLedger(current).owner;
    expect(thisOwner).not.toEqual(otherOwner);

    // Nothing in the ledger encodes the key's value: the only secret-derived
    // public datum is the fixed-size commitment above.
    const state = readLedger(current);
    const serialized = JSON.stringify(state, (_, v) => {
      if (v instanceof Uint8Array) return Buffer.from(v).toString('hex');
      if (typeof v === 'bigint') return v.toString();
      return v;
    });
    expect(serialized).not.toContain(Buffer.from(secretKey).toString('hex'));
  });

  it('access control: a non-owner cannot increment, and the ledger stays untouched', () => {
    const { contract, ctx } = setup(key(1));
    const ownerCommitment = readLedger(ctx).owner;

    // A different private state = a different (non-owner) caller
    const stranger: RT.CircuitContext<CounterPrivateState> = {
      ...ctx,
      currentPrivateState: { ownerKey: key(2) },
    };

    expect(() => contract.impureCircuits.increment(stranger)).toThrow(
      'failed assert: Only the owner can increment this counter',
    );

    // The failed attempt changed nothing on-chain
    const state = readLedger(ctx);
    expect(state.count).toBe(0n);
    expect(state.owner).toEqual(ownerCommitment);
  });

  it('witness wiring: rejects a context missing the ownerKey private state', () => {
    const { contract } = setup();
    const badCtx = { ...setup().ctx, currentPrivateState: {} } as unknown as RT.CircuitContext<CounterPrivateState>;
    expect(() => contract.impureCircuits.increment(badCtx)).toThrow();
  });
});
