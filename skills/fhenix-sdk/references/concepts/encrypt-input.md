# Encrypt input — Encryptable.uintN → InEuintXX

## What

To send encrypted values to a contract, encrypt them off-chain via the SDK, get back a struct (`ctHash`, `securityZone`, `utype`, `signature`), and pass that struct as the function argument. The contract's `FHE.asEuintXX(in)` verifies the signature and registers the handle.

## The pattern — single input

```
const [encrypted] = await cofheClient
  .encryptInputs([Encryptable.uint64(secretAmount)])
  .execute();

await writeContractAsync({
  address: CONTRACT, abi: ABI, functionName: 'submit',
  args: [{
    ctHash: encrypted.ctHash,
    securityZone: encrypted.securityZone,
    utype: encrypted.utype,
    signature: encrypted.signature as `0x${string}`,
  } as any],
});
```

## The pattern — multi-input (order preserved)

```
const [encEq, encResult] = await cofheClient
  .encryptInputs([
    Encryptable.uint128(equationGuess),
    Encryptable.uint16(BigInt(resultGuess)),
  ])
  .execute();
```

## Encryptable types (verify via lookup-recipes)

The factory functions on `Encryptable` accept the value as `string | bigint` (mapped to the corresponding `FheTypes.*`):

- `Encryptable.uint8 / uint16 / uint32 / uint64 / uint128(value: string | bigint)` — encrypted unsigned ints
- `Encryptable.bool(value: boolean)` — encrypted bool (mapped to `ebool`)
- `Encryptable.address(value: string | bigint)` — encrypted address (mapped to `FheTypes.Uint160`, surfaces as `eaddress` on-chain)

Always look up the current exact name list (see `references/lookup-recipes.md`) — the surface evolves.

## Avoiding `as any` at the wagmi boundary

The single `as any` cast at the call site is fine for one-off use, but it spreads if every encrypted-input call site repeats it. Wrap the cast once in a typed helper and reuse it:

```
// types.ts
import type { InEuintXX } from './generated';  // or your shape

export function asInEuintArg<T>(e: {
  ctHash: string;
  securityZone: number;
  utype: number;
  signature: string;
}): T {
  return {
    ctHash: e.ctHash,
    securityZone: e.securityZone,
    utype: e.utype,
    signature: e.signature as `0x${string}`,
  } as unknown as T;
}

// at the call site
args: [asInEuintArg(encrypted)],
```

This contains the `as any` to one file, makes intent explicit (a wagmi/viem boundary cast, not arbitrary widening), and lets you tighten the return type as wagmi inference improves.

## Canonical examples

- **Auction bid input.**
  https://github.com/FhenixProtocol/poc-sealed-bid-auction
  → `packages/nextjs/hooks/useAuction.ts`, the bid submission function uses `encryptInputs([Encryptable.uint64(amount)])`.

- **Equle multi-input guess.**
  https://github.com/FhenixProtocol/miniapp-equle
  → `packages/cofhe-nextjs/src/app/hooks/useGuessSubmission.ts`.

## Gotchas

- **`as any` cast at the wagmi boundary.** The struct shape doesn't match wagmi's inferred ABI types. Cast once at the call site, or wrap in a typed factory.
- **`Encryptable.uint128` takes `bigint`**, not `number`. Wrap small values in `BigInt(value)`.
- **Order is preserved** in the result array. First input → first result.
- **Encryption is async** — the first call triggers WASM init (one-time cost, ~1–3 seconds).
- **A failed encryption throws `CofheError`** — not Result-wrapped. Wrap `execute()` in try/catch.
- **`Encryptable.bool(true)` vs `Encryptable.uint8(BigInt(1))`** — pick the right type for the Solidity argument; signature/utype mismatch reverts on-chain.
