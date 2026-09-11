# Product Proposal

> Chosen from the Level 3 idea list: **Private Allowlist Access** — prove
> membership without revealing identity.

## What is the product, and who uses it?

[I WILL FILL THIS IN]

<!--
  Suggested shape (delete this comment when you write your answer):
  - What the product is, in one or two sentences.
  - Who the two sides are: who holds the allowlist, and who proves against it.
  - What each side gets that they cannot get today.
-->

## Why Midnight specifically?

[I WILL FILL THIS IN — what does Midnight do that a transparent chain could not do well for this product?]

<!--
  Worth drawing on: on a transparent chain, an allowlist is a public list of
  addresses. Checking membership means revealing which entry you are, and the
  list itself leaks its whole membership to anyone who reads state. This
  contract publishes only a hash commitment and proves knowledge of the
  preimage in zero knowledge, so the verifier learns one bit — "authorized" —
  and nothing else.
-->

## Data Model

| Data Point          | Type            | Disclosed To |
|---------------------|-----------------|--------------|
| `count`             | Public ledger   | Everyone     |
| `owner`             | Public ledger   | Everyone     |
| `ownerKey`          | Private witness | No one       |
| Authorization bit   | Proof result    | Everyone     |

<!--
  The rows above are the contract as it stands today (contracts/counter.compact):
    - count  — the running tally of authorized increments.
    - owner  — a 32-byte hash commitment to the authorized key, not the key.
    - ownerKey — the caller's 32-byte secret, supplied as a private witness.
    - The authorization bit — the single fact a valid proof reveals.

  [I WILL FILL IN ANY ADDITIONAL ROWS for the product beyond this contract.]
-->

## Mainnet Feasibility

[I WILL FILL THIS IN — is this realistic to reach Mainnet by Level 6?]

<!--
  Points you may want to address:
  - What is already working: contract, circuits, tests, CI, deployed on Preview.
  - What is missing for a real product: multi-member allowlists (this contract
    binds one owner), a way to add and revoke members, and key custody.
  - Proving cost and latency at the volume you expect.
-->
