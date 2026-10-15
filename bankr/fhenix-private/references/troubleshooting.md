# Troubleshooting

## Helper errors (`ok: false`)

| `error` contains | Meaning | Say |
|---|---|---|
| `is not pinned` | Unknown token symbol | "That token isn't supported for private sends." |
| `is not enabled` | The token is pinned but switched off in the skill | "Private <token> isn't available in this skill right now." |
| `not supported` (chain) | Only Arbitrum One and Ethereum have CoFHE | "Private tokens work on Arbitrum and Ethereum only." |
| `Not enough` | The wallet lacks the public token to shield | Say how much it holds; this is a private channel matter, so on a public post just say "Not enough balance to shield that." |
| `6 decimals` | Too many decimal places | "Private tokens support up to 6 decimal places." |
| `different token` / `made for chain` | The fhe: code was made for another token or chain | "That code was made for a different token. Create a new one." |
| `Blob` / `base64url` / `too short` | The code is malformed or cut off | "That code looks incomplete. Paste it again." |
| `uint64` | Amount too large for a confidential balance | "That amount is too large for one private transfer." |
| `FHENIX_BANKR_API_KEY` / `Bankr API key` | Balance viewing isn't set up | Explain the one-time setup below |
| `different wallet` | The API key belongs to another Bankr wallet | "Your Bankr API key is for a different wallet." |
| `refused the ACP signature` | Bankr's `/wallet/sign` rejected the request | Check the key: Wallet API on, not read-only, no recipient allowlist |

## Submission refusals and reverts

| Refusal | Say |
|---|---|
| "Arbitrary contract calls disabled" | "Bankr needs you to allow contract calls in your Security settings for this." |
| Gas shortfall | "You need a little ETH on Arbitrum to pay gas for private transfers." |
| Revert `FHERC20ZeroBalance` on a send | "You don't have any private <token> yet. Shield some first." |
| Revert `InvalidSigner` on a send | "The encrypted amount didn't match your wallet or this token. Create a new code." |
| "Transaction blocked by security scan" | Report it as-is and stop. |

## One-time setup for private balances

Seeing your private balance means asking the threshold network to re-encrypt
it for you, which needs a signature from your wallet:

1. At bankr.bot/api-keys, create a key with **Wallet API** on, **not**
   read-only, and **no recipient allowlist** (an allowlist blocks typed-data
   signing).
2. Save it as the `FHENIX_BANKR_API_KEY` secret (Bankr settings → Env Vars).
   Names starting with `BANKR_` are reserved, so the key can't use that name.
3. Ask "what's my private fUSDC balance" in the terminal or Telegram.

The signature (a self ACP, scoped to that one token contract and valid for an
hour) lets this wallet's own encrypted balance be decrypted for it, and
nothing else. It moves no funds.

That key can also submit transactions from the wallet. Keep it only in the
Bankr secret store, and revoke it at bankr.bot/api-keys if you stop using
private balances.

## Insufficient private balance

An FHE token can't revert when a transfer exceeds the balance without leaking
whether the balance was enough. So once you hold any private balance, a send
larger than it moves **zero** and still succeeds. The confirmation can't
promise that funds moved; if the user wants certainty, they can check their
balance privately.

The same goes for `unshield`: more than the balance burns zero and the claim
pays zero.

The one exception is a wallet that has never held the private token: a send
or unshield from it reverts with `FHERC20ZeroBalance`.
