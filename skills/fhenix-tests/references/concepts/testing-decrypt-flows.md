# Testing the decrypt flows

## What

CoFHE decryption is SDK-mediated. The legacy on-chain `FHE.decrypt(ct)` + `getDecryptResultSafe(ct)` poll loop has been removed; all decrypt paths now run through `client.decryptForView(...)` or `client.decryptForTx(...)`. Tests must model the new shape, not the legacy on-chain async pattern.

## The two flows your tests need to cover

### A. `decryptForView` — UI-only reveal

```
const ctHash = await contract.balanceOf(user.address);
const { decryptedValue } = await client
  .decryptForView(ctHash, FheTypes.Uint64)
  .execute();
expect(decryptedValue).to.equal(expected);
```

Test must ensure:

1. Contract called `FHE.allow(ct, user)` for the user reading the value.
2. User has a valid permit (`getOrCreateSelfPermit` was called).
3. Result shape is `{ decryptedValue }` — no `signature`.

### B. `decryptForTx` — client decrypt + on-chain verify

```
// Contract calls FHE.allowPublic(ct) inside requestSettlement
await contract.requestSettlement();
const ctHash = await contract.publicHandle();

// Client decrypts via SDK
const { decryptedValue, signature } = await client
  .decryptForTx(ctHash).withoutPermit().execute();

// Settle by calling back with the proven plaintext
await contract.finalizeSettlement(decryptedValue, signature);
// Contract verifies via FHE.verifyDecryptResult(decryptedValue, signature)
```

Test must ensure:

1. Contract called `FHE.allowPublic(ct)` (for `withoutPermit`) OR `FHE.allow(ct, user)` + permit (for `withPermit`).
2. Settlement function calls `FHE.verifyDecryptResult(decryptedValue, signature)` — assert this both succeeds with a valid signature AND reverts with a tampered one.

## Latency expectations

`execute()` is the single async terminator. In **MOCK** mode it resolves in milliseconds. In **TESTNET** mode it resolves in 2–10 seconds (real threshold network). Don't put 50 testnet decrypt tests in a tight loop; budget your CI accordingly.

## Failure-path tests worth writing

- **Tampered signature** — call `finalizeSettlement` with a corrupted signature; assert revert.
- **Wrong `utype`** — call `decryptForView(ct, FheTypes.Uint32)` when the actual type is `Uint64`; assert garbage / revert.
- **Missing permit** for `decryptForView` — assert rejection.
- **Missing `FHE.allowPublic`** with `withoutPermit` — assert rejection.
- **Expired permit** — set expiration to the past; assert rejection.

These cover the gotcha-driven test classes; cross-reference with `fhenix-review/references/gotchas.md`.

## Foundry equivalent

For Foundry mock testing, the threshold network's decrypt is simulated. Use the mock library's helper to "fulfill" a pending decrypt and produce a mock signature:

```
contract.requestSettlement();
mockDecryptFulfill(ctHash, plaintext, signature);   // helper name varies — verify against cofhe-foundry-mocks
contract.finalizeSettlement(plaintext, signature);
```

Verify the exact helper API against the live `cofhe-foundry-mocks` source — see `references/lookup-recipes.md`.

## Gotchas

- **`decryptForView` returns `{ decryptedValue }` only**; `decryptForTx` returns `{ decryptedValue, signature }`. Don't destructure `signature` from a view result.
- **`signature` from `decryptForTx` is opaque bytes** from the threshold network, NOT a wallet signature. Don't confuse with wallet permit signatures.
- **Real testnet runs are slow.** Time-out generously (30s+) and don't chain many in CI.
- **Mock-only tests miss real ACL enforcement** — re-run ACL-sensitive cases against testnet before claiming coverage.
- **Don't poll after `execute()`** — the `await` IS the wait. The legacy `getDecryptResultSafe` poll loop doesn't exist anymore.
