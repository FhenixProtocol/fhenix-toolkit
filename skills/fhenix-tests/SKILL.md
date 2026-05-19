---
name: fhenix-tests
description: Use when writing or extending tests for confidential CoFHE code — Foundry mocks, Hardhat plugin, encrypted input fixtures, SDK decrypt flows (decryptForView and decryptForTx) in tests. Activates on .test.ts / .t.sol files importing FHE.sol, @cofhe/sdk, @cofhe/hardhat-plugin, or @fhenixprotocol/cofhe-mock-contracts; on files under tests/contracts/; or on prompts like "test this confidential contract."
---

# fhenix-tests — test confidential CoFHE contracts and dApps

You activate when the user is writing tests that exercise Fhenix-encrypted code: Foundry `.t.sol` files importing FHE.sol, Hardhat `.test.ts` files using `@cofhe/sdk` or the Hardhat plugin's mock environment, or any file under `tests/contracts/`.

## The first decision: Foundry mocks or Hardhat plugin?

| Choice | Use when |
|---|---|
| **Foundry mocks** (`cofhe-mock-contracts`) | Pure-Solidity testing; fast iteration; no Node.js dependency; testing branchless logic, `select`/`allowThis` paths, encrypted state transitions. |
| **Hardhat plugin** (`@cofhe/hardhat-plugin`) | End-to-end with the SDK; tests the encrypt→tx→decrypt loop; tests frontend integration; covers the on-chain + off-chain split. |

You can use both in one project — Foundry for unit-level Solidity logic, Hardhat for E2E flows.

Decision tree: `references/decision-trees.md`.

## Hard rules — never violate

1. **Mock gas ≠ prod gas.** Mock environments simulate gas costs that don't match the threshold network's actual costs. Always validate gas-sensitive code on a testnet before mainnet.

2. **`execute()` is the one async terminator — don't poll.** The legacy on-chain `FHE.decrypt(ct)` + `getDecryptResultSafe(ct)` poll loop is gone. All decrypt paths terminate on `await client.decryptFor*(...).execute()`; in MOCK mode it resolves immediately, in TESTNET mode it takes seconds. Tests must `await` properly and use realistic timeouts.

3. **Seed `FHE.random*` for determinism.** Pass a non-zero seed to make tests reproducible. Seed=0 picks a system seed → flaky tests.

4. **Test the ACL path.** For every encrypted op stored in state, assert that subsequent operations succeed (proving `allowThis` was called correctly). Forgotten `allowThis` is a silent class of bug.

5. **Test both arms of `FHE.select`.** Even when the encrypted condition picks one arm at runtime, both must be valid expressions. Force both branches in tests by varying inputs.

6. **Verify on-chain + off-chain pairing.** E2E tests must exercise the decrypt-flow pairing matrix (`allowPublic` ↔ `withoutPermit`, etc.). A test that uses one without the other is testing a non-existent code path.

Full rule list: `references/hard-rules.md`.

## Default Foundry setup

Install the mocks (note: the old `cofhe-foundry-mocks` repo is archived; the live one is `cofhe-mock-contracts`):

```
forge install fhenixprotocol/cofhe-mock-contracts
```

In `foundry.toml`, point `remappings` at the library. Tests inherit `CoFheTest` and call `etchFhenixMocks()` to deploy the mocks at fixed addresses:

```
import { Test } from "forge-std/Test.sol";
import { CoFheTest } from "@fhenixprotocol/cofhe-mock-contracts/CoFheTest.sol";

contract MyTest is Test, CoFheTest {
    function setUp() public {
        etchFhenixMocks();   // installs mock TaskManager / ACL / ZkVerifier
        // ... deploy your contracts
    }
}
```

Details: `concepts/foundry-mocks-setup.md`.

## Default Hardhat setup

Install the plugin:

```
npm install --save-dev @cofhe/hardhat-plugin
```

In `hardhat.config.ts`:

```
import "@cofhe/hardhat-plugin";
```

Inside a test fixture, deploy the mocks then construct an SDK client bound to a signer:

```
await hre.run("task:cofhe-mocks:deploy");
const client = await hre.cofhe.createClientWithBatteries(signer);
```

Tests then use the SDK normally; the plugin handles MOCK-vs-TESTNET keying.

Details: `concepts/hardhat-plugin-setup.md`.

## Testing the decrypt flow

E2E tests must exercise the on-chain `allow*` plus the SDK decrypt plus on-chain verify, in that order:

```
// Encrypt input, submit
const [encInput] = await client.encryptInputs([Encryptable.uint64(42n)]).execute();
await contract.submit(encInput);

// Trigger reveal (contract calls FHE.allowPublic inside)
await contract.requestSettlement();
const ctHash = await contract.publicHandle();

// Client decrypts via SDK
const { decryptedValue, signature } = await client
  .decryptForTx(ctHash).withoutPermit().execute();

// Settle by calling back with the proven plaintext
await contract.finalizeWith(decryptedValue, signature);
// Contract verifies via FHE.verifyDecryptResult(decryptedValue, signature)
```

Pattern: `concepts/testing-decrypt-flows.md`.

## Concepts to read on demand

- `foundry-mocks-setup.md` — installing and using `cofhe-mock-contracts`.
- `hardhat-plugin-setup.md` — installing and using `@cofhe/hardhat-plugin`, MOCK vs TESTNET mode.
- `testing-encrypted-input.md` — building `InEuintXX` test fixtures off-chain.
- `testing-decrypt-flows.md` — testing SDK `decryptForView` / `decryptForTx` round-trips and on-chain verify.
- `testing-multi-permit.md` — multiple permits / sharing permits / cross-user flows.
- `mock-vs-prod-divergence.md` — what mocks differ on (gas, latency, randomness).

## Looking up

For exact mock APIs, Hardhat plugin tasks, or current setup snippets, see `references/lookup-recipes.md` — prefer live source over recall.
