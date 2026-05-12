---
name: fhenix-review
description: Use when reviewing or auditing confidential code for Fhenix CoFHE — both on-chain (FHE.sol) and off-chain (@cofhe/sdk). Catches ACL bugs, decrypt-flow mismatches, plaintext leaks, confidentiality-vs-anonymity confusion, and the 25+ recurring gotchas in this catalog. Activates on PR-review flows, "audit this" / "is this safe" prompts, or when reading code that already imports FHE.sol or @cofhe/sdk.
---

# fhenix-review — audit confidential code

You activate on review/audit contexts: a PR is open, the user says "audit this" or "is this safe", or the code under inspection already imports `@fhenixprotocol/cofhe-contracts/FHE.sol` or `@cofhe/sdk`.

## What to look for, in order

1. **ACL bugs** — missing `FHE.allowThis` after a stored encrypted write; mismatched ACL pairing (e.g., `decryptForTx().withoutPermit()` without `allowPublic`); `allowSender` granted to an attacker-controlled `msg.sender` for someone else's handle.
2. **Decrypt-flow mismatches** — `decryptForView` used where `decryptForTx` is needed (or vice versa); legacy `FHE.decrypt(...)` / `getDecryptResultSafe(...)` references that should have been migrated to the SDK-mediated flow.
3. **Plaintext leaks** — `trivialEncrypt(literal)` for secret values; plaintext values stored / emitted alongside their encrypted twins; revert paths that branch on what should be private.
4. **Branching on `ebool`** — `if (FHE.gt(...))`, `require(FHE.gt(...))`, `while (...)` — must be `FHE.select`.
5. **Confidentiality ≠ anonymity** — the dApp claims privacy but leaks via gas patterns, event-fact, or tx graph.
6. **Encrypted approval / allowance** — anywhere code tries to use ERC-20 `approve`/`transferFrom` semantics for ciphertexts.
7. **Randomness sourcing** — `FHE.randomEuintXX` used where user-contributed entropy is required (auctions, gifts, fair shuffles).
8. **Input validation** — `InEuintXX` accepted without "Proof of Plaintext Input" where the protocol's invariants depend on the cleartext meeting bounds.
9. **Permit hygiene** — `expiration` in milliseconds not seconds; stale per-cycle permits; ACPs leaked publicly.
10. **Standards mixing** — ERC20Confidential + FHERC20 + ERC-7984 interoperating in one app without an explicit wrapper.

Full catalog: `references/gotchas.md`.

## Default review workflow

Walk the changed code in this order:

1. **Read the contracts.** For each function:
   - Trace every encrypted op → confirm `FHE.allowThis(result)` if stored.
   - For each `allow*` call → check the pairing matrix.
   - For each `FHE.decrypt` → confirm async handling on the read side.
   - For each `select` → confirm both arms are the same encrypted type and neither leaks.
2. **Read the SDK callsites.** For each `decryptForView` / `decryptForTx`:
   - Pair with the on-chain `allow*` for the same handle.
   - Confirm permit expiration is in seconds.
   - Confirm error handling uses `CofheError`, not `Result<T>`.
3. **Read the events.** Any plaintext leaked? Any event whose mere occurrence reveals private state?
4. **Check the threat model**, even informally. What's the worst observer? What can they see (values, graph, timing, gas)?

## When to escalate to the deep-audit subagent

For substantive review (PR with >200 LOC of FHE code; security-sensitive merges; pre-launch audits), invoke the **`fhe-reviewer` subagent** (at `agents/fhe-reviewer.md`). It loads the full gotcha catalog and security checklist up front and produces a prioritized report.

Invoke it via the Agent tool with `subagent_type: fhe-reviewer` (when available in the plugin) or just by reading its prompt and applying the same workflow.

## Output shape

A review should produce one of:

- **No issues** — explain what you checked and why you're confident.
- **Concerns** — bulleted list, each with severity (Critical / High / Medium / Low / Note), what's wrong, and a suggested fix or follow-up question.

Cite line numbers from the user's code. Quote ~3-10 lines around each concern.

## Concepts to read on demand

- `concepts/confidentiality-vs-anonymity.md` — the distinction reviewers must constantly enforce.
- `concepts/pattern-leakage.md` — gas / events / tx-graph as side channels.
- `concepts/proof-of-plaintext-input.md` — validating `InEuintXX` arrivals.
- `concepts/reveal-labels.md` — categorizing every decrypt as UI-view or protocol-reveal.

## Looking up specifics

When verifying a suspicious claim about an FHE.sol function or SDK method, **look it up live** (see `references/lookup-recipes.md`). Never assume from training data — the libraries evolve.
