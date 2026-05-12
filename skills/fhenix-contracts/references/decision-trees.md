# Decision trees — fhenix-contracts

## ACL: which `allow*` verb?

```
Will the current contract use this handle in a future tx?
├── Yes  →  FHE.allowThis(ct)              [mandatory]
└── No   →  skip allowThis

Will another address need to decrypt this handle off-chain?
├── Yes, msg.sender (the caller)   →  FHE.allowSender(ct)
├── Yes, a known address           →  FHE.allow(ct, addr)
├── Yes, anyone                    →  FHE.allowPublic(ct)
└── No                             →  skip

Will another contract need this handle on-chain (cross-contract op)?
├── Yes  →  FHE.allow(ct, otherContract)
└── No   →  skip

Will the handle be revealed as part of settlement / claim?
├── Yes  →  FHE.allowPublic(ct), then off-chain decryptForTx().withoutPermit(),
│           then on-chain FHE.verifyDecryptResult(plaintext, signature) in the follow-up tx
└── No   →  consider client-side decryptForView only
```

Common combinations:

- **Confidential balance:** `allowThis` + `allowSender` (contract uses it; user reads their own).
- **Auction winner reveal:** `allowThis` + `allowPublic` (contract uses it; settle reveals to all).
- **Cross-contract transfer (FHERC20 → another):** `allowThis` + `allow(ct, tokenContract)`.
- **Encrypted gift target:** `allowThis` + `allow(ct, recipient)` (recipient reads via `decryptForView`).

## Decryption flow: which of the two?

```
Does the user need an on-chain follow-up call using the value?
├── Yes  →  CLIENT DECRYPTS + CONTRACT VERIFIES
│           Off-chain: decryptForTx(ctHash).withPermit().execute()
│                      → { decryptedValue, signature }
│                      OR decryptForTx(...).withoutPermit() if FHE.allowPublic was called
│           On-chain: FHE.verifyDecryptResult(plaintext, signature) inside the follow-up function
│
└── No   →  CLIENT-SIDE REVEAL ONLY
            Off-chain: decryptForView(ctHash, utype).execute()
            On-chain: just FHE.allow(ct, user); never decrypted again on-chain
```

Real-world picks:

- **Auction settlement** — client decrypt + on-chain verify: contract calls `FHE.allowPublic`, client calls `decryptForTx(...).withoutPermit()`, settlement tx calls `FHE.verifyDecryptResult`.
- **Equle claim-victory** — client decrypt + on-chain verify (user proves they won; contract validates the signature).
- **Secret Santa target reveal** — client-side `decryptForView` only (UI shows the gift target; never on-chain).

## Confidential token standard: which?

```
Is your use case a vanilla confidential ERC-20?
├── Yes  →  ERC20Confidential
│           (npm: `fhenix-confidential-contracts`)
└── No   →  Do you need to extend transfer semantics
            (callbacks, AVS, custom approval flows)?
            ├── Yes  →  Vendor FHERC20
            │           (see rfq-demo's contracts/cofhe/FHERC20.sol)
            └── No   →  Do you want cross-protocol composability with the Ethereum draft?
                        ├── Yes  →  ERC-7984
                        │           (see selective-disclosure-demo's MockERC7984Token.sol)
                        └── No   →  Default to ERC20Confidential
```

See `concepts/confidential-token-standards.md` for details.
