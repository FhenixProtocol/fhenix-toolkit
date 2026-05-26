# Sharing permits — selective off-chain disclosure

## What

A **sharing permit** lets an issuer (Alice) authorize a specific recipient (Bob) to decrypt one or more of Alice's encrypted handles **without** granting on-chain ACL access. The transfer of capability happens off-chain via a signed JSON blob; the chain never records the disclosure.

This is the foundation of selective-disclosure patterns: prove a fact to one party (an auditor, a counterparty, a regulator) without leaking it to anyone else, including on-chain observers.

## The three-party setup

```
Alice (issuer)   ──┐
                   │
                   ├── signs sharing-permit JSON  ──► OOB send ──►   Bob (recipient)
                   │       (recipient: Bob's addr,                       │
                   │        scope: this app, this name, until X)         │
                   │                                                     ▼
                   │                                          Bob imports + signs as recipient
                   │                                                     │
Threshold network ◄┴──────  Bob calls decryptForView with the imported permit  ─┤
       │                    Network checks: issuer signed for this recipient    │
       └─── returns plaintext to Bob ◄──────────────────────────────────────────┘
```

The chain has no record. The only observers are Alice, Bob, and the threshold network.

## Concrete code

### Alice — issue and serialize

```typescript
// Verify exact API shape via references/lookup-recipes.md before authoring.
// Surface as of the canonical example apps:

const sharing = await aliceClient.permits.createSharing({
  issuer: aliceClient.getSnapshot().account!,
  recipient: bobAddress,
  name: 'salary-disclosure-for-auditor',
  expiration: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days
});

// Serialize for out-of-band transfer.
const json = aliceClient.permits.serialize(sharing);

// Send `json` to Bob through whatever channel you trust:
// signed email, encrypted messenger, in-app file drop, etc.
```

### Bob — import and use

```typescript
// Bob receives `json` and imports it.
const recipientPermit = await bobClient.permits.importShared(json);
// importShared internally has Bob sign as the recipient,
// proving possession of the recipient address's private key.

// Now bobClient.permits.getActivePermit() returns recipientPermit,
// and Bob can decrypt Alice's handles within the permit's scope.

const { decryptedValue } = await bobClient
  .decryptForView(aliceCtHash, FheTypes.Uint64)
  .execute();
```

### On-chain side — minimal

The contract does NOT need to call `FHE.allow(ct, bobAddress)`. The sharing permit chains Alice's existing access to Bob without consulting on-chain state:

```solidity
// Alice's grant suffices:
FHE.allow(salary, alice);
// The sharing permit Alice signs off-chain is enough for the threshold network
// to grant Bob's read.
```

(Compare: a `decryptForView` from Alice's own client needs `FHE.allow(ct, alice)` and Alice's self-permit. A sharing-permit decrypt from Bob's client needs `FHE.allow(ct, alice)` *plus* the signed sharing permit. The on-chain side is identical.)

## The three permit types

| Type | Purpose | Issuer | Recipient field |
|---|---|---|---|
| `SelfPermit` | Alice decrypts Alice's data | Alice | Alice (same address) |
| `SharingPermit` | Alice authorizes Bob | Alice | Bob's address |
| `RecipientPermit` | What Bob holds locally after importing the sharing permit | Alice (original signer) | Bob |

`createSelf` produces `SelfPermit`; `createSharing` produces `SharingPermit`; `importShared` produces `RecipientPermit` from a signed sharing permit.

## The rule

- **Treat the serialized JSON as a capability token.** Anyone who gets the blob can import it as Bob (if they have Bob's signer). Don't post it publicly.
- **Scope expiration tightly.** Sharing permits are stronger than self permits — short expirations limit blast radius if the JSON leaks.
- **Name explicitly.** Use a `name` that reflects the purpose (`salary-disclosure-2026Q1-auditor`) — this is what shows up in audit trails and the recipient's permit list.
- **No on-chain ACL change needed.** If your contract already `FHE.allow`'d the issuer, the sharing permit chain is enough. Don't double-grant.

## Canonical example

- **Selective disclosure demo — sharing permit scoping.**
  https://github.com/FhenixProtocol/selective-disclosure-demo
  → Grep for `createSharing` / `importShared` / `serialize` in the app code to find the canonical call sites and JSON-handoff UX.

## Gotchas

- **The JSON cannot be re-issued.** If Bob loses it before importing, Alice has to `createSharing` again. There is no replay.
- **The recipient signature happens at import time, in Bob's client.** Bob's wallet pops up on `importShared`. If Bob is a smart account, the same EIP-1271 considerations apply (see `concepts/permit-issuer-gotcha.md`).
- **Bob's `getActivePermit()` may return either his own self-permit or the imported recipient permit** — they share the active-slot. Use `getPermits()` to enumerate, and `selectActivePermit(hash)` to switch.
- **The chain still sees Bob calling the threshold-network endpoint.** What it doesn't see is the value or that Alice authorized this specific disclosure. If observer-anonymity of the disclosure act matters, you need additional layering.
- **Sharing permits do NOT replace on-chain `FHE.allow(ct, X)`** for any address that needs to *write* into the contract using the value. They only authorize off-chain decryption.
