import { PREVIEW_CONFIG } from '../config';

/** Public, on-chain state of the counter contract. */
export type PublicState = {
  /** The running tally anyone may read. */
  count: bigint;
  /** The 32-byte hash commitment to the owner key — not the key itself. */
  ownerCommitmentHex: string;
};

const QUERY = `query ContractState($address: HexEncoded!) {
  contract(address: $address) {
    state
  }
}`;

/**
 * Reads the contract's public ledger state straight from the indexer.
 *
 * This deliberately needs no wallet: `count` and `owner` are public, so any
 * visitor can verify the tally. The indexer returns the serialized contract
 * state as hex, which the compiled contract's own `ledger()` decoder turns
 * back into typed fields.
 */
export async function readPublicState(contractAddress: string): Promise<PublicState> {
  const response = await fetch(PREVIEW_CONFIG.indexer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { address: contractAddress } }),
  });

  if (!response.ok) {
    throw new Error(`Indexer returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: { contract?: { state?: string } | null };
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }
  const stateHex = body.data?.contract?.state;
  if (!stateHex) {
    throw new Error('Contract not found on this network — check the address.');
  }

  // Imported lazily: these packages pull in WASM, so keep them out of the
  // initial bundle and off the path of visitors who never read state.
  //
  // `ContractState` MUST come from compact-runtime, not from
  // onchain-runtime-v3 directly. The two are separate WASM instances, and a
  // ChargedState minted by one is rejected by the other's `ledger()` with
  // "expected instance of ChargedState" even though the shapes match.
  const [RT, contract] = await Promise.all([
    import('@midnight-ntwrk/compact-runtime'),
    import('../../managed/counter/contract/index.js'),
  ]);

  const decoded = contract.ledger(RT.ContractState.deserialize(RT.fromHex(stateHex)).data);
  return {
    count: decoded.count,
    ownerCommitmentHex: Array.from(decoded.owner)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  };
}
