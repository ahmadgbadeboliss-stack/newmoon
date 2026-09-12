# Private Allowlist Counter

[![CI](https://github.com/ahmadgbadeboliss-stack/newmoon/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmadgbadeboliss-stack/newmoon/actions/workflows/ci.yml)

> A Midnight dApp that proves ownership of a secret key in zero knowledge while keeping a public, verifiable tally — the key itself is never revealed on-chain.

Midnight Builder Challenge — Levels 1–3 (New Moon → First Quarter)

## Live Demo

**https://ahmadgbadeboliss-stack.github.io/newmoon/**

Deployed from `main` by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push. The page reads the deployed Preview contract's public state with no wallet connected — the tally and owner commitment are public, so anyone can verify them.

## Contract Address

| Network  | Address                                                            |
|----------|--------------------------------------------------------------------|
| Preview  | `6bb5e347936c462b4b51111014b8f4f9eefb740c56936e78e6b616df7444b298` |
| Preprod  | — (not used; this project deploys to Preview)                      |

Verify it on the Preview indexer — this returns a `ContractDeploy` at that address:

```bash
curl -s https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ contractAction(address: \"6bb5e347936c462b4b51111014b8f4f9eefb740c56936e78e6b616df7444b298\") { __typename address } }"}'
```

## What This Does

The contract maintains a simple counter that only an authorized party — the **owner** — may increment. At deployment, the owner's secret key is hashed into a public *commitment* and stored on-chain. Anyone may read the current tally, but only someone who can prove (in zero knowledge) that they know the secret key behind that commitment can increment it.

Each `increment()` call generates a ZK proof that is verified before the tally updates; the secret key never leaves the caller's local private state. The web app makes this visible: it reads the public tally with no wallet at all, then lets you supply a key as a private witness and runs the compiled circuit **in your browser** to see whether it authorizes you.

## Privacy Model

- **PUBLIC (on-chain, visible to anyone):**
  - `count` — the running tally of authorized increments
  - `owner` — a 32-byte hash *commitment* to the authorized key (not the key itself)
  - The fact that a valid increment happened (the transaction and its proof)

- **PRIVATE (private witness, never on-chain):**
  - `ownerKey` — the caller's 32-byte secret key. It lives only in the DApp's local private state and enters the circuit as a private witness input via `contracts/witnesses.ts`. In the web app it is held in browser memory for the duration of the proof and cleared immediately after.

- **What the user PROVES without revealing:**
  - `increment()` proves in zero knowledge that the caller knows the secret key whose hash matches the public `owner` commitment. A valid proof increments the tally; an invalid one is rejected. The only information that leaks is a single bit: *"the caller knows the key."*

**Deliberate disclosure:** `disclose()` is used exactly twice — once in the constructor to publish the owner commitment, and once in `increment()` to publish the updated count. The secret key is hashed before anything is disclosed, so no sensitive value ever becomes public.

## Privacy Claim

**What an on-chain observer sees:**

- The contract's address and its full public ledger state: `count` and `owner`.
- That a transaction called `increment()`, and that its proof verified.
- The block and timestamp of each increment, and the fee payer's address.

**What that same observer cannot learn:**

- The secret key. It is never transmitted — not to the chain, not to the indexer, not to any server. The only key-derived value that is ever published is `owner`, a domain-separated `persistentHash` of it.
- Which key was tried on a failed attempt. A wrong key is rejected by the circuit's own `assert` before any transaction is produced, so a failed attempt leaves no on-chain trace at all.
- Anything about the key's structure from the commitment. `owner` is a fixed 32-byte hash; it is the same size and shape whatever the key is.

The dApp makes the boundary observable: the tally and commitment render **without a wallet connected**, because they are public. The key never appears in the UI, is entered into a masked field, and is dropped from component state the moment proving finishes. `tests/localProof.test.ts` asserts this directly — that no result carries the key in hex, base64, or raw byte form, and that a rejection reason is a fixed string rather than anything derived from the key that was tried.

## Tech Stack

- **Chain:** Midnight (Preview network)
- **Contract:** Compact `pragma language_version 0.23`, compiler 0.31.1, toolchain `compact` 0.5.2
- **SDK:** midnight-js 4.1.1, testkit-js 4.1.1, wallet-sdk 1.1.0
- **Frontend:** React 19, Vite 8, `@midnight-ntwrk/dapp-connector-api` 4.0.1, Lace wallet
- **Runtime & tooling:** Node.js v22, Docker (proof server), TypeScript 5.7, Vitest 4
- **CI:** GitHub Actions — compile, test, type-check, build on every push

## Prerequisites

- **Node.js v22** — `node --version`
- **Docker** — runs the Midnight proof server locally
- **Compact toolchain** — the compiler is a standalone binary, not an npm package:
  ```bash
  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  source ~/.bashrc
  compact update 0.31.1
  compact --version          # expect: compact 0.5.2
  compact compile --version  # expect: 0.31.1
  ```
- **Yarn 1.x**
- **Lace wallet** browser extension, set to the Midnight **Preview** network (for the web app)

## Setup & Run Locally

```bash
# 1. Clone and install
git clone https://github.com/ahmadgbadeboliss-stack/newmoon.git
cd newmoon
yarn install

# 2. Compile the contract (generates managed/ with circuits + keys)
yarn compile
yarn verify:compile        # lists circuits, witnesses and ledger state

# 3. Create your wallet env file
cp .env.example .env.preview
# Generate a seed and put it in .env.preview as MIDNIGHT_PREVIEW_SEED:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Start the local proof server
yarn proof:up

# 5. Print your wallet address
yarn wallet:address

# 6. Fund it at the Preview faucet (1,000 tNIGHT)
#    https://midnight-tmnight-preview.nethermind.dev/

# 7. Check funding (takes seconds — reads the unshielded wallet only)
yarn tsx scripts/balance.ts preview

# 8. Deploy to Preview
yarn deploy:preview
```

> **On the first deploy:** the wallet must replay the shielded and DUST ledger
> from genesis before it can pay fees, which takes hours on Preview. The sync
> position is snapshotted to `.states/` every few minutes, so an interrupted
> run resumes where it left off instead of starting over.

### Run the web app

```bash
# Point the app at your deployed contract
echo "VITE_CONTRACT_ADDRESS=<your-preview-contract-address>" > .env.local

yarn dev        # http://localhost:5173
yarn build      # production build into dist/
```

## Run Tests

```bash
yarn test
```

The suite covers the contract (circuit logic, state transitions, privacy, access control, witness wiring) and the browser proving path (owner authorized, stranger rejected, and no encoding of the secret key in any result).

## CI/CD

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

1. **Checkout** and set up **Node.js 22** with a yarn cache.
2. **Install dependencies** from the lockfile (`--frozen-lockfile`).
3. **Install the Compact toolchain** from the official release script and **pin compiler 0.31.1**, so a compiler release cannot silently change the circuits CI validates.
4. **Compile the contract** and **verify `managed/`** — every circuit, key and zkir artifact must exist and be non-empty.
5. **Run the test suite.**
6. **Type-check** both the Node code and the browser code (they use different `lib`/`types`, so each has its own tsconfig).
7. **Build the frontend** with Vite.

In-flight runs are cancelled when a newer commit lands on the same branch.

## Product Proposal

See [PROPOSAL.md](./PROPOSAL.md) — chosen from the Level 3 idea list: **Private Allowlist Access**.

## Initial Idea

**Private Allowlist Access.** A membership gate where a user proves they belong
to an approved group without revealing *which* member they are — and without
the group's roster becoming public. On a transparent chain an allowlist is a
public list of addresses: the roster leaks to anyone who reads state, and
proving you are on it means transacting from the address that is on it, linking
your access to your entire history. This contract is the seed of the
alternative. The `owner` commitment is a one-entry allowlist, and `increment()`
is a member proving authority in zero knowledge while the tally stays publicly
auditable. Grown out, the same pattern gives private allowlists for gated
content, eligibility gates that prove a threshold without revealing the value,
and anonymous surveys with verifiable participation.

Full write-up in [PROPOSAL.md](./PROPOSAL.md).

## Demo Video

[PLACEHOLDER — I will add the link after recording]

## Screenshots

*Compile output (circuits listed):* [ADD SCREENSHOT — run `yarn verify:compile`]

*Contract deployed with address:* [ADD SCREENSHOT]

*Test output (12 passing):* [ADD SCREENSHOT — run `yarn test`]
