# Mock vs prod divergence — what mocks differ on

## What

Foundry mocks and the Hardhat plugin's MOCK mode simulate CoFHE but with shortcuts. Knowing the divergences keeps you from being surprised when "tests pass locally but break on testnet."

## Gas costs

| | Mock | Prod (threshold network) |
|---|---|---|
| `FHE.add(euint32, euint32)` | Stand-in cost | Real network cost (significantly higher) |
| `FHE.mul(euint64, euint64)` | Modest mock cost | Much more expensive than mock suggests |
| `FHE.select` | Mock pays both arms cheaply | Both arms truly execute; real cost |
| `FHE.verifyDecryptResult` | Local sig check | Real signature verification cost |

**Implication:** if you tuned gas based on mock numbers, retune on testnet.

## Latency

| | Mock | Prod |
|---|---|---|
| `encryptInputs(...).execute()` | ~1-3s on first call (WASM init) then near-instant | Same first-call WASM init; subsequent calls fast |
| `decryptForView(...).execute()` | Fast (sync in mocks) | Seconds (real threshold-network round trip) |
| `decryptForTx(...).execute()` | Fast (sync in mocks) | Seconds + signature generation |

**Implication:** mock-tuned timeouts will be too tight on testnet.

## Determinism

| | Mock | Prod |
|---|---|---|
| `FHE.random*(seed != 0)` | Deterministic | Deterministic (same seed) |
| `FHE.random*(seed = 0)` | Implementation-dependent (often deterministic in mocks) | Non-deterministic (network picks seed) |

**Implication:** always pass non-zero seed for tests to avoid environment-dependent flakiness.

## Signature verification

| | Mock | Prod |
|---|---|---|
| `FHE.asEuintXX(InEuintXX)` signature check | Lax (fake sigs often accepted) | Strict (mismatch reverts) |
| Permit signature verification | Lax | Strict |

**Implication:** tests of "rejects malformed input" need testnet to be meaningful.

## ACL enforcement

| | Mock | Prod |
|---|---|---|
| Missing `allowThis` | Sometimes works (mock leniency) | Always fails on next-tx access |
| Wrong-pair `decryptForTx().withoutPermit()` without `allowPublic` | May resolve | Silently rejected by network |

**Implication:** the most insidious bug class. Re-run ACL-sensitive tests on testnet.

## Edge cases mocks miss

- **Security zone enforcement** — mocks may accept any zone; testnet enforces the configured one.
- **MPC ordering** — multi-party decryption ordering matters in real network, single-process in mocks.
- **Network outages / retries** — mocks don't simulate.

## Practical advice

```
1. Write tests for Solidity logic in Foundry mocks. Fast iteration.
2. Write E2E tests in Hardhat MOCK mode. Same speed, exercises the SDK glue.
3. Promote critical tests to Hardhat TESTNET mode before merging.
4. CI runs all three layers — mocks on every push, testnet on merge-to-main (or weekly).
```
