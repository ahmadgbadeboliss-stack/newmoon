import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Minimal .env loader: reads `.env`, then `.env.<network>` from the project
 * root into process.env (shell environment wins). Avoids extra dependencies.
 */
export function loadEnvFile(network: string): void {
  const projectRoot = path.resolve(import.meta.dirname, '..');
  for (const file of [`.env`, `.env.${network}`]) {
    const full = path.join(projectRoot, file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export type WalletSecret = { kind: 'seed'; value: string } | { kind: 'mnemonic'; value: string };

/**
 * Resolve the wallet secret for a network from MIDNIGHT_<NET>_SEED
 * (64-char hex, no 0x prefix) or MIDNIGHT_<NET>_MNEMONIC (24 words).
 */
export function resolveSecret(network: string): WalletSecret {
  const upper = network.toUpperCase();
  const mnemonic = process.env[`MIDNIGHT_${upper}_MNEMONIC`]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[`MIDNIGHT_${upper}_SEED`]?.trim();

  if (mnemonic && seedHex) {
    throw new Error(`Set only one of MIDNIGHT_${upper}_MNEMONIC or MIDNIGHT_${upper}_SEED.`);
  }
  if (mnemonic) return { kind: 'mnemonic', value: mnemonic };
  if (seedHex) {
    if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length % 2 !== 0) {
      throw new Error(`MIDNIGHT_${upper}_SEED must be a hex string of even length (no 0x prefix).`);
    }
    return { kind: 'seed', value: seedHex };
  }
  throw new Error(
    `MIDNIGHT_${upper}_SEED (or MIDNIGHT_${upper}_MNEMONIC) is required for network '${network}'. ` +
      `Add it to .env.${network} — see .env.example.`,
  );
}
