# Hard rules — fhenix-tests

## Rule 1: Mock gas does not equal prod gas

Mock environments simulate gas using stand-in operations that don't match the real threshold network's costs. **Never claim a contract is gas-tuned based on mock numbers alone.** Always validate on testnet (arb-sepolia, etc.) before mainnet.

## Rule 2: `execute()` is the one async terminator — don't poll

The legacy on-chain `FHE.decrypt(ct)` + `getDecryptResultSafe(ct)` poll loop has been removed. All decrypt paths terminate on a single `await client.decryptFor*(...).execute()`. In MOCK mode it resolves immediately; in TESTNET mode it takes seconds.

```
// Encrypt input
const [enc] = await client.encryptInputs([Encryptable.uint64(42n)]).execute();
await contract.submit(enc);

// Trigger reveal (contract calls FHE.allowPublic inside)
await contract.requestSettle();

// Decrypt and settle in one await
const { decryptedValue, signature } = await client
  .decryptForTx(await contract.publicHandle())
  .withoutPermit()
  .execute();
await contract.finalizeWith(decryptedValue, signature);
```

Test timeouts must accommodate testnet latency (30s+); MOCK mode tests run fast.

## Rule 3: Seed `FHE.random*` deterministically

`seed=0` lets the network pick a seed → flaky tests. Pass a non-zero seed for reproducibility.

## Rule 4: Test the ACL path explicitly

For each encrypted op that writes to state, the test should:
1. Perform the op.
2. Re-read the state in a follow-up call (proving the contract can use the handle).
3. Assert correctness.

A missing `FHE.allowThis` produces a runtime ACL error on the *second* tx — only a multi-tx test catches it.

## Rule 5: Cover both arms of `FHE.select`

Run the test with inputs that drive the encrypted condition to TRUE, and again with inputs that drive it to FALSE. Both arms must be valid (and produce correct results).

## Rule 6: Verify on-chain + off-chain pairings in E2E

For every `decryptForView` / `decryptForTx` callsite, the E2E test must exercise the corresponding on-chain `allow*`. Test the *pairing*, not just the parts:

- `decryptForView` test → contract previously called `FHE.allow(ct, user)` + permit created.
- `decryptForTx().withPermit()` test → same as above + signature returned + `verifyDecryptResult` on follow-up.
- `decryptForTx().withoutPermit()` test → contract previously called `FHE.allowPublic(ct)` + `verifyDecryptResult` on follow-up.

## Rule 7: Don't share state between test cases

Each test should `setUp` fresh deployments. Encrypted state with mocks can carry over in surprising ways; cross-test leakage produces non-deterministic failures.

## Rule 8: Test failure paths, not just happy paths

Specifically:
- ACL revert when permission is missing.
- `verifyDecryptResult` revert on tampered signature.
- `asEuintXX` revert on type-tag mismatch.
- Operator-expired revert on encrypted-token transfer.

These are exactly the bug classes `fhenix-review`'s gotcha catalog identifies.

## Rule 9: Don't conflate `decryptForView` with `decryptForTx` in tests

They have different result shapes (`{ decryptedValue }` vs `{ decryptedValue, signature }`). Tests that destructure both interchangeably break on the wrong path.

## Rule 10: Use the same SDK version your dApp ships with

Tests pinned to an older `@cofhe/sdk` than the dApp can pass while production breaks. Pin in `package.json` and use `npm ci` in CI.
