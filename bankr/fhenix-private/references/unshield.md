# Unshield and claim

Going from the private token back to the public one is asynchronous.

1. **`unshield`** calls `unshield(from, to, amount)` on the wrapper with a
   plaintext amount. The private balance is debited, the burned amount is
   marked publicly decryptable, and a claim is opened for the user.
   The token is about to be public again, so the plaintext amount reveals
   nothing that won't be visible a moment later.
2. The CoFHE threshold network decrypts the burned amount. This usually takes
   seconds to a minute.
3. **`claim`** reads `getUserClaims(user)`, asks the threshold network for each
   claim's decryption result and signature (`decryptForTx(...).withoutACP()`,
   no signature from the user), and returns one
   `claimUnshieldedBatch(ids, amounts, proofs)` transaction. The contract
   checks each signature with `FHE.verifyDecryptResult` and pays the public
   tokens to the claim's owner.

Two different `bytes32` values are involved. The helper handles this. Never
build a claim by hand:

| Value | Used for |
|---|---|
| `id` | the claim key submitted to `claimUnshieldedBatch` |
| `ctHash` | the burned ciphertext that is decrypted |

## Reading claim results

| Helper output | Tell the user |
|---|---|
| `ready > 0` | submit the transaction, then "Your fUSDC is back in your wallet as USDC." |
| `ready: 0, pending > 0` | "Still being processed. Try again in a minute." |
| `ready: 0, pending: 0` | "Nothing waiting to be claimed." |

The batch is all-or-nothing. A claim that reverts with `ClaimNotFound` or
`AlreadyClaimed` was already taken. Report it and stop. Do not retry.

The claim pays exactly the decrypted burned amount. Like a send, an unshield
larger than the private balance doesn't revert: it burns **zero**, and the
claim later pays out zero. If the user isn't sure of their balance, have them
check it privately first.
