# Hard rules — fhenix-sdk

These rules are timeless across SDK versions. Violating them produces silent failures more often than loud ones.

## Rule 1: Lazy init — keys fetched on first `.execute()`

`createCofheClient(config)` is synchronous; it returns immediately. The heavy work (fetching FHE keys, initializing the TFHE WASM module) happens lazily on the first `await client.<builder>(...).execute()` call — whether that's `encryptInputs`, `decryptForView`, or `decryptForTx`.

**Implication:** don't try to `await createCofheClient` (it isn't async) and don't write loading-spinner code around it. Spin only around the first `.execute()`.

## Rule 2: `.connect(publicClient, walletClient)` is required before any `.execute()`

The client needs chain context. Call `.connect` from a hook that runs after wagmi reports `isConnected`:

```
useEffect(() => {
  if (!isConnected || !publicClient || !walletClient) return;
  cofheClient.connect(publicClient, walletClient);
}, [isConnected, publicClient, walletClient, chainId, address]);
```

Without `.connect`, calls fail with opaque "no chain" errors.

## Rule 3: Permits are explicit — no auto-creation

Legacy `cofhejs.initialize(...)` auto-generated a self-permit. `@cofhe/sdk` does NOT. Call `client.permits.getOrCreateSelfPermit(...)` before any decrypt that needs a permit — see `concepts/permits.md` for the current signature.

## Rule 4: Permit expiration is in Unix SECONDS

`Date.now()` returns milliseconds. The SDK expects seconds. Always divide:

```
expiration: Math.floor(Date.now() / 1000) + 30 * 24 * 3600   // 30 days
```

A wrong unit gives you an instantly-expired permit and an opaque rejection on the first decrypt call.

## Rule 5: `decryptForTx(...).withoutPermit()` requires on-chain `FHE.allowPublic`

The threshold network checks: if no permit accompanies the decrypt, the handle must be public.

```
// Solidity
FHE.allowPublic(ct);

// TypeScript
const result = await client.decryptForTx(ctHash).withoutPermit().execute();
```

If `allowPublic` is missing, the SDK call silently fails (rejection without a message obviously about ACL).

## Rule 6: SSR-safe singleton via Proxy

In Next.js or any SSR framework, the SDK touches browser globals (`window`, `crypto.subtle`, WASM). Wrap the client in a Proxy so it lazy-initializes only on the client. See `concepts/init-singleton.md`.

## Rule 7: `as any` at the wagmi boundary

The `InEuintXX` struct's shape — `{ ctHash, securityZone, utype, signature }` — doesn't match what wagmi infers from your ABI (which expects a generic input). Cast `as any` for now, or wrap in a typed factory.

## Rule 8: Encryption is per-call, batches return arrays

`encryptInputs([Encryptable.uint64(a), Encryptable.uint16(b)]).execute()` returns an ARRAY of encrypted values in input order. Don't pass single values where you need an array, and don't try to encrypt across multiple calls if order matters.

## Rule 9: Result shape differs by decrypt mode

- `decryptForView(...).execute()` returns `{ decryptedValue }` only.
- `decryptForTx(...).execute()` returns `{ decryptedValue, signature }`.

Don't destructure `signature` from a `decryptForView` result — it doesn't exist.

## Rule 10: Errors are typed, not Result-wrapped

`@cofhe/sdk` throws `CofheError` (typed). Catch with `try`/`catch`, not the legacy `Result<T>` tuple pattern. Discriminate via `error.code`. See `concepts/error-handling.md`.
