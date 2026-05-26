# Lookup recipes — fhenix-sdk

This file teaches Claude how to find current information about `@cofhe/sdk`. **Prefer the user's installed types first** — they match the pinned version exactly.

## Find @cofhe/sdk method signatures

### Option A: User has @cofhe/sdk installed (preferred)

```
find node_modules/@cofhe/sdk -name '*.d.ts' | head
```

The `dist/` folder ships flat files for each subpath module (verify against the installed `package.json#exports`):

```
node_modules/@cofhe/sdk/dist/core.d.ts
node_modules/@cofhe/sdk/dist/permits.d.ts
node_modules/@cofhe/sdk/dist/web.d.ts
node_modules/@cofhe/sdk/dist/node.d.ts
node_modules/@cofhe/sdk/dist/adapters.d.ts
node_modules/@cofhe/sdk/dist/chains.d.ts
```

Read `core.d.ts` for the top-level client (`createCofheClient`, `createCofheConfig`, `Encryptable`, `FheTypes`, etc.); `permits.d.ts` for permit utilities.

### Option B: Fetch from the public repo

Default branch is `master`. SDK source lives at `packages/sdk/<area>/` (areas: `core`, `permits`, `web`, `node`, `adapters`, `chains`):

```
WebFetch https://raw.githubusercontent.com/FhenixProtocol/cofhesdk/master/packages/sdk/core/index.ts
WebFetch https://raw.githubusercontent.com/FhenixProtocol/cofhesdk/master/packages/sdk/permits/index.ts
```

Browse via:

```
gh api repos/FhenixProtocol/cofhesdk/contents/packages/sdk -H "Accept: application/vnd.github+json"
```

## Find CofheError codes

```
grep -rn "CofheError" node_modules/@cofhe/sdk/dist/
```

The error class is typed with discriminated codes. Read the union to enumerate.

Remote alternative:

```
gh api repos/FhenixProtocol/cofhesdk/contents/packages/sdk/core/error.ts -H "Accept: application/vnd.github.raw"
```

The enum is `CofheErrorCode` in `core/error.ts`. Each member maps to a `SCREAMING_SNAKE_CASE` string value used as `err.code`.

## Find the installed @cofhe/sdk version

```
npm list @cofhe/sdk
# or
cat node_modules/@cofhe/sdk/package.json | grep '"version"'
```

For the latest published version:

```
npm view @cofhe/sdk version
```

## Find Encryptable types

```
grep -rn "Encryptable" node_modules/@cofhe/sdk/dist/   # local
# or via grep on the fetched index.ts
```

## Find example usage in real apps

| Repo | What it shows |
|---|---|
| [poc-sealed-bid-auction](https://github.com/FhenixProtocol/poc-sealed-bid-auction) | `decryptForTx().withoutPermit()` after `FHE.allowPublic`; full settle loop |
| [miniapp-equle](https://github.com/FhenixProtocol/miniapp-equle) | Per-game permit naming; `decryptForTx` for claim-victory; clean hook decomposition |
| [encrypted-secret-santa](https://github.com/FhenixProtocol/encrypted-secret-santa) | Both `decryptForView` AND `decryptForTx().withPermit()` in one app |
| [poc-shielded-stablecoin](https://github.com/FhenixProtocol/poc-shielded-stablecoin) | SSR-safe Proxy singleton; minimal hooks |
| [selective-disclosure-demo](https://github.com/FhenixProtocol/selective-disclosure-demo) | Sharing-permit scoping for selective disclosure |

Use `WebFetch` for raw file pulls; grep by hook name (`useCofhe`, `usePermit`, etc).

## Find canonical hook patterns

```
https://raw.githubusercontent.com/FhenixProtocol/poc-shielded-stablecoin/master/packages/nextjs/hooks/useCofhe.ts
https://raw.githubusercontent.com/FhenixProtocol/poc-shielded-stablecoin/master/packages/nextjs/hooks/usePermit.ts
https://raw.githubusercontent.com/FhenixProtocol/miniapp-equle/main/packages/cofhe-nextjs/src/app/hooks/useCofhe.ts
```

## Deprecated symbols — if you find them, the doc is stale

These appear in older blog posts, docs, and templates but are **deprecated** or **removed** in the current `@cofhe/sdk`. If a recipe surfaces them, treat the source as outdated:

- **`decryptHandle(handle, type, ...)`** — kept as a thin alias for back-compat. Prefer `decryptForView(handle, type).withPermit().execute()` (or `decryptForTx(...)` if you need on-chain verify).
- **`.encrypt()` / `.decrypt()`** as builder terminators — replaced by `.execute()`. Every builder (`encryptInputs`, `decryptForView`, `decryptForTx`) finalizes on `.execute()`.
- **`Result<T>` tuple return pattern** (`{ success, data, error }`) from legacy `cofhejs` — gone. Methods either return values directly or throw `CofheError`. See `concepts/error-handling.md`.
- **`cofhejs.initialize(...)` auto-permit** — no longer auto-creates. Call `client.permits.getOrCreateSelfPermit(...)` explicitly. See `concepts/permits.md`.
- **`FHE.decrypt(ct)` / `FHE.getDecryptResultSafe(ct)`** (Solidity side) — the legacy on-chain poll loop is gone. Current flow: off-chain `decryptForTx().execute()` + on-chain `FHE.verifyDecryptResult(...)`. See the fhenix-contracts skill.

If you see any of these in a fetched doc or example, switch to the current pattern.

## Docs

- https://cofhe-docs.fhenix.zone/client-sdk/ (conceptual)
- https://fhenix.mintlify.app/client-sdk/ (more current API references)
- https://www.fhenix.io/blog/decryption-in-cofhe-evolved (authoritative narrative for the view vs tx split)

For API specifics, prefer the SDK source over the docs.
