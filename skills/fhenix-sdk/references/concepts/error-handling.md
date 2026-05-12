# Error handling — CofheError

## What

`@cofhe/sdk` throws typed `CofheError` instances with discriminated codes. No more `Result<T>` tuple-pattern from legacy `cofhejs`.

## The shape

```
import { CofheError, CofheErrorCode } from '@cofhe/sdk';

try {
  const result = await cofheClient.encryptInputs([...]).execute();
} catch (err) {
  if (err instanceof CofheError) {
    // err.code is a CofheErrorCode value (SCREAMING_SNAKE string).
    // err also exposes: cause, hint, context.
    switch (err.code) {
      case CofheErrorCode.NotConnected:        /* user not connected — gate UI */ break;
      case CofheErrorCode.PermitNotFound:      /* call getOrCreateSelfPermit */ break;
      case CofheErrorCode.UnsupportedChain:    /* wrong network */ break;
      case CofheErrorCode.DecryptFailed:       /* network refused — likely ACL mismatch */ break;
      case CofheErrorCode.FetchKeysFailed:     /* transient — retry */ break;
      default:                                  throw err;
    }
  } else throw err;
}
```

**Always verify the live code list** — `CofheErrorCode` is a TypeScript enum in `packages/sdk/core/error.ts`. Run the lookup recipe; don't hard-code without checking. As of this writing the enum has ~40 members; only the user-actionable ones are worth special-casing.

## Recoverable vs fatal — rough taxonomy

(Map your error codes to one of these buckets at handle-time. Names below are real `CofheErrorCode` values.)

| Type | Examples | Strategy |
|---|---|---|
| User action | `NotConnected`, `MissingPublicClient`, `MissingWalletClient`, `PermitNotFound` | Trigger UI (reconnect wallet, create permit) |
| Network transient | `FetchKeysFailed`, `PublicWalletGetChainIdFailed` | Retry with backoff |
| Configuration | `UnsupportedChain`, `MissingConfig`, `ChainIdUninitialized`, `AccountUninitialized` | Probably a code bug — surface clearly |
| Decrypt / ACL | `DecryptFailed`, `DecryptReturnedNull`, `InvalidUtype`, `SealOutputFailed` | Contract didn't `allow*` correctly — check the pairing matrix in `decrypt-view-vs-tx.md` (sibling file) |
| ZK / proof | `ZkVerifyFailed`, `ZkPackFailed`, `ZkProveFailed`, `ZkUninitialized` | Encryption-side problem — usually init/config |
| Permits | `InvalidPermitData`, `InvalidPermitDomain`, `CannotRemoveLastPermit` | Permit state corrupted or invariant violated |
| Init (TFHE) | `InitTfheFailed`, `InitViemFailed`, `InitEthersFailed` | One-time setup failure; surface clearly |

## Gotchas

- **Errors are NOT Result-wrapped.** Use `try`/`catch`. Don't write `if (result.error)` — the API doesn't have that shape.
- **`err.message` is human-readable but not stable** for branching. Branch on `err.code`.
- **WASM/init errors can surface as generic `Error`** before CofheError is in scope. Always have a fallback `else throw err` branch.
- **Async errors propagate through promise chains** — wrap the outer `await` (the `execute()` call), not the builder chain.
- **Don't swallow errors silently.** Show the user something — even just a toast — when an SDK call fails. Silent failures lead to bug reports like "the button doesn't do anything."
