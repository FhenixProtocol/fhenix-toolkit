# Gotcha catalog — fhenix-review

The recurring traps in confidential CoFHE code. Grouped by domain. Use as a checklist while walking through PR diffs.

---

## Solidity / on-chain

### G1. Missing `FHE.allowThis` after a stored encrypted write

Every encrypted op whose result is stored to state needs `FHE.allowThis(result)`. Without it, the contract can't reuse the handle next transaction.

**Smell:** any line `state.x = FHE.<op>(...)` not followed by an `allow*` call.

### G2. `allowTransient` is Solidity-identical to `allow`

`FHE.allowTransient(ct, addr)` looks like a tighter permission, but at the Solidity level it produces the same ACL update as `FHE.allow(ct, addr)`. The transient lifetime is enforced by the network, not the contract. Don't rely on it for in-contract security boundaries.

### G3. Downcasting type doesn't truncate the ciphertext

`FHE.asEuint8(euint64Val)` changes the type tag but does NOT truncate the underlying value. Subsequent operations may produce surprising results if the original value exceeded `uint8` range.

### G4. `trivialEncrypt` exposes plaintext in calldata

`FHE.asEuintXX(<literal>)` calls `trivialEncrypt` under the hood; the literal is visible in calldata. Only safe for constants you don't mind revealing. **Critical** if the literal is meant to be private.

### G5. Branching on `ebool` doesn't work

`if (FHE.gt(a, b))` / `require(ebool)` / `while (ebool)` — none of these behave like the developer expects. The Solidity comparison is against the ciphertext handle (a `uint256`), not the encrypted value. Use `FHE.select(cond, a, b)`.

### G6. Legacy `FHE.decrypt` / `getDecryptResultSafe` references

The on-chain async decrypt flow (`FHE.decrypt(ct)` + later `getDecryptResultSafe(ct)`) has been removed from the library. All decryption is now SDK-mediated (`decryptForView` / `decryptForTx` + on-chain `FHE.verifyDecryptResult` for tx-bound reveals). Any contract still calling `FHE.decrypt` is stale code that must be migrated — flag and convert per the `fhenix-contracts` skill's decryption-flow decision tree. See also G14–G15 for the SDK-side pairing rules.

### G7. Uninitialized encrypted state acts as zero

`euint32 x;` in storage operates as if it were `FHE.asEuint32(0)`. Don't use "is this set?" semantics on encrypted state; track presence with a plaintext flag.

### G8. `allowGlobal` vs `allowPublic` semantics

Both exist in the codebase. The exact difference is subtle and version-specific. **Verify against `FHE.sol` source before relying on either.**

### G9. Random with seed=0 isn't deterministic

`FHE.random*(seed=0)` uses a system-chosen seed. Don't assume two calls with seed=0 return the same value. For deterministic randomness, pass a non-zero seed.

### G10. Order of `allow*` calls matters

`FHE.allowThis(x)` (and other allows) must be called **before** emitting events or returning. The off-chain network observes handles via events and expects ACL bits set by then.

### G11. Storing plaintexts longer than needed

After an on-chain decrypt, the plaintext is a public blockchain fact. If the contract stores it in state, it's discoverable forever. Zero the slot once you've acted on it, or store only the minimum needed.

### G12. Both branches of `FHE.select` always execute

There's no short-circuit. If one arm is expensive (a multiplication, a chain of operations), both costs are paid. Don't write `FHE.select(cond, cheap, expensive)` thinking the expensive side won't run when `cond` is true.

### G13. `FHE.select` type unification

Both arms must be the same encrypted type. For `eaddress`, the false arm needs an `eaddress` too — `FHE.asEaddress(address(0))` is a common sentinel.

---

## SDK / off-chain

### G14. `decryptForView` always needs a permit

No auto-permit anymore. Calling `decryptForView` without first running `getOrCreateSelfPermit` fails. Always pair them.

### G15. `decryptForTx().withoutPermit()` requires on-chain `FHE.allowPublic`

The threshold network checks: no permit → must be public. Forgetting `FHE.allowPublic` produces a silent rejection.

### G16. Permit expiration is Unix SECONDS

`Date.now()` returns ms. The SDK expects seconds. Use `Math.floor(Date.now() / 1000) + duration`.

### G17. SDK encryption is lazy

`createCofheClient` returns immediately. Heavy init (key fetch, WASM) only happens on the first `.execute()`. Don't write loading spinners around `createCofheClient`.

### G18. Permits don't auto-create on init

Legacy `cofhejs` auto-generated a permit during initialize. `@cofhe/sdk` does NOT. Code migrated from cofhejs often forgets this.

### G19. `Result<T>` → typed `CofheError`

Legacy `cofhejs` used a `Result<T>` tuple pattern (`const [err, value] = await ...`). `@cofhe/sdk` throws `CofheError`. Use `try`/`catch`, not destructure.

### G20. `InEuintXX` doesn't match wagmi's inferred ABI types

The struct shape (`ctHash`, `securityZone`, `utype`, `signature`) doesn't fit wagmi's inferred type. Most callsites cast `as any`. Consider a typed wrapper.

### G21. `permitVersion` re-render trick

React hooks that depend on "is there a valid permit?" need a bumpable counter so they re-run after `createSelf` / `removePermit`. Missing this causes stale-permit displays.

### G22. ACP JSON is a capability token

An Access Control Permit, once issued, can be used by whoever holds it. Treat the JSON as a one-shot capability — don't post it in chats, don't leave it in URLs.

---

## Confidentiality vs. anonymity / side channels

### G23. Confidentiality is not anonymity

FHE hides values, not the transaction graph. Observers see who called what, when, with which gas. If the dApp's privacy claim implies sender/receiver unlinkability, that requires additional layers (mixers, shielded pools).

### G24. Gas pattern leakage

Different ciphertext sizes / op chains have measurably different gas costs. A "private auction" can leak whether the bid was high or low if gas profile correlates with op count on a particular branch.

### G25. Event-emit leakage

Even with encrypted event arguments, the *fact* that the event fired (and the contract, function, and tx hash) is public. If the existence of an event reveals confidential state, the privacy promise is broken.

### G26. tx-graph observability

Sequences of calls — "Alice → AMM → DEX → Bob" — are fully public, even if amounts are encrypted. Privacy-preserving routing is a separate problem from confidential math.

### G27. Encrypted `approve` is not at parity

ERC-20's `approve` doesn't have an encrypted-token equivalent that matches its semantics. Operator grants (the actual pattern) are public binary flags with expiry — different security/privacy posture. Don't claim parity.

### G28. Operator grants are public

`setOperator(addr, until)` is plaintext. Anyone can see who's an operator for whom. That's intentional (discoverable revocation) but means the *fact* of delegation is observable.

---

## Standards / interop

### G29. Mixing standards in one app

`ERC20Confidential` ↔ FHERC20 ↔ ERC-7984 are not drop-in interchangeable. Wrappers exist between some pairs (see `rfq-demo/contracts/cofhe/FHERC20Wrapper.sol`), but none are universal. Audit any code that operates on tokens from multiple standards.

### G30. ERC-7984 is a draft

The Ethereum draft EIP may break between revisions. Pinning to a specific date's fork freezes you to whatever the EIP looked like then. Note this in the review if relevant.
