# `allowTransient` — single-tx ACL grants

## What

`FHE.allowTransient(ct, addr)` grants `addr` access to ciphertext `ct` **only for the remainder of the current transaction**. Once the tx ends, the grant is gone — no storage write persists.

Contrast with `FHE.allow(ct, addr)`, which writes a persistent row to the ACL mapping.

## When to use it

Use `allowTransient` whenever a downstream contract needs to operate on a handle **inside the same transaction** and there's no reason for the grant to outlive that tx:

```solidity
// Cross-contract call: payroll contract needs `salary` for one transfer.
// Don't bloat the persistent ACL — transient is enough.
FHE.allowTransient(salary, address(payroll));
payroll.process(salary);
// After this tx ends, payroll's access is gone. salary's persistent
// ACL is unchanged.
```

## When NOT to use it

- **Across transactions.** If the decryptor or downstream operation runs in a *later* tx (any SDK decrypt call, any user-driven follow-up), the transient grant is already gone. Use `FHE.allow` instead.
- **For frontend decryption.** The SDK reads the ACL in a separate JSON-RPC call (or via the threshold network); by then the transient bit has cleared. The right pattern is `FHE.allow(ct, user)` + `decryptForView`.
- **For "let this contract use it next tx."** That's what `FHE.allowThis(ct)` does — and `allowThis` is persistent. `allowTransient(ct, address(this))` would clear before the next tx ever runs.

## The rule

```
Decrypted off-chain (SDK call) or used in a future tx?
└── FHE.allow(ct, addr)               [persistent]

Used inside this tx only, by another contract you're calling?
└── FHE.allowTransient(ct, addr)      [transient, cheaper]

Used by this contract in any tx?
└── FHE.allowThis(ct)                 [persistent — required for re-use]
```

## Cost

Transient is cheaper than persistent — no storage write. For high-frequency cross-contract handoffs (e.g. routing handles through multiple hops in one tx), the savings add up. For one-shot grants, the difference is small but never zero.

## Gotchas

- **Both persistent and transient can be granted to the same `(ct, addr)`** — the persistent one wins for any check outside the granting tx.
- **`isPubliclyAllowed` and similar query functions reflect the current state**, including transient grants made earlier in the same tx.
- **Re-granting transient inside a loop is redundant** — once granted within the tx, the access exists for the rest of the tx.
- **There's no `disallowTransient`** — the grant lasts until tx-end, period.
