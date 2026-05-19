# Permits — lifecycle, scoping, expiration

## What

A permit is a signed authorization that lets the SDK ask the threshold network for plaintext on behalf of a user. Permits replace the legacy `cofhejs` auto-permit; they are now explicit, scoped, and time-bounded.

## Permit operations

The exact signatures are versioned — always verify against the installed `node_modules/@cofhe/sdk/dist/permits.d.ts` (see `references/lookup-recipes.md`). The canonical examples below mirror what `miniapp-equle/packages/cofhe-nextjs/src/app/hooks/usePermit.ts` does today.

```
// Get-or-create (idempotent — most apps use this).
// First two args are publicClient / walletClient overrides (pass undefined to use the connected ones).
// Third arg is the options bag.
const permit = await cofheClient.permits.getOrCreateSelfPermit(
  undefined,
  undefined,
  {
    issuer: address,
    name: 'myapp',
    expiration: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,  // SECONDS
  }
);

// Read the cached active permit
const active = cofheClient.permits.getActivePermit();

// Remove a permit by its hash
if (active) {
  cofheClient.permits.removePermit(active.hash);
}
```

For lower-level direct creation (sharing permits, manual construction), see `PermitUtils` and the `CreateSelfPermitOptions` / `CreateSharingPermitOptions` types in `packages/sdk/permits/types.ts` on the cofhesdk repo.

## Permit scoping — name strategy

The `name` field scopes the permit. Two strategies:

**App-wide** (state never cycles):
```
name: 'myapp'
```
Best for: persistent balances, identity, anything the user keeps for the lifetime of the dApp.

**Per-cycle** (state cycles between rounds):
```
name: `myapp-${gameId}`
```
Best for: per-game state, per-auction state. Avoids stale-permit failures when state rotates.

## Permit expiration — Unix seconds, not milliseconds

`Date.now()` returns ms. The SDK expects seconds.

```
expiration: Math.floor(Date.now() / 1000) + 30 * 24 * 3600   // 30 days from now
```

Forgetting the `/1000` gives you an instantly-expired permit and an opaque rejection on the first decrypt.

## `permitVersion` re-render trick

Permits live in the client. Hooks that depend on "is there a valid permit?" need a way to re-run when the permit changes. Pattern:

```
// in a Zustand store
permitVersion: 0,
bumpPermitVersion: () => set(s => ({ permitVersion: s.permitVersion + 1 })),

// in a hook
useEffect(() => {
  void permitVersion;   // referenced for the dep list
  // ... re-read permit state
}, [permitVersion]);
```

Bump `permitVersion` after `createSelf` / `removePermit`.

## Sharing permits — selective disclosure

The SDK supports **sharing permits**: the issuer signs a permit naming a specific recipient; the recipient can then decrypt the issuer's value via the threshold network. No one else can.

The relevant API surface (verify via `references/lookup-recipes.md`):

- `CreateSharingPermitOptions` — options type for sharing permits.
- `ImportSharedPermitOptions` — options for the recipient importing the signed permit.
- `PermitUtils` in `packages/sdk/permits/permit.ts` exposes the low-level creation; the canonical app-level usage is in the `selective-disclosure-demo` repo.

Conceptually:

1. Issuer creates a sharing permit scoped to a recipient address.
2. Issuer ships the serialized permit JSON to the recipient off-chain (out-of-band).
3. Recipient imports it into their own client and decrypts the issuer's value.
4. Chain has no record of the disclosure.

This is the selective-disclosure pattern: prove a fact to one party without revealing it on-chain. Exact method names and option fields vary across SDK versions — read the installed `dist/permits.d.ts` and the canonical example before authoring.

## Canonical examples

- **Equle — per-game permit naming.**
  https://github.com/FhenixProtocol/miniapp-equle
  → `packages/cofhe-nextjs/src/app/hooks/usePermit.ts`. Calls `getOrCreateSelfPermit(undefined, undefined, { issuer, name: \`equle${gameId}\`, expiration })` — the canonical 3-arg shape.

- **Secret Santa — app-wide permit.**
  https://github.com/FhenixProtocol/encrypted-secret-santa
  → `packages/nextjs/hooks/useSecretSanta.ts`. Calls `getOrCreateSelfPermit(undefined, undefined, { issuer, name: 'Secret Santa', expiration })`.

- **Selective disclosure — sharing permit scoping.**
  https://github.com/FhenixProtocol/selective-disclosure-demo
  → Grep for `createSharing` / `importShared` in the app code to find the canonical call sites.

## Gotchas

- **No auto-permit.** Calling `decryptForView` without a permit fails. Always `getOrCreateSelfPermit` first.
- **`expiration` is absolute (Unix seconds), not duration.** Use `Math.floor(Date.now() / 1000) + DURATION_SECONDS`.
- **Permits are per-client-instance.** A user reloading the page may lose them. Use SDK persistence (if any) or accept re-creating each visit.
- **sharing permits cross trust boundaries.** Treat the JSON as a capability token. Don't post it publicly and expect it to remain useful.
- **`name` is part of the permit's identity** — changing `name` invalidates lookup via `getActivePermit`.
