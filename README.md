# Private Allowlist Counter

> A Midnight dApp that proves ownership of a secret key in zero knowledge while keeping a public, verifiable tally — the key itself is never revealed on-chain.

Midnight Builder Challenge — Level 1 (New Moon)

## Contract Address

| Network  | Address                          |
|----------|----------------------------------|
| Preview  | [PASTE ADDRESS AFTER DEPLOY]     |
| Preprod  | — (not used; deployed to Preview) |

## What This Does

The contract maintains a simple counter that only an authorized party — the **owner** — may increment. At deployment, the owner's secret key is hashed into a public *commitment* and stored on-chain. Anyone may read the current tally, but only someone who can prove (in zero knowledge) that they know the secret key behind that commitment can increment it. Each `increment()` call generates a ZK proof that is verified by the network before the tally updates; the secret key never leaves the caller's local private state.

## Privacy Model

- **PUBLIC (on-chain, visible to anyone):**
  - `count` — the running tally of authorized increments
  - `owner` — a 32-byte hash *commitment* to the authorized key (not the key itself)
  - The fact that a valid increment happened (transaction and its proof)

- **PRIVATE (private witness, never on-chain):**
  - `ownerKey` — the caller's 32-byte secret key. It lives only in the DApp's local private state (LevelDB) and enters the circuit as a private witness input via `contracts/witnesses.ts`

- **What the user PROVES without revealing:**
  - `increment()` proves in zero knowledge that the caller knows the secret key whose hash matches the public `owner` commitment. A valid proof increments the tally; an invalid one is rejected. The only information that leaks is a single bit: "the caller knows the key."

**Deliberate disclosure:** `disclose()` is used exactly twice — once in the constructor to publish the owner commitment, and once in `increment()` to publish the updated count. The secret key is hashed before anything is disclosed, so no sensitive value ever becomes public.

## Tech Stack

- Midnight network (Preview)
- Compact language (`pragma language_version 0.23`)
- Compact compiler 0.5.2, midnight-js SDK 4.1.1, testkit-js 4.1.1
- Node.js v22, Docker (proof server), TypeScript, Vitest

## Prerequisites

- Node.js v22 (`node --version`)
- Docker (running the Midnight proof server)
- Compact compiler: `npm install -g @midnight-ntwrk/compact-compiler` (`compact --version`)
- Yarn 1.x

## Setup

```bash
# 1. Clone and install
git clone <your-repo-url> newmoon-counter
cd newmoon-counter
yarn install

# 2. Compile the contract (generates managed/ with circuits + keys)
compact compile contracts/counter.compact managed/counter
# or: yarn compile

# 3. Create your wallet env file
cp .env.example .env.preview
# Generate a seed:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Put it in .env.preview as MIDNIGHT_PREVIEW_SEED

# 4. Start the local proof server
yarn proof:up

# 5. Print your wallet address
yarn wallet:address

# 6. Fund the wallet at the Preview faucet (1,000 tNIGHT)
#    https://midnight-tmnight-preview.nethermind.dev/

# 7. Check funding status
yarn tsx scripts/balance.ts preview

# 8. Deploy to Preview
yarn deploy:preview
```

## Run Tests

```bash
yarn test
```

The suite covers circuit logic, state transitions, privacy (the key never appears in any published value), and access control (non-owners are rejected without state changes).

## Incrementing the Counter

```bash
yarn increment:preview
```

Reads the contract address and owner key from `deployment.json` (gitignored — it contains the owner key) and increments the public tally, verifying the on-chain result.

## Initial Idea

*[DRAFT — edit to taste]* **Private Allowlist Access as a product:** a membership-gated service where users prove they are on the allowlist without revealing *which* member they are. This contract is the seed of that pattern — the owner commitment plays the role of an allowlist entry, and `increment()` demonstrates a zero-knowledge proof of membership/authority that a third party can verify without learning the underlying secret. Grown out, this becomes private allowlists for gated content, eligibility gates that prove a threshold without revealing the value, and anonymous surveys with verifiable participation.

## Screenshots

*Compile output (circuits listed):* [ADD SCREENSHOT]

*Contract deployed with address:* [ADD SCREENSHOT]
