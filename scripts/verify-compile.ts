/**
 * Prints what `compact compile` produced: circuits, witnesses, ledger state,
 * and the generated artifacts on disk.
 *
 * `compact compile` itself only prints "Compiling 1 circuits", which is thin
 * evidence that the build worked. This reads the compiler's own
 * contract-info.json and lists what it actually generated -- useful as the
 * compile-output screenshot, and as a fast local check after editing the
 * contract.
 *
 * Usage: yarn verify:compile
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

type ContractInfo = {
  'compiler-version': string;
  'language-version': string;
  'runtime-version': string;
  circuits: { name: string; pure: boolean; proof: boolean }[];
  witnesses: { name: string; 'result type': { 'type-name': string; length?: number } }[];
  ledger: { name: string; type?: { 'type-name'?: string } }[];
};

const MANAGED = path.resolve(import.meta.dirname, '..', 'managed', 'counter');
const infoPath = path.join(MANAGED, 'compiler', 'contract-info.json');

if (!existsSync(infoPath)) {
  console.error(`No compiler output at ${infoPath}\nRun: yarn compile`);
  process.exit(1);
}

const info = JSON.parse(readFileSync(infoPath, 'utf8')) as ContractInfo;

const rule = '─'.repeat(58);
console.log(`\n${rule}`);
console.log('  COMPACT COMPILE OUTPUT — contracts/counter.compact');
console.log(rule);
console.log(`  compiler ${info['compiler-version']}   language ${info['language-version']}   runtime ${info['runtime-version']}`);

console.log(`\n  CIRCUITS (${info.circuits.length})`);
for (const c of info.circuits) {
  const kind = c.proof ? 'proof-carrying' : 'pure';
  console.log(`    • ${c.name}()  [${kind}]`);
}

console.log(`\n  PRIVATE WITNESSES (${info.witnesses.length}) — never on-chain`);
for (const w of info.witnesses) {
  const t = w['result type'];
  const len = t.length ? `<${t.length}>` : '';
  console.log(`    • ${w.name}(): ${t['type-name']}${len}`);
}

console.log(`\n  PUBLIC LEDGER STATE (${info.ledger.length}) — visible to everyone`);
for (const l of info.ledger) {
  console.log(`    • ${l.name}`);
}

const artifacts = [
  'contract/index.js',
  'contract/index.d.ts',
  'keys/increment.prover',
  'keys/increment.verifier',
  'zkir/increment.zkir',
  'zkir/increment.bzkir',
];

console.log('\n  GENERATED ARTIFACTS');
let missing = 0;
for (const rel of artifacts) {
  const full = path.join(MANAGED, rel);
  if (existsSync(full) && statSync(full).size > 0) {
    const kb = (statSync(full).size / 1024).toFixed(1).padStart(8);
    console.log(`    ✓ ${kb} KB  managed/counter/${rel}`);
  } else {
    console.log(`    ✗           managed/counter/${rel}  MISSING`);
    missing += 1;
  }
}

console.log(`${rule}`);
if (missing > 0) {
  console.error(`  ${missing} artifact(s) missing — run: yarn compile\n`);
  process.exit(1);
}
console.log('  All artifacts present.\n');
