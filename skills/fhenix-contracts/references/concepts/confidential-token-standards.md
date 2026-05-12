# Confidential-token standards picker

## Three options in the Fhenix ecosystem today

| Standard | Source | Where it lives |
|---|---|---|
| `ERC20Confidential` | npm: `fhenix-confidential-contracts` | Fhenix's high-level confidential-ERC20 wrapper (ships alongside the lower-level `FHERC20` base class in the same package). |
| FHERC20 (vendored) | Inline in your repo | Pattern, not a registered standard. Each project copies and extends it. |
| ERC-7984 | Ethereum EIP draft | Emerging cross-protocol standard; not finalized |

## When each fits

### Pick `ERC20Confidential` when:

- You want a minimal confidential ERC-20 (balance, transfer, encrypted approval-via-operator).
- You don't need to override transfer semantics.
- You want a maintained dependency rather than vendored code.

Reference: https://github.com/FhenixProtocol/poc-shielded-stablecoin → `packages/hardhat/contracts/ShieldedStablecoin.sol` (the entire contract is ~15 lines extending `ERC20Confidential`).

### Pick vendored FHERC20 when:

- You need to extend `confidentialTransfer` with callbacks (e.g. `confidentialTransferAndCall`).
- You need to integrate with off-chain matchers or AVS operators that need handle-level access.
- You want full control over operator semantics or fee logic.

Reference: https://github.com/FhenixProtocol/rfq-demo → `contracts/cofhe/FHERC20.sol` and its companions (`FHERC20Permit`, `FHERC20Wrapper`, `FHERC20UnwrapClaim`, `MyConfidentialToken`). The RFQ flow needs the callback variant, so it vendors the whole stack.

### Pick ERC-7984 when:

- You want composability with the emerging Ethereum confidential-token draft (so tokens from other ecosystems may interop).
- You're building a demo that proves out the EIP path.

Reference: https://github.com/FhenixProtocol/selective-disclosure-demo → `packages/hardhat/contracts/MockERC7984Token.sol`. Minimal extension over the standard with `confidentialMint(address to, InEuint64 amount)`.

## Cross-standard truths

All three share the same underlying FHE patterns:
- `euint64` (commonly) for balance amounts.
- `mapping(address => euint64)` for per-account balances.
- `FHE.allowThis` after every balance update.
- `FHE.allow(balance, account)` so the account can decrypt their own balance via SDK `decryptForView`.
- The operator pattern (or its equivalent) for delegated spend.

The differences are mostly in transfer semantics (callbacks, hooks) and which "standard" you reference at the interface level.

## Gotchas

- **Don't mix standards in one ecosystem.** A wrapper from FHERC20-land won't accept tokens from ERC20Confidential and vice versa — different interfaces, different operator conventions.
- **ERC-7984 is a draft.** Pinning to it locks you to whatever the EIP looks like at your fork date. Watch the EIP repo for breaking changes.
- **None of them ship a permit-style off-chain approval out of the box** — see `concepts/operator-pattern.md`.
- **The `approveEncrypted` story is unfinished.** Even Fhenix's own posts (the Fhenix402 blog post) admit encrypted approvals are not at parity with ERC-20. Plan around operator-only delegation for now.
