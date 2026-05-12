---
name: fhenix-sdk
description: Use when working with @cofhe/sdk in TypeScript — encrypting inputs, managing permits, choosing decrypt modes (decryptForView vs decryptForTx), or wiring CoFHE into a Next.js / wagmi / viem dApp. Activates on imports of @cofhe/sdk or its subpaths, on hooks named useCofhe* or usePermit*, and on prompts like "encrypt this input" or "set up cofhe in Next.js."
---

# fhenix-sdk — integrate @cofhe/sdk in dApps

You activate when the user is writing TypeScript that uses Fhenix's `@cofhe/sdk` — initializing the client, encrypting inputs, managing permits, decrypting handles, or building React/Next.js hooks around any of the above.

## Hard rules — never violate

1. **Encryption is lazy.** SDK keys aren't fetched until the first `client.encryptInputs(...).execute()`. Don't await `createCofheClient` for crypto-readiness; only the first `.execute()` triggers the heavy init.

2. **`.connect(publicClient, walletClient)` is mandatory before any `.execute()`.** Without chain context, calls fail with opaque "no chain" errors.

3. **Permits are explicit — no auto-creation.** Unlike legacy `cofhejs`, the new SDK does NOT auto-generate permits. Call `client.permits.getOrCreateSelfPermit(...)` before any `decryptForView` or `decryptForTx().withPermit()` call. Verify the current signature via `references/lookup-recipes.md`.

4. **Permit expiration is Unix SECONDS, not milliseconds.** `Date.now()` returns ms — divide by 1000.

5. **`decryptForTx(...).withoutPermit()` requires on-chain `FHE.allowPublic(ct)`.** Otherwise the threshold network refuses. Pair them.

6. **The `InEuintXX` struct doesn't match wagmi's ABI inference** — cast `as any` at the wagmi boundary, or build a typed wrapper.

7. **SSR-unsafe by default.** In Next.js, wrap the client in a Proxy so it lazy-instantiates only in the browser. See `references/concepts/init-singleton.md`.

Full rule list: `references/hard-rules.md`.

## The three decryption modes

| Mode | Use when | Returns | Requires on-chain |
|---|---|---|---|
| `decryptForView(ctHash, utype).execute()` | UI display only | `{ decryptedValue }` | `FHE.allow(ct, user)` + valid permit |
| `decryptForTx(ctHash).withPermit().execute()` | User will call back into a contract that runs `FHE.verifyDecryptResult` | `{ decryptedValue, signature }` | `FHE.allow(ct, user)` + valid permit |
| `decryptForTx(ctHash).withoutPermit().execute()` | Contract called `FHE.allowPublic`; anyone can decrypt | `{ decryptedValue, signature }` | `FHE.allowPublic(ct)` |

Decision tree: `references/decision-trees.md`.

## Default init flow

```
const config = createCofheConfig({ chains: [...] });
const cofheClient = createCofheClient(config);

// in your wallet-ready hook:
await cofheClient.connect(publicClient, walletClient);
```

For SSR / Next.js: wrap `cofheClient` in a Proxy in `services/cofhe-client.ts`. See `references/concepts/init-singleton.md`.

## Default encrypt flow

```
const [encrypted] = await cofheClient
  .encryptInputs([Encryptable.uint64(secretAmount)])
  .execute();

await writeContractAsync({
  abi, functionName: 'submit',
  args: [{
    ctHash: encrypted.ctHash,
    securityZone: encrypted.securityZone,
    utype: encrypted.utype,
    signature: encrypted.signature as `0x${string}`,
  } as any],
});
```

## Default permit flow

Real form per canonical examples (e.g. `miniapp-equle`'s `usePermit.ts`). The first two positional args are `publicClient` / `walletClient` overrides; options is the third:

```
const permit = await cofheClient.permits.getOrCreateSelfPermit(
  undefined,
  undefined,
  {
    issuer: address,
    name: `myapp-${gameId}`,                                       // scope per-cycle if state cycles
    expiration: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,    // 30 days, in SECONDS
  }
);

const { decryptedValue } = await cofheClient
  .decryptForView(ctHash, FheTypes.Uint64)
  .execute();
```

Verify the exact signature against `node_modules/@cofhe/sdk/dist/permits.d.ts` — see `references/lookup-recipes.md`.

## Concepts to read on demand

- `init-singleton.md` — SSR-safe Proxy singleton (Next.js / wagmi).
- `encrypt-input.md` — `Encryptable.uintN`, the struct cast, multi-input batching.
- `decrypt-view-vs-tx.md` — the three modes and their pairings with on-chain `allow*`.
- `permits.md` — self permits, ACP scoping, expiration, `permitVersion` re-render trick.
- `error-handling.md` — typed `CofheError`, recoverable vs fatal patterns.
- `hooks-pattern.md` — `useCofhe`, `usePermit`, Zustand integration.

## Looking up @cofhe/sdk API surface

For method signatures, type names, error codes, or version-specific shapes, **never recall — look up**. See `references/lookup-recipes.md` for the canonical commands (prefer the user's installed `node_modules/@cofhe/sdk/dist/*.d.ts` over remote sources).
