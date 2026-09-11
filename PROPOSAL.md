# Product Proposal

> Chosen from the Level 3 idea list: **Private Allowlist Access** — prove
> membership without revealing identity.
>
> **Draft** — written from what the contract actually does today. Edit freely;
> the product vision is yours.

## What is the product, and who uses it?

**Private Allowlist Access** is a membership gate that lets someone prove they
belong to an approved group without revealing *which* member they are — or
revealing the group's roster to anyone watching.

There are two sides:

- **The operator** holds the allowlist and wants to gate something: a token
  sale, a private beta, a members-only forum, a discount tier, a governance
  vote. Today they publish a list of wallet addresses, or run a signup server
  that sees every member's identity.
- **The member** wants access without being enumerated. Today, proving
  eligibility means revealing exactly who they are, and having that linked to
  everything else that address has ever done.

With this contract, the operator publishes only a *commitment* — a hash — and
each member proves in zero knowledge that they hold a secret matching it. The
operator gets a verifiable count of authorized actions. The member gets access.
Neither the secret nor the member's identity is ever published.

The counter in this repo is the minimal form of that pattern: `owner` is a
one-entry allowlist, and `increment()` is a member proving authority and taking
an action that anyone can independently verify happened.

## Why Midnight specifically?

On a transparent chain, an allowlist is a public list. That breaks the product
in two ways at once:

1. **The roster leaks.** Anyone can read contract state and enumerate every
   member. For a private beta or an investor allowlist, the membership list is
   itself the sensitive data — often more sensitive than any individual action.
2. **Membership checks de-anonymize.** Proving you are on the list means
   transacting from the address that is on the list. That permanently links
   your access to your entire on-chain history.

The usual workarounds each give something up. A Merkle root hides the roster
but still reveals *which leaf* you spent, so members become linkable across
uses. An off-chain signature server keeps things private but replaces the
verifiable guarantee with "trust our server" — no observer can check the tally
is honest.

Midnight's private witnesses close both gaps at once. The secret enters the
circuit as a witness and is never written to the ledger, so the chain stores
only a fixed-size hash commitment. The proof is generated locally — on
Midnight, by a proof server the user runs themselves, which is why this repo
runs one in Docker rather than calling a hosted prover. The chain verifies the
proof without ever seeing the input. The verifier learns exactly one bit,
*"authorized,"* and the tally stays publicly auditable.

That combination — private input, public verifiability, no trusted third party —
is the thing a transparent chain cannot offer. You can have a verifiable tally
or a private roster, not both.

## Data Model

| Data Point                     | Type            | Disclosed To |
|--------------------------------|-----------------|--------------|
| `count`                        | Public ledger   | Everyone     |
| `owner` (hash commitment)      | Public ledger   | Everyone     |
| `ownerKey` (32-byte secret)    | Private witness | No one       |
| Authorization result (one bit) | Proof result    | Everyone     |
| Fee payer address              | Transaction     | Everyone     |
| Rejected attempts              | Never submitted | No one       |

Notes on the rows:

- **`count`** — the running tally of authorized increments. Public by design;
  it is the auditable output of the system.
- **`owner`** — a domain-separated `persistentHash` of the secret key. Fixed
  32 bytes whatever the key is, so its size and shape reveal nothing.
- **`ownerKey`** — supplied as a private witness via `contracts/witnesses.ts`.
  It never enters a transaction. In the web app it lives in browser memory for
  the duration of the proof and is cleared immediately after.
- **Fee payer address** — worth stating honestly: the wallet that pays the
  transaction fee *is* visible on-chain. The circuit hides the key, not the
  payer. Unlinking the two is a real design question for a multi-member
  version (see below).
- **Rejected attempts** — a wrong key fails the circuit's `assert` locally,
  before any transaction is built, so a failed attempt has no on-chain
  footprint at all.

## Mainnet Feasibility

**Reaching Mainnet by Level 6 is realistic for the pattern; the current
contract is a single-owner demo and needs real work first.**

What already works: the contract compiles and is deployed on Preview, the
circuit proves in roughly 3–4 seconds on a local proof server, the suite has 12
passing tests, and CI compiles, tests, type-checks and builds on every push.
Proving cost and latency are not the bottleneck at the volume this product
implies — a membership check is a human-initiated action, and a few seconds is
well inside what a user tolerates.

Three things stand between this and a real product:

1. **Multi-member allowlists.** `owner` binds exactly one key. A real allowlist
   needs many members, which means moving from a single commitment to a set —
   a Merkle root of member commitments, with the proof showing membership in
   the tree. This is the main contract change, and it is the part that makes
   the product interesting rather than a demo.
2. **Adding and revoking members.** There is currently no way to change
   `owner` after deployment. A real operator needs to admit and remove members,
   which means an authority model and a story for what happens to a revoked
   member's past actions.
3. **Key custody.** The security of the whole scheme rests on members keeping a
   32-byte secret. This repo's deploy script generates one and writes it to a
   gitignored file — fine for a demo, not for real users. Production needs the
   key derived from the wallet or held in the wallet, not in application state.

The honest read: the cryptographic core is proven and the tooling works. The
gap is product surface — membership management and key custody — not
feasibility. A focused Level 4–6 could close it.

One caveat worth carrying forward: the fee payer remains visible. For a product
whose promise is "prove membership without revealing identity," that needs
either fee abstraction or a relayer, and it should be designed in rather than
bolted on.
