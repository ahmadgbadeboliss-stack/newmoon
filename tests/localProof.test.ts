/**
 * Tests for the browser-side proving path (src/lib/localProof.ts).
 *
 * These run the same compiled circuit the frontend runs, so they verify the
 * dApp's privacy claim directly: the owner is authorized, a stranger is not,
 * and nothing derived from the secret key escapes into the result.
 */
import { describe, it, expect } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as RT from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/counter/contract/index.js';
import { witnesses, type CounterPrivateState } from '../contracts/witnesses.js';
import { parseSecretKey, proveLocally } from '../src/lib/localProof.js';

setNetworkId('undeployed');

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const key = (n: number): Uint8Array => {
  const bytes = new Uint8Array(32);
  bytes[31] = n;
  return bytes;
};

/** The owner commitment the chain would publish for a given key. */
const publishedCommitment = (ownerKey: Uint8Array): string => {
  const contract = new Contract<CounterPrivateState>(witnesses);
  const built = contract.initialState(
    RT.createConstructorContext({ ownerKey }, '0'.repeat(64)),
  );
  return toHex(ledger(built.currentContractState.data).owner);
};

describe('parseSecretKey', () => {
  it('accepts 64 hex characters, with or without an 0x prefix', () => {
    const hex = toHex(key(7));
    expect(parseSecretKey(hex)).toEqual(key(7));
    expect(parseSecretKey(`0x${hex}`)).toEqual(key(7));
    expect(parseSecretKey(`  ${hex}  `)).toEqual(key(7));
  });

  it('rejects anything that is not a 32-byte hex string', () => {
    expect(() => parseSecretKey('')).toThrow(/64 hex characters/);
    expect(() => parseSecretKey('abc')).toThrow(/64 hex characters/);
    expect(() => parseSecretKey('z'.repeat(64))).toThrow(/64 hex characters/);
    expect(() => parseSecretKey('a'.repeat(63))).toThrow(/64 hex characters/);
  });
});

describe('proveLocally', () => {
  it('authorizes the owner and reports the incremented tally', async () => {
    const ownerKey = key(7);
    const outcome = await proveLocally(publishedCommitment(ownerKey), ownerKey);

    expect(outcome.authorized).toBe(true);
    if (!outcome.authorized) throw new Error('unreachable');
    expect(outcome.nextCount).toBe(1n);
    expect(outcome.ownerCommitmentHex).toBe(publishedCommitment(ownerKey));
  });

  it('rejects a non-owner without throwing, and says why', async () => {
    const outcome = await proveLocally(publishedCommitment(key(7)), key(99));

    expect(outcome.authorized).toBe(false);
    if (outcome.authorized) throw new Error('unreachable');
    expect(outcome.reason).toMatch(/does not match the owner commitment/i);
  });

  it('privacy: the outcome never carries the secret key, in any encoding', async () => {
    const ownerKey = key(123);
    const outcome = await proveLocally(publishedCommitment(ownerKey), ownerKey);

    const serialized = JSON.stringify(outcome, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );

    // Not as hex, not as base64, not as a raw byte array.
    expect(serialized).not.toContain(toHex(ownerKey));
    expect(serialized).not.toContain(Buffer.from(ownerKey).toString('base64'));
    expect(serialized).not.toContain(Array.from(ownerKey).join(','));
  });

  it('privacy: a rejected attempt leaks nothing about the key that was tried', async () => {
    const attempted = key(200);
    const outcome = await proveLocally(publishedCommitment(key(7)), attempted);

    expect(outcome.authorized).toBe(false);
    if (outcome.authorized) throw new Error('unreachable');
    // The failure reason is a fixed string -- it is not derived from the input.
    expect(outcome.reason).not.toContain(toHex(attempted));
    expect(outcome.reason).not.toContain(toHex(attempted).slice(0, 8));
  });

  it('is deterministic: the same key always yields the same commitment', async () => {
    const ownerKey = key(55);
    const commitment = publishedCommitment(ownerKey);
    const first = await proveLocally(commitment, ownerKey);
    const second = await proveLocally(commitment, ownerKey);

    expect(first).toEqual(second);
  });
});
