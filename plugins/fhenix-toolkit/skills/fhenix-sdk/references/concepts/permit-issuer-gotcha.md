# Permit `issuer` — "Invalid issuer signature"

## What

A CoFHE permit is EIP-712. The backend recovers the signer from the signature and compares it against the declared `issuer` field. If they don't match, the threshold network refuses the decrypt with an opaque "invalid issuer signature" rejection.

The match is exact: address-bytes equal address-bytes. There is no "issuer chain", no fallback, no `tx.origin`. Every permit-related failure where the signature is "wrong" is, in practice, an issuer-vs-signer mismatch.

## The rule

**Always derive `issuer` from the connected client. Never hardcode.**

```typescript
// CORRECT — issuer is whatever the wallet client is signing as
const snapshot = cofheClient.getSnapshot();
const issuer = snapshot.account;            // matches the signer for any signer mode
const permit = await cofheClient.permits.createSelf({ issuer });
```

```typescript
// WRONG — hardcoded address
const issuer = eoaAddress;                  // but client is connected with the SA
const permit = await cofheClient.permits.createSelf({ issuer });
// → backend recovers signer = SA, but issuer = EOA → "invalid issuer signature"
```

The auto-creation path in `getOrCreateSelfPermit(undefined, undefined, { issuer, name, expiration })` defaults `issuer = walletClient.account.address` and is safe **as long as** the wallet client's account is the one that will actually sign. The trap is only when you call `createSelf({ issuer: <something-else> })` manually.

## EOA vs smart account

| Wallet client signs as... | `issuer` must be... |
|---|---|
| Raw EOA (default viem `createWalletClient`) | EOA address |
| Smart account via EIP-1271 adapter (e.g. `smartWalletViemAdapter`) | Smart account address |

In smart-account mode the wallet client's `account.address` is the SA, not the underlying EOA. As long as you derive `issuer` from `client.getSnapshot().account`, you get the right one automatically.

## Smart account not deployed → ERC-6492-wrapped signature

EIP-1271 verification reads `isValidSignature(...)` from the SA contract. If the contract isn't deployed yet at the time of the permit signing, the wallet client returns an **ERC-6492-wrapped** signature (the bytes end in `…6492…6492`). The threshold network does not currently unwrap ERC-6492; the permit is rejected.

The fix is to ensure the SA is deployed before any first permit signature. Common patterns:

```typescript
// Lazy-deploy guard inside ensurePermit:
const code = await publicClient.getCode({ address: smartAccountAddress });
if (!code || code === '0x') {
  // Send any low-cost tx (a self-transfer of 0, a no-op) via the smart account
  // so the bundler deploys it. Wait for the receipt.
  const userOp = await smartAccountClient.sendTransaction({
    to: smartAccountAddress,
    value: 0n,
  });
  await publicClient.waitForTransactionReceipt({ hash: userOp });
}
// Now permit signing produces a non-6492 signature.
const permit = await cofheClient.permits.getOrCreateSelfPermit(/* ... */);
```

This particularly hits read-only users — auditors, compliance reviewers, anyone who would otherwise never trigger a write tx and therefore never have their SA deployed.

## Stuck bad permit — recovery

A mismatched permit stays in the client's store as "active." `getOrCreateSelfPermit` returns it without regenerating, so the user is stuck — the same broken permit comes back no matter how many times they retry.

Workflow to recover:

```typescript
const active = cofheClient.permits.getActivePermit();
if (active) cofheClient.permits.removePermit(active.hash);
// Now getOrCreateSelfPermit will sign a fresh one.
const fresh = await cofheClient.permits.getOrCreateSelfPermit(/* ... */);
```

Expose this as a "regenerate permit" button somewhere users can find it.

## Permits keyed by `(chainId, account)`

`getActivePermit()` returns the permit for the **connected** account on the **current** chain. If you switch wallets mid-session, the previous account's permit isn't reachable via `getActivePermit` — but it's still in `getPermits()`. Pass it explicitly via `.withPermit(permitObject)` if you need a cross-account decrypt.

## Gotchas

- **`issuer` is case-sensitive at the byte level after checksumming.** Don't lowercase, don't checksum manually — pass through what the client gives you.
- **A permit signed by Alice cannot decrypt Bob's data**, even if Bob `FHE.allow`'d Alice's address. The threshold network checks both the permit signature AND the on-chain ACL. Wrong direction.
- **EIP-1271 contracts must be `view` and gas-efficient.** A reverting `isValidSignature` looks identical to "invalid issuer" from the SDK side.
- **Permits don't transfer between clients.** If your app rebuilds `cofheClient` (chain change, wallet change, hot reload), the permit store may reset. Re-call `getOrCreateSelfPermit`.
- **The error message is always opaque.** "Invalid issuer signature" is what you get for: wrong issuer, expired permit (treated as no-permit by some endpoints), ERC-6492 unwrap failure, or signer chain mismatch. Diagnose by checking the snapshot vs the permit.

## Diagnostic snippet

```typescript
const snap = cofheClient.getSnapshot();
const active = cofheClient.permits.getActivePermit();
console.log({
  // What's the wallet signing as right now?
  connected_account: snap.account,
  wallet_client_account: snap.walletClient?.account,
  chain_id: snap.chainId,
  // What's in the permit?
  permit_issuer: active?.issuer,
  permit_expiration: active?.expiration,
  permit_name: active?.name,
});
```

If `connected_account !== permit_issuer`, that's your bug. If they match and you still see "invalid issuer signature," check ERC-6492 wrapping (SA not deployed).
