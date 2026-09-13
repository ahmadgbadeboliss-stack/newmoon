/**
 * Browser polyfills. Imported for its side effect, before anything else.
 *
 * `@midnight-ntwrk/compact-runtime` implements fromHex/toHex with Node's
 * Buffer global:
 *
 *   export const fromHex = (s) => Buffer.from(s, 'hex');
 *
 * A browser has no Buffer, so the ledger decoder throws "Buffer is not
 * defined" and the public tally never renders. This must be a separate module
 * rather than a statement in main.tsx: ES imports are hoisted and evaluated
 * before any top-level statement runs, so an assignment there would land too
 * late for anything App pulls in at module scope.
 */
import { Buffer as BufferShim } from 'buffer';

// Declaring `var Buffer` in the global scope shadows the `buffer` module's own
// type, so any alias that points back at it (typeof BufferShim) resolves
// circularly. Assign through a widened reference instead -- the runtime
// behaviour is what matters here, and the SDK only calls Buffer.from/toString.
(globalThis as Record<string, unknown>)['Buffer'] ??= BufferShim;

export {};
