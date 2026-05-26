# Entry points — `/web` vs `/node`

## What

`@cofhe/sdk` ships two subpath entry points, plus a few specialty ones. They are **not** drop-in replacements for each other.

```typescript
// Full client — browser only.
import { createCofheClient, createCofheConfig, Encryptable } from '@cofhe/sdk/web';

// Strict subset — no Web Worker, no zk prover, no encryption.
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/node';

// Chains (re-export of common chain configs).
import { baseSepolia } from '@cofhe/sdk/chains';

// Permit types (separate import for typing).
import type { Permit, SelfPermit, SharingPermit } from '@cofhe/sdk/permits';

// Core enum.
import { FheTypes } from '@cofhe/sdk';
```

Verify the exact export list against the installed types — see `references/lookup-recipes.md`.

## What each entry point exports

| Symbol | `/web` | `/node` |
|---|:-:|:-:|
| `createCofheClient` | ✅ | ✅ |
| `createCofheConfig` | ✅ | ✅ |
| `Encryptable` (factories) | ✅ | ❌ — encryption needs Web Worker + WASM |
| `decryptForView` / `decryptForTx` | ✅ | ✅ (read-only paths) |
| `permits.*` | ✅ | ✅ |
| `areWorkersAvailable` | ✅ | ❌ |
| `createSsrStorage` | ✅ | ❌ |
| `createCofheClientWithCustomWorker` | ✅ | ❌ |
| `hasDOM` | ✅ | ❌ |
| `terminateWorker` | ✅ | ❌ |

`/node` is intentionally a **strict subset** of `/web` — anything that touches the browser-only TFHE WASM worker, iframe-backed storage, or DOM detection is omitted.

## The rule

- **Frontend / browser code** → `import from '@cofhe/sdk/web'`.
- **Server-side code that only reads** (e.g. a webhook that decrypts a public handle, or read-only RPC routes) → `import from '@cofhe/sdk/node'`.
- **Don't alias `web → node`** in your bundler as a workaround for SSR errors. Any file importing `Encryptable`, `areWorkersAvailable`, `createSsrStorage`, or `createCofheClientWithCustomWorker` will fail to resolve at runtime.

If you need both, import each subpath where appropriate — don't try to reach for `/web` from a Node-only file.

## Mismatch symptoms

| Symptom | Likely cause |
|---|---|
| `Encryptable is not a function` server-side | Imported `@cofhe/sdk/web` from a Node-only path. Either move to `/node` (and drop encryption) or only run on the client. |
| `self is not defined` during SSR | Importing the SDK at module scope from a server-rendered page. Wrap in the Proxy singleton (see `concepts/init-singleton.md`). |
| `does not provide an export named 'X'` (Vite) | CJS-interop failure with a transitive dep being served raw. Confirm only `tfhe` is in `optimizeDeps.exclude` — see `concepts/bundler-config.md`. |
| Node API route returns "browser-only" | A route that triggered `/web` code by accident. Audit imports; the route should use `/node`. |

## Gotchas

- **`@cofhe/abi` is a separate package** that `@cofhe/sdk` imports from but does NOT declare as a runtime dep. Install it explicitly in `package.json`; pin both `@cofhe/sdk` and `@cofhe/abi` together. (See `references/hard-rules.md`.)
- **`@cofhe/sdk/chains`** re-exports chains with extra CoFHE metadata. The `baseSepolia` you get from there is a *different object* from `viem/chains`' `baseSepolia` — they share the chain ID but have different fields. Use whichever the function you're calling expects; never mix.
- **TypeScript `paths` aliases can mask import problems** at compile time. Run the bundle (`next build`, `vite build`) before assuming the imports work everywhere.
