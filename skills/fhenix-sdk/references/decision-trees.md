# Decision trees — fhenix-sdk

## Decryption mode: which of the three?

```
Does the user need to call a contract function using this value?
├── Yes  →  decryptForTx
│           ├── Is the value FHE.allowPublic'd on-chain?
│           │   ├── Yes  →  decryptForTx(ctHash).withoutPermit().execute()
│           │   └── No   →  decryptForTx(ctHash).withPermit().execute()
│           │              (getOrCreateSelfPermit first if no permit)
│           └── Returns { decryptedValue, signature }
│              Contract calls FHE.verifyDecryptResult(decryptedValue, signature)
│
└── No   →  decryptForView(ctHash, FheTypes.<type>).execute()
            Requires a permit (getOrCreateSelfPermit if none)
            Returns { decryptedValue } only
```

## Permit creation: which API call?

```
Do you already have a valid cached permit?
├── Yes  →  client.permits.getActivePermit()
└── No   →  Are you generating once and forgetting (most apps)?
            ├── Yes  →  client.permits.getOrCreateSelfPermit(undefined, undefined, {issuer, name, expiration})
            └── No, recreate every time   →  Use PermitUtils.createSelf or the low-level API — verify shape via lookup recipes
```

## Permit name scoping: app-wide or per-cycle?

```
Does the encrypted state cycle (per-game, per-auction, per-round)?
├── Yes  →  Name per-cycle:    name: `myapp-${gameId}`
│           Why: stale permits from previous rounds will fail silently
└── No   →  App-wide name:      name: 'myapp'
```

## ACL pairing matrix — the single most important decision

| Off-chain SDK call | Requires on-chain `allow*` |
|---|---|
| `decryptForView(...).execute()` | `FHE.allow(ct, user)` + valid permit |
| `decryptForTx(...).withPermit().execute()` | `FHE.allow(ct, user)` (the permit binds the user) |
| `decryptForTx(...).withoutPermit().execute()` | `FHE.allowPublic(ct)` |

Pairing wrong → silent rejection by the threshold network.

## SSR strategy: which framework?

```
Are you using Next.js / Remix / any SSR-rendering React framework?
├── Yes  →  Wrap cofheClient in a Proxy (see concepts/init-singleton.md)
│           Plus: gate access in hooks with isConnected + isInitialized flags
└── No   →  Plain createCofheConfig + createCofheClient is fine
            But still call .connect after wallet is ready
```
