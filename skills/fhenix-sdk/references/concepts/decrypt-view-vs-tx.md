# Decrypt — view vs tx

## What

`@cofhe/sdk` splits decryption into two purpose-built builder methods, which together yield three usable modes:

- `decryptForView` — UI display only. Permit-gated. Returns `{ decryptedValue }`.
- `decryptForTx` — for on-chain follow-up. Returns `{ decryptedValue, signature }`. Two variants: `.withPermit()` and `.withoutPermit()`.

Pick based on **what you'll do with the value next** (display, or call a contract).

## The three modes (one View, two Tx variants)

### decryptForView — UI only, never on-chain

```
const { decryptedValue } = await cofheClient
  .decryptForView(ctHash, FheTypes.Uint64)
  .execute();
// display decryptedValue to the user. Never round-trips on-chain.
```

Requires a permit (`getOrCreateSelfPermit` first). Best for: showing the user their encrypted balance, displaying their personal data.

### decryptForTx().withPermit() — on-chain follow-up, scoped permit

```
const { decryptedValue, signature } = await cofheClient
  .decryptForTx(ctHash).withPermit().execute();

await writeContractAsync({
  abi, functionName: 'claimVictory',
  args: [gameId, decryptedValue, signature],
});
// Contract calls FHE.verifyDecryptResult(decryptedValue, signature) to validate.
```

Use when the contract called `FHE.allow(ct, user)` and the user holds the permit.

### decryptForTx().withoutPermit() — protocol-public reveal

```
const { decryptedValue, signature } = await cofheClient
  .decryptForTx(ctHash).withoutPermit().execute();
// Use in a settlement call: contract earlier called FHE.allowPublic(ct).
```

Use when the contract called `FHE.allowPublic(ct)`. No permit needed because anyone can decrypt.

## The pairing matrix — the most important table in this skill

| Off-chain method | Requires on-chain `allow*` |
|---|---|
| `decryptForView(...).execute()` | `FHE.allow(ct, user)` and a valid permit |
| `decryptForTx(...).withPermit().execute()` | `FHE.allow(ct, user)` (permit binds the user) |
| `decryptForTx(...).withoutPermit().execute()` | `FHE.allowPublic(ct)` |

Wrong pairing produces silent-ish failures: the SDK rejects without a clear "ACL missing" message.

## Canonical examples

- **Auction settle (allowPublic + withoutPermit).**
  https://github.com/FhenixProtocol/poc-sealed-bid-auction
  → `packages/nextjs/hooks/useAuction.ts`. `decryptForTx(winnerCt).withoutPermit().execute()` after `requestSettlement` ran `FHE.allowPublic`.

- **Secret Santa target reveal (decryptForView only).**
  https://github.com/FhenixProtocol/encrypted-secret-santa
  → `packages/nextjs/hooks/useSecretSanta.ts`. `decryptForView(targetCt, FheTypes.Uint32).execute()` — never round-trips on-chain.

- **Equle claim-victory (decryptForTx withoutPermit).**
  https://github.com/FhenixProtocol/miniapp-equle
  → `packages/cofhe-nextjs/src/app/hooks/useDecryptEquation.ts`. Contract `finalizeGame()` called `allowPublic` first; client `decryptForTx(...).withoutPermit()` then `ClaimVictory(decryptedValue, signature)`.

## Gotchas

- **`decryptForView` always needs a permit.** Even for values the user "owns." No exception.
- **Wrong `utype` parameter** in `decryptForView(ct, FheTypes.Uint32)` when the actual type is `Uint64` returns garbage (interpreted as the wrong type).
- **`signature` from `decryptForTx` is opaque bytes**, NOT a wallet signature. Don't confuse with wallet permit signatures.
- **`.execute()` is the one async terminator.** Builder calls (`.withPermit()`, `.withoutPermit()`) are synchronous chain steps; only `.execute()` returns a Promise.
- **Latency is variable.** Network busy-ness affects time-to-result. Surface a spinner.
