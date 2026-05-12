# Lookup recipes — fhenix-review

For verifying claims during a review, prefer live source over training-data recall.

## Verify an FHE.sol function exists / has a given signature

```
WebFetch https://raw.githubusercontent.com/FhenixProtocol/cofhe-contracts/main/contracts/FHE.sol
```

Grep within the response for the function name. Quote ~10 lines.

If the user has it installed locally:

```
grep -n "function <name>" node_modules/@fhenixprotocol/cofhe-contracts/contracts/FHE.sol
```

## Verify an @cofhe/sdk method exists / has a given shape

```
find node_modules/@cofhe/sdk -name '*.d.ts'
# read the relevant index.d.ts
```

Or remote:

```
WebFetch https://raw.githubusercontent.com/FhenixProtocol/cofhesdk/main/packages/sdk/src/index.ts
```

## Check the CofheError code catalog

```
grep -rn "CofheError" node_modules/@cofhe/sdk/dist/
# or
gh api repos/FhenixProtocol/cofhesdk/contents/packages/sdk/src/errors.ts -H "Accept: application/vnd.github.raw"
```

## Verify ACL behavior in cofhe-contracts internals

```
https://raw.githubusercontent.com/FhenixProtocol/cofhe-contracts/main/contracts/internal/host-chain/contracts/TaskManager.sol
https://raw.githubusercontent.com/FhenixProtocol/cofhe-contracts/main/contracts/internal/host-chain/contracts/ACL.sol
```

If the layout has shifted (it has before), browse the live directory:

```
gh api repos/FhenixProtocol/cofhe-contracts/contents/contracts/internal
```

## Confirm the canonical pattern for a given task

Cross-reference against the example repos:

- Auction settle (allowPublic + withoutPermit): [poc-sealed-bid-auction](https://github.com/FhenixProtocol/poc-sealed-bid-auction)
- Branchless winner update: same repo, function `bid()`
- FHERC20 balance-bounded transfer: [marronjo/fhe-hooks](https://github.com/marronjo/fhe-hooks)
- User-entropy randomness: [encrypted-secret-santa](https://github.com/FhenixProtocol/encrypted-secret-santa)
- Operator pattern: [rfq-demo](https://github.com/FhenixProtocol/rfq-demo)
- ERC-7984 mint: [selective-disclosure-demo](https://github.com/FhenixProtocol/selective-disclosure-demo)

A pattern that deviates from these without justification is worth flagging in the review.

## Verify version pins

Compare `compatibility.json` in this plugin against the user's `package.json`. Major mismatches mean the skill's guidance may not apply.

## Reference docs (conceptual)

- https://cofhe-docs.fhenix.zone/
- https://www.fhenix.io/blog/decryption-in-cofhe-evolved
- https://www.fhenix.io/blog/cofhe-architecture
