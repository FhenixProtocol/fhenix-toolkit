---
name: fhenix-contracts
description: Use when working on Solidity files importing @fhenixprotocol/cofhe-contracts/FHE.sol or fhenix-confidential-contracts, or using euint*/ebool/eaddress types. Teaches confidential contract patterns — branchless updates with FHE.select, the four ACL verbs, the two decryption flows, and the confidential-token standards picker. Activates on Fhenix CoFHE contract work.
---

# fhenix-contracts — write confidential Solidity for Fhenix CoFHE

You activate when the user is writing or editing Solidity that uses Fhenix's FHE library: files importing `@fhenixprotocol/cofhe-contracts/FHE.sol` or `fhenix-confidential-contracts`, files using `euint*` / `ebool` / `eaddress` types, or prompts like "build a confidential X contract."

## Hard rules — never violate

Tight summary. Full explanations: `references/hard-rules.md`.

1. **No `if` / `require` on `ebool`** → use `FHE.select(cond, a, b)`. (`concepts/branchless-update.md`)
2. **`FHE.allowThis(x)` after every stored encrypted write** — or the contract can't reuse `x` next tx. (`concepts/allow-cascade.md`)
3. **Avoid encrypted `mul` / `div` when `shr` works** — bit-shifts approximate ratios cheaply. (`concepts/bit-shift-ratio.md`)
4. **No ciphertext allowance** — replace ERC-20 `approve` with the operator pattern. (`concepts/operator-pattern.md`)
5. **`trivialEncrypt` exposes plaintext in calldata** — only safe for non-secret constants.
6. **Confidentiality is not anonymity** — FHE hides values, not the transaction graph.
7. **Order `allow*` before emit / return** — the off-chain network observes handles in event/return order and expects ACL bits set first.
8. **Uninitialized encrypted state acts as zero** — `euint32 x;` reads as `FHE.asEuint32(0)`; track presence with a separate plaintext flag.
9. **Both arms of `FHE.select` always execute** — no short-circuit. For `eaddress`, use `FHE.asEaddress(address(0))` as the false-arm sentinel.
10. **`allowPublic` / `allowGlobal` are irreversible** — there is no `revokePublic`. Treat them as "publish to the world."
11. **Use ERC-1167 clones, not `new`, for large FHE contracts** — `new` embeds child creation code; FHE contracts bust the 24KB EIP-170 limit fast.
12. **`allowTransient` vs `allow` — pick by lifetime** — transient grants don't survive the current tx; never use for SDK decrypts. (`concepts/allow-transient.md`)

## The four ACL verbs

| Verb | Grants | Call when |
|---|---|---|
| `FHE.allowThis(ct)` | The current contract | After every encrypted write that's stored — mandatory. |
| `FHE.allowSender(ct)` | `msg.sender` | The caller will decrypt off-chain (e.g. show their own balance). |
| `FHE.allow(ct, addr)` | Specific address | Pass the ciphertext to another contract, or grant a known user. |
| `FHE.allowPublic(ct)` | Everyone | Intentional protocol reveal. Pair with off-chain `decryptForTx(...).withoutPermit()` + on-chain `FHE.verifyDecryptResult(...)`. |

Decision tree: `references/decision-trees.md` (ACL section).

## The two decryption flows

When a value needs to leave the encrypted domain, pick one:

1. **Client decrypts + contract verifies.** Contract calls `FHE.allowPublic(ct)` or `FHE.allow(ct, user)`. Client calls `decryptForTx(ctHash).withoutPermit().execute()` (or `.withPermit()`), gets `{decryptedValue, signature}`, and calls back into the contract which validates with `FHE.verifyDecryptResult(...)`. Used in auction settlement (allowPublic + withoutPermit) and Equle's claim-victory.
2. **Client-side reveal only.** Contract calls `FHE.allow(ct, user)`. Client calls `decryptForView(ctHash, utype).execute()` — purely off-chain. Contract never sees the plaintext. Used in Secret Santa's target reveal.

Decision tree: `references/decision-trees.md` (decryption-flow section).

## Confidential-token standards picker

| Standard | Use when |
|---|---|
| `ERC20Confidential` (Fhenix's own) | Vanilla confidential ERC-20; Fhenix's standard is sufficient. |
| Vendored FHERC20 | You need to extend transfer semantics (callbacks, AVS, custom approval flows). |
| ERC-7984 (Ethereum draft) | You want cross-protocol composability with the emerging Ethereum standard. |

Detailed picker: `references/concepts/confidential-token-standards.md`.

## Concepts to read on demand

Each `references/concepts/<name>.md` is one focused pattern with links to canonical examples in real public repos. **Read on demand** — don't load them all up front:

- `branchless-update.md` — `FHE.select` instead of `if` / `require`.
- `allow-cascade.md` — re-grant access after every derivation; permissions don't inherit.
- `handle-lifecycle-backfill.md` — re-grant helpers, O(N) backfill on new authorized addresses, and the `grantBalanceAccess` pattern for FHERC20 external handles.
- `allow-transient.md` — when to reach for `FHE.allowTransient` vs persistent `FHE.allow`.
- `encrypted-input.md` — `InEuintXX` handling from client to chain.
- `bit-shift-ratio.md` — cheap percentage approximations via `FHE.shr`.
- `operator-pattern.md` — replacing ERC-20 allowance for ciphertexts.
- `randomness-via-entropy.md` — user-contributed entropy XOR (no trusted seed).
- `confidential-token-standards.md` — picking ERC20Confidential / FHERC20 / ERC7984.

## Looking up the FHE.sol API surface

For function signatures, op×type availability, exact ACL semantics, or gas behavior, **never recall — always look up**. Read `references/lookup-recipes.md` for the canonical commands. The on-chain library evolves; lookup recipes always find current truth.

## Default workflow for any encrypted-state function

1. Receive `InEuintXX calldata` from the client (if user-supplied input).
2. Convert via `FHE.asEuintXX(in)` — this verifies the signature and registers the handle.
3. Perform encrypted operations, branchless via `FHE.select`.
4. **Call `FHE.allowThis(result)`** for anything stored.
5. Call `FHE.allowSender(result)` if the caller needs to decrypt it off-chain.
6. Call `FHE.allow(result, addr)` for any downstream contract that needs access.
7. Pick a reveal path (one of the two flows above) — and **don't reveal what doesn't need to be revealed**.

Verify each step against a concept file before writing. When in doubt, look up.
