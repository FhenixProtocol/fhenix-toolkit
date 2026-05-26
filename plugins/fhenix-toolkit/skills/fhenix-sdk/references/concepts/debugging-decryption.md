# Debugging decryption — when `decryptForView` / `decryptForTx` fails

## What

A failing decrypt almost always falls into one of three buckets:

1. **ACL mismatch** — the contract never `FHE.allow`'d the issuer for this handle, or the on-chain `allow*` doesn't match the SDK call's pairing.
2. **Permit problem** — wrong issuer, expired, missing, stuck-bad.
3. **Transient network state** — coprocessor lag, threshold network busy, RPC flake.

This file is the diagnostic playbook. Work top-down: log state, query the on-chain ACL directly, then layer retries.

## Step 1 — log the client state

```typescript
const snap = cofheClient.getSnapshot();
console.log('account (ACL key):       ', snap.account);
console.log('walletClient.account:    ', snap.walletClient?.account);
console.log('chainId:                 ', snap.chainId);
console.log('active permit hash:      ', cofheClient.permits.getActivePermitHash());
console.log('active permit:           ', cofheClient.permits.getActivePermit());
console.log('handle being decrypted:  ', handle.toString());
console.log('utype passed to SDK:     ', utype);
```

What to look for:
- `snap.account` should equal the permit's `issuer`. Mismatch → see `concepts/permit-issuer-gotcha.md`.
- `snap.walletClient?.account` should equal `snap.account`. Mismatch → wallet client wasn't reconnected after a signer-mode change.
- `chainId` should match the chain where the handle was created. Cross-chain handles aren't valid.

## Step 2 — query the on-chain ACL directly

The threshold network rejects without telling you *why*. The most common silent failure is a missing on-chain `FHE.allow(ct, user)`. Verify by reading the ACL contract:

```typescript
// 1. Find the ACL contract address from the TaskManager
const acl = await publicClient.readContract({
  address: TASK_MANAGER_ADDRESS,
  abi: [{
    name: 'acl', type: 'function', inputs: [],
    outputs: [{ type: 'address' }], stateMutability: 'view',
  }],
  functionName: 'acl',
});

// 2. Check if the issuer has access to this handle
const isAllowed = await publicClient.readContract({
  address: acl,
  abi: [{
    name: 'isAllowed', type: 'function',
    inputs: [
      { name: 'handle', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  }],
  functionName: 'isAllowed',
  args: [BigInt(handle), permit.issuer],
});

console.log('on-chain isAllowed:', isAllowed);
```

If `isAllowed` is `false`, decryption will fail no matter what the signature says — the contract that created the handle never granted the issuer access. The on-chain side needs `FHE.allow(ct, issuer)`. See the fhenix-contracts skill — specifically `fhenix-contracts/references/concepts/allow-cascade.md` for the per-op rule and `fhenix-contracts/references/concepts/handle-lifecycle-backfill.md` for the multi-write-path case.

Don't hardcode `TASK_MANAGER_ADDRESS` — read it from `@cofhe/sdk/chains` or the user's contract config; it varies per chain.

## Step 3 — verify the pairing

| Off-chain call | Required on-chain `allow*` |
|---|---|
| `decryptForView(...).execute()` | `FHE.allow(ct, user)` + valid permit |
| `decryptForTx(...).withPermit().execute()` | `FHE.allow(ct, user)` |
| `decryptForTx(...).withoutPermit().execute()` | `FHE.allowPublic(ct)` |

Mismatched pairing produces the same opaque rejection as a missing ACL row. See `concepts/decrypt-view-vs-tx.md`.

## Step 4 — retry on transient failures

Coprocessor lag is real. A handle freshly written may not be decryptable for a second or two. Retry with backoff:

```typescript
async function decryptWithRetry<T>(
  handle: bigint,
  type: FheTypes,
  maxRetries = 3,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await ensurePermit();
      const { decryptedValue } = await cofheClient
        .decryptForView(handle, type)
        .withPermit()
        .execute();
      if (decryptedValue !== undefined) return decryptedValue as T;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error('Decryption failed after retries');
}
```

Tune `maxRetries` and the backoff multiplier for the chain. Base Sepolia at quiet times resolves in ~1 second; busy times can stretch to 5-10. Don't retry forever — surface a user-visible error after 3-4 attempts so they can refresh.

## Step 5 — handle-keyed cache for stale detection

Decrypted plaintext is only valid as long as the on-chain handle is unchanged. Cache `(handle, plaintext)` together; on every load, fetch the current handle and only re-decrypt on mismatch:

```typescript
type Cached = { handle: string; value: string };
const cache: Cached | null = readCache(userKey, contractAddress, recordId);
const currentHandle = await getEncryptedHandle(recordId);

if (cache && cache.handle === currentHandle.toString()) {
  // Cache valid — no decrypt
  setValue(BigInt(cache.value));
} else {
  // Stale — re-decrypt
  await ensurePermit();
  const value = await cofheClient
    .decryptForView(currentHandle, FheTypes.Uint64)
    .withPermit()
    .execute();
  writeCache(userKey, contractAddress, recordId, currentHandle, value);
  setValue(value as bigint);
}
```

Pair this with a contract event subscription. Events that mutate stored encrypted values (`SalaryUpdated`, `BidPlaced`, etc.) are your signal that any cached decryption *might* be stale. Bump a refresh counter, re-run the cache check, stale rows silently re-decrypt while everything else stays put.

## Common failure modes — quick lookup

| Symptom | First check |
|---|---|
| "Invalid issuer signature" | `concepts/permit-issuer-gotcha.md` — issuer ≠ signer |
| "Decryption failed" / opaque reject, fresh decrypt | On-chain `isAllowed` for the issuer (this file, Step 2) |
| "Decryption failed" / opaque reject, was working | Stale permit; rotate via `removePermit` + `getOrCreateSelfPermit` |
| Handle returns 0 from `confidentialBalanceOf` | Account never received tokens; skip the decrypt, treat as zero |
| `decryptForView` returns wrong-looking number | Wrong `utype` (passed `Uint32` for a `Uint64` handle, or v.v.) |
| Permit popup appears repeatedly | Concurrent `ensurePermit()` calls; see `concepts/permit-dedup.md` |
| First decrypt is slow, later ones fast | Expected — TFHE WASM init runs lazily on first `execute()` |

## Gotchas

- **`isAllowed` reads the persistent ACL only.** `allowTransient` grants don't show up in this view; if a contract used `allowTransient` for a decrypt path, that's a bug regardless. (Transient is for in-tx cross-contract handoffs only.)
- **The ACL contract address moves between SDK versions.** Don't hardcode — read it from TaskManager every time (or cache for the session).
- **`isAllowed(handle, account)` returns `false` for the *zero* handle.** Skip the check if handle is 0; the decrypt would have been skipped anyway.
- **Don't paper over an ACL bug with retries.** If `isAllowed` is `false`, retrying won't help — fix the contract.
