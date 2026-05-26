# Hard rules — fhenix-contracts

These rules are timeless and version-independent. Violating any of them produces a bug; some bugs are silent — the contract compiles, but ciphertexts are inaccessible or revealed unintentionally.

## Rule 1: No `if` / `require` / `while` on encrypted booleans

`ebool` is a ciphertext handle. Solidity's `if` / `require` / `while` need runtime booleans. Encrypted control flow doesn't exist in Solidity; both branches always execute.

```
// Wrong — does not behave like you think
ebool isHigher = FHE.gt(a, b);
if (isHigher) { ... }
require(isHigher, "too low");

// Right
euint64 newValue = FHE.select(isHigher, a, b);
FHE.allowThis(newValue);
```

See `concepts/branchless-update.md`.

## Rule 2: `FHE.allowThis(result)` after every stored encrypted op

Every time you store an encrypted value to state (or pass it to another contract), call `FHE.allowThis(x)`. Without it, the contract cannot operate on `x` in any future transaction — the threshold network's ACL rejects access.

```
// Wrong — count is unreachable next tx
count = FHE.add(count, FHE.asEuint32(1));

// Right
count = FHE.add(count, FHE.asEuint32(1));
FHE.allowThis(count);
```

See `concepts/allow-cascade.md`.

## Rule 3: Avoid encrypted `mul` and `div` when `shr` suffices

Encrypted multiplication and division are expensive. For powers-of-two ratios and approximations, use `FHE.shr`:

- `x / 2`   →  `FHE.shr(x, 1)`
- `x / 4`   →  `FHE.shr(x, 2)`
- `x * 7/8` ≈ `FHE.sub(x, FHE.shr(x, 3))`
- `x * 9/8` ≈ `FHE.add(x, FHE.shr(x, 3))`

This is how RFQ approximates 112.5% / 125% tiers without `mul` / `div`. See `concepts/bit-shift-ratio.md`.

## Rule 4: No allowance for ciphertexts

`approve` / `transferFrom` cannot be replicated for encrypted balances — the amount is encrypted, so the allowance check would have to happen against a ciphertext, and `require` doesn't work on `ebool` (Rule 1).

Use the operator pattern instead: `setOperator(operator, until)` + `isOperator(...)`. See `concepts/operator-pattern.md`.

## Rule 5: `trivialEncrypt` exposes plaintext

`FHE.asEuintXX(<literal>)` calls `trivialEncrypt(literal, ...)` under the hood. The literal travels through calldata in cleartext. Only safe for constants you don't mind revealing (loop bounds, sentinels). For user-supplied secret values, the user must encrypt off-chain and pass an `InEuintXX`.

## Rule 6: Confidentiality is not anonymity

FHE hides values, not the transaction graph. Observers see:

- That an address called your contract
- Which function they called
- Gas used
- That events fired (and any plaintext fields in them)

Confidential dApps that need anonymity layer mixers or shielded pools on top of FHE.

## Rule 7: Order of `allow*` calls matters

Call `FHE.allowThis(x)` (and other `allow*` calls) **before** emitting events or returning. The off-chain network observes handles and expects ACL bits to be set by the time it sees them.

## Rule 8: Uninitialized encrypted state acts as zero

`euint32 x;` in storage starts at the zero handle. Operations on uninitialized state act as if it were `FHE.asEuint32(0)`. Don't rely on "is this set" semantics — track presence with a separate plaintext flag if needed.

## Rule 9: Both branches of `FHE.select` always execute

There's no short-circuit. If one arm is expensive, both costs are paid. For `eaddress`, the false arm must also be an `eaddress` — use `FHE.asEaddress(address(0))` as a sentinel if no meaningful prior value exists.

## Rule 10: `allowPublic` / `allowGlobal` are irreversible

`FHE.allowPublic(ct)` (alias: `FHE.allowGlobal(ct)`) makes the ciphertext decryptable by anyone. There is no `revokePublic` or `revokeGlobal`. Once a handle is published, every observer who recorded that handle can decrypt it forever.

Treat these calls as "publish this value to the world." Only reach for them when the value is settlement-revealed by design (winning auction bid after `requestSettlement`, claim-of-victory plaintext, etc.). See `concepts/branchless-update.md` and the canonical sealed-bid auction example.

## Rule 11: Use ERC-1167 clones, not `new`, for large FHE contracts

Solidity's `new Contract(...)` embeds the child's full creation code in the factory's bytecode. An FHE contract is rarely under 24 KB on its own; a factory that `new`s one busts EIP-170 (24,576-byte runtime limit) almost immediately.

Use OpenZeppelin's `Clones` (ERC-1167 minimal proxies) instead:

```solidity
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

address impl;  // deployed once, holds all the logic

function createChild(...) external returns (address) {
    address proxy = Clones.clone(impl);
    IChild(proxy).initialize(...);   // Initializable, not constructor
    return proxy;
}
```

Children must be `Initializable` (no `constructor`) and the factory holds the implementation address. This trades a small per-call cost (proxy delegatecall) for keeping the factory itself well under the size limit, regardless of how big the child grows.

## Rule 12: `allowTransient` ≠ `allow` — pick by lifetime

`FHE.allowTransient(ct, addr)` grants access only for the rest of the current transaction; nothing persists. Use it for in-tx cross-contract handoffs to avoid bloating the persistent ACL. Use `FHE.allow` whenever the grant must outlive the tx (any SDK decrypt, any user follow-up). See `concepts/allow-transient.md` for the decision tree.
