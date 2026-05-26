# Bundler config — Next.js and Vite

## What

`@cofhe/sdk` ships a TFHE WASM module, CJS-only transitive deps, and top-level-await initialization. Each major bundler needs a specific recipe to load it correctly. Without these tweaks you get a blank page, a confusing "does not provide an export named X" error, or a server-side crash on first SSR.

This file documents the canonical Next.js and Vite configurations. Re-apply on every new project.

## Next.js — `next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@cofhe/sdk'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    // @cofhe/sdk ships a circular-chunk worker warning that is safe to ignore.
    config.plugins.push({
      apply(compiler) {
        compiler.hooks.afterEmit.tap('SuppressCircularChunkWarning', (compilation) => {
          compilation.warnings = compilation.warnings.filter(
            (w) => !w.message?.includes('Circular dependency between chunks with runtime'),
          );
        });
      },
    });
    return config;
  },
};

module.exports = nextConfig;
```

### Why each line

- **`transpilePackages: ['@cofhe/sdk']`** — Next.js processes the SDK's ESM through its build pipeline. Sufficient at modern SDK versions; older guides say "use `serverExternalPackages`" — don't (see below).
- **`fs / net / tls: false`** — browser fallbacks for transitive Node deps that the SDK might reference via dead code. Without them, Webpack reports "Module not found: Can't resolve 'fs'."
- **`SuppressCircularChunkWarning`** — cosmetic; the warning is harmless.

### Anti-pattern: `serverExternalPackages`

```javascript
// DO NOT do this:
experimental: { serverExternalPackages: ['@cofhe/sdk'] }
// or
serverExternalPackages: ['@cofhe/sdk']
```

This tells Next.js to defer to Node's `require` for the SDK on the server. The SDK's CJS build drags in ESM-only `tfhe`, which crashes Node. Use `transpilePackages` and stick with SDK ≥ 0.5.2.

## Vite — `vite.config.ts`

Vite needs four things to load `@cofhe/sdk` correctly:

1. **`vite-plugin-wasm`** — lets the SDK `import` `.wasm` files as ES modules.
2. **`vite-plugin-top-level-await`** — `tfhe`'s init uses top-level `await` at module scope; without this the bundle fails to parse and the page renders blank with no clear error.
3. **`vite-plugin-static-copy`** — copies `tfhe_bg.wasm` into the build output so `new URL('./tfhe_bg.wasm', import.meta.url)` resolves at runtime in `vite build` / `preview`.
4. **`optimizeDeps.exclude: ['tfhe']`** — pre-bundling rewrites the WASM import URL and breaks the loader. Exclude **only** `tfhe`, never the whole SDK.

```bash
pnpm add -D vite-plugin-wasm vite-plugin-top-level-await vite-plugin-static-copy
```

```typescript
// vite.config.ts
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    viteStaticCopy({
      targets: [
        {
          // pnpm hoists `.pnpm` to the workspace root — adjust the `..` count
          // for your layout (one level up from a single-package repo; two
          // levels up from an `apps/<name>/` in a monorepo).
          src: path.resolve(
            __dirname,
            '../../node_modules/.pnpm/tfhe@*/node_modules/tfhe/tfhe_bg.wasm',
          ),
          dest: '',
        },
      ],
    }),
  ],
  build: { target: 'esnext' },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
    // Only `tfhe` stays raw. Do NOT also exclude '@cofhe/sdk' or '@cofhe/react'.
    exclude: ['tfhe'],
  },
  assetsInclude: ['**/*.wasm'],
  resolve: {
    // The default tweetnacl entry is the slow build; the SDK expects the fast variant.
    alias: { tweetnacl: 'tweetnacl/nacl-fast.js' },
  },
});
```

### Anti-pattern: excluding `@cofhe/sdk` from pre-bundling

The intuition "exclude the whole SDK because WASM" is wrong and causes a non-obvious failure:

- The SDK has CJS-only transitive deps (notably **`iframe-shared-storage`**).
- When Vite pre-bundles a dep, esbuild wraps its CJS exports so `import { x } from 'cjs-pkg'` works.
- If you exclude `@cofhe/sdk` from pre-bundling, Vite serves the SDK source raw — *and its imports raw too* — so `import { constructClient } from 'iframe-shared-storage'` hits the browser as `import { x } from <cjs-file>` and throws:

> Uncaught SyntaxError: The requested module '/@fs/.../iframe-shared-storage/dist/index.js' does not provide an export named 'constructClient'

`optimizeDeps.include: ['iframe-shared-storage']` does **not** fix this — when a dep is excluded, Vite doesn't redirect imports inside it to the pre-bundled copy. Only exclude `tfhe` (the WASM-bearing package); let the rest pre-bundle normally.

### Sub-app composition in a monorepo

If a shell app imports a sub-app as a workspace package, the shell's Vite config has to **repeat** the WASM plumbing — pre-bundling is per-bundle, so the shell's bundle won't inherit the sub-app's plugins. Apply the same plugins + `optimizeDeps.exclude: ['tfhe']` + static-copy target in the shell's `vite.config.ts`.

## Vite — blank-page diagnostic checklist

When a Vite app using `@cofhe/sdk` renders a blank page, work through these in order:

1. **DevTools console: `does not provide an export named 'X'`** → CJS-interop failure. Verify `optimizeDeps.exclude` is **only** `['tfhe']`, never the whole SDK.
2. **`[vite-plugin-static-copy] No items found`** → the glob is wrong for your layout. The glob is resolved from the app's `cwd` (the directory containing `vite.config.ts`), not the workspace root. For a pnpm monorepo at `apps/<name>/`, use `../../node_modules/.pnpm/tfhe@*/...`.
3. **Top-level-await build error** → `vite-plugin-top-level-await` not installed/registered, or `build.target` / `optimizeDeps.esbuildOptions.target` not set to `'esnext'`.
4. **Stale dep cache** → After changing `optimizeDeps`, clear: `rm -rf node_modules/.vite && vite`. Vite caches by config hash but stale `.vite/deps` can survive when imports change shape.

## Webpack (non-Next.js) and other bundlers

The same principles apply: load `.wasm` natively, allow top-level await, don't externalize the SDK server-side. Specific plugin names differ; the recipes for Next.js (Webpack) and Vite above give the shape to translate from.

## Gotchas

- **None of the Next.js config applies to a Vite app** and vice versa. The `transpilePackages` knob has no Vite equivalent; the Vite WASM plugin has no Next.js equivalent. Don't copy half a recipe.
- **`instrumentation.ts` (Next.js)** is too late for any polyfill that affects SDK import — it runs *after* page modules import. If you need a Node polyfill, use `NODE_OPTIONS=--require ./preload.cjs` instead.
- **WASM mime type** on production servers — your CDN or static host must serve `.wasm` as `application/wasm`. Some defaults (S3, certain CDNs) serve `application/octet-stream` and the browser refuses to instantiate it.
