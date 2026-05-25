# Gotcha catalog — fhenix-review

The recurring traps in confidential CoFHE code. Grouped by domain. Use as a checklist while walking through PR diffs.

---

## Solidity / on-chain

### G1. Missing `FHE.allowThis` after a stored encrypted write

Every encrypted op whose result is stored to state needs `FHE.allowThis(result)`. Without it, the contract can't reuse the handle next transaction.

**Smell:** any line `state.x = FHE.<op>(...)` not followed by an `allow*` call.

### G2. `allowTransient` is Solidity-identical to `allow`

`FHE.allowTransient(ct, addr)` looks like a tighter permission, but at the Solidity level it produces the same ACL update as `FHE.allow(ct, addr)`. The transient lifetime is enforced by the network, not the contract. Don't rely on it for in-contract security boundaries.

### G3. Downcasting silently truncates (modular reduction, not saturation)

`FHE.asEuint8(euint64Val)` performs a real homomorphic narrowing — the FHE engine runs `<FheUint8>::cast_from(FheUint64)`, which discards the high bits inside the ciphertext (modular reduction to the target width). Decryption of `asEuint8(enc(300))` yields `300 mod 256 = 44`, not `300` and not a revert. There is no saturation, no overflow flag, and no on-chain check that the source fits in the target width.

**Smell:** any `FHE.asEuintN(x)` where `x` is wider than `N` and the surrounding code seems to assume the value "fits". If the protocol needs saturation or rejection on overflow, build it explicitly with `FHE.min(x, asEuintN(MAX))` or a range-check + `select`.

### G4. `trivialEncrypt` exposes plaintext in calldata

`FHE.asEuintXX(<literal>)` calls `trivialEncrypt` under the hood; the literal is visible in calldata. Only safe for constants you don't mind revealing. **Critical** if the literal is meant to be private.

### G5. Branching on `ebool` doesn't work

`if (FHE.gt(a, b))` / `require(ebool)` / `while (ebool)` — none of these behave like the developer expects. The Solidity comparison is against the ciphertext handle (a `uint256`), not the encrypted value. Use `FHE.select(cond, a, b)`.

### G6. Legacy `FHE.decrypt(ct)` initiator references

The on-chain `FHE.decrypt(ct)` initiator has been removed from the library. `getDecryptResultSafe` and `verifyDecryptResult` are still present in `FHE.sol` — they're the building blocks the SDK-mediated flow uses internally and on the verify side. What's gone is the contract-initiated async pattern where a contract called `FHE.decrypt(ct)` and later polled `getDecryptResultSafe(ct)`.

Any contract still calling `FHE.decrypt(ct)` directly is stale code that must be migrated to the SDK-mediated flow (`decryptForView` / `decryptForTx` + on-chain `FHE.verifyDecryptResult`). Flag and convert per the `fhenix-contracts` skill's decryption-flow decision tree. See also G14–G15 for the SDK-side pairing rules.

### G7. Uninitialized encrypted state acts as zero

`euint32 x;` in storage operates as if it were `FHE.asEuint32(0)`. Don't use "is this set?" semantics on encrypted state; track presence with a plaintext flag.

### G8. `allowGlobal` vs `allowPublic` — never recall from memory, always look up

Both names have appeared in the codebase at various points. Their semantic distinction has shifted across versions and you cannot reliably tell them apart from training data. **Always run the lookup recipe before reviewing code that uses either:**

```
gh api repos/FhenixProtocol/cofhe-contracts/git/trees/main?recursive=1 \
  | jq -r '.tree[] | select(.path | endswith("FHE.sol")) | .path' \
  | xargs -I{} curl -s "https://raw.githubusercontent.com/FhenixProtocol/cofhe-contracts/main/{}" \
  | grep -nE "function (allowGlobal|allowPublic)\b" -A 20
```

Quote the current signatures and natspec back into the review. If the code under review uses one but the live source only has the other (or has renamed it), that's a finding — the contract is targeting a stale version.

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

No auto-permit anymore. Calling `decryptForView` without first running `getOrCreateSelfPermit` fails. Always pair them. The real signature is `getOrCreateSelfPermit(publicClient, walletClient, { issuer, name, expiration })` — three positional args; the canonical app form is `(undefined, undefined, { issuer, name, expiration })` to reuse the connected clients. Code calling `getOrCreateSelfPermit({ ... })` with a single options object is wrong (fabricated signature) — flag it.

### G15. `decryptForTx` pairing matrix

The threshold network enforces the pairing between SDK call and on-chain ACL:

- `decryptForTx(ct).withoutPermit().execute()` requires on-chain `FHE.allowPublic(ct)`. Forgetting `FHE.allowPublic` produces a silent rejection.
- `decryptForTx(ct).withPermit().execute()` requires on-chain `FHE.allow(ct, user)` AND a valid permit for `user`. If either is missing the call rejects.

Always confirm the on-chain `allow*` AND the off-chain permit form match the SDK call's variant.

### G16. Permit expiration is Unix SECONDS

`Date.now()` returns ms. The SDK expects seconds. Use `Math.floor(Date.now() / 1000) + duration`.

### G17. SDK encryption is lazy

`createCofheClient` returns immediately. Heavy init (key fetch, WASM) only happens on the first `.execute()`. Don't write loading spinners around `createCofheClient`.

### G18. Permits don't auto-create on init

Legacy `cofhejs` auto-generated a permit during initialize. `@cofhe/sdk` does NOT. Code migrated from cofhejs often forgets this.

### G19. `Result<T>` → typed `CofheError`

Legacy `cofhejs` used a `Result<T>` tuple pattern (`const [err, value] = await ...`). `@cofhe/sdk` throws `CofheError`. Use `try`/`catch`, not destructure.

Real error-code enum members (PascalCase, mapping to `SCREAMING_SNAKE` string values) include: `NotConnected`, `PermitNotFound`, `DecryptFailed`, `DecryptReturnedNull`, `InvalidUtype`, `SealOutputFailed`, `FetchKeysFailed`, `UnsupportedChain`, `ZkVerifyFailed`, `InvalidPermitData`, `AccountUninitialized`, `ChainIdUninitialized`, and more (verify via `references/lookup-recipes.md`). Code that `switch`-es on hand-invented strings like `'KEYS_NOT_INITIALIZED'` / `'PERMIT_REQUIRED'` / `'ACL_DENIED'` / `'NETWORK_ERROR'` is wrong — those codes do not exist in the SDK.

### G20. `InEuintXX` doesn't match wagmi's inferred ABI types

The struct shape (`ctHash`, `securityZone`, `utype`, `signature`) doesn't fit wagmi's inferred type. Most callsites cast `as any`. Consider a typed wrapper.

### G21. `permitVersion` re-render trick

React hooks that depend on "is there a valid permit?" need a bumpable counter so they re-run after `createSelf` / `removePermit`. Missing this causes stale-permit displays.

### G22. Sharing-permit JSON is a capability token

The SDK exposes **sharing permits** (real method family: `createSharing` / `importShared` via `PermitUtils`; option types `CreateSharingPermitOptions` / `ImportSharedPermitOptions`). Once issued, a sharing permit can be used by whoever holds the serialized JSON. Treat it as a capability token — don't post it in chats, don't leave it in URLs. Code that refers to a `client.permits.createPermit(...)` method is wrong — that method does not exist; flag and convert to `createSharing` / `importShared`.

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
