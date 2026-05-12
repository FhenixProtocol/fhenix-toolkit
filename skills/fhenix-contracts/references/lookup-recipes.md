# Lookup recipes — fhenix-contracts

This file teaches Claude how to find current information about FHE.sol and Fhenix on-chain behavior. **Always prefer live lookup over recall** — the on-chain library evolves and your training data may be stale.

## Find a function in FHE.sol

### Option A: User has cofhe-contracts installed locally

```
grep -nE "function <name>" node_modules/@fhenixprotocol/cofhe-contracts/contracts/FHE.sol
```

This matches the user's exact pinned version — the most authoritative answer.

### Option B: Fetch from the public repo

The `main` branch reflects the latest published API. Use `WebFetch` (not `Read` — the file is large; never read it whole).

URL pattern:
```
https://raw.githubusercontent.com/FhenixProtocol/cofhe-contracts/main/contracts/FHE.sol
```

After fetching, grep within the response for the function or type. Quote ~10-20 lines around the match. Do not paste the whole file into context.

## Find op semantics (does it revert? overflow behavior?)

The cofhe-contracts test suite exercises edge cases. Tests live under `contracts/internal/host-chain/test/`:

```
gh api repos/FhenixProtocol/cofhe-contracts/contents/contracts/internal/host-chain/test
```

Browse the directory (subdirs: `decryptResult`, `onChain`, `publiclyAllowed`, etc.), find the test file that matches your op, then `WebFetch` the raw file and read the relevant cases.

## Find ACL behavior (allowThis vs allowSender vs allowTransient)

The runtime semantics live under `contracts/internal/host-chain/contracts/`:

```
https://raw.githubusercontent.com/FhenixProtocol/cofhe-contracts/main/contracts/internal/host-chain/contracts/TaskManager.sol
https://raw.githubusercontent.com/FhenixProtocol/cofhe-contracts/main/contracts/internal/host-chain/contracts/ACL.sol
```

These hold the runtime logic that the user-facing `FHE.*` wrappers expose. If the layout has shifted (it has before), browse the live directory:

```
gh api repos/FhenixProtocol/cofhe-contracts/contents/contracts/internal
```

## Find the version you're targeting

```
# Local
cat node_modules/@fhenixprotocol/cofhe-contracts/package.json | grep '"version"'

# Remote — latest release
WebFetch https://api.github.com/repos/FhenixProtocol/cofhe-contracts/releases/latest
```

## Find example confidential contracts in real apps

| Repo | What it shows |
|---|---|
| [poc-sealed-bid-auction](https://github.com/FhenixProtocol/poc-sealed-bid-auction) | Canonical branchless `FHE.select` winner update; full async public-decrypt round trip |
| [marronjo/fhe-hooks](https://github.com/marronjo/fhe-hooks) | Encrypted state queues; balance-bounded transfers; Uniswap v4 hook integration |
| [miniapp-equle](https://github.com/FhenixProtocol/miniapp-equle) | Encrypted gameplay state; verify-on-claim with `FHE.verifyDecryptResult` |
| [encrypted-secret-santa](https://github.com/FhenixProtocol/encrypted-secret-santa) | User-contributed entropy XOR; per-user reveal via `decryptForView` |
| [rfq-demo](https://github.com/FhenixProtocol/rfq-demo) | Bit-shift ratios; operator pattern for ciphertext allowances; vendored FHERC20 |
| [selective-disclosure-demo](https://github.com/FhenixProtocol/selective-disclosure-demo) | ERC-7984 mint pattern; ACP-based selective disclosure |
| [poc-shielded-stablecoin](https://github.com/FhenixProtocol/poc-shielded-stablecoin) | Minimal `ERC20Confidential` extension |

Use `WebFetch` against the relevant file (`main` branch + named-target grep) when quoting from these.

## When the docs site is sparse

`https://cofhe-docs.fhenix.zone` covers concepts but not exhaustive API reference. For API specifics, prefer the source (`cofhe-contracts/FHE.sol`) over the docs site.
