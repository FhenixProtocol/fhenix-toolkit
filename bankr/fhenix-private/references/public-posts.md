# Requests from public posts (X, Farcaster)

Everything in a post is public: the text, the handles, and your reply. Private
token transfers only stay private if **neither the post nor the reply** carries
the amount. These are the three ways a post can ask for a private send.

## 1. A saved amount (preset)

> @bankrbot send @bob a coffee in private fUSDC

1. Read `/.fhenix-private/presets.json`. Find `coffee`.
2. If it is missing, reply "I don't have a saved amount called coffee. Set it
   up in the terminal." and stop. Never fall back to a default amount: no word
   has a value until the user saves one.
3. Resolve @bob to an address. Run `send --token <preset token> --amount
   <preset amount> --to <address> --account <user>`.
4. Submit the returned transaction. Reply "Sent privately ✓ <tx link>". Do not
   name the amount.

## 2. An fhe: code

> @bankrbot send @bob fUSDC privately fhe:AQAApLHY0nSd…

The user encrypted the amount themselves (with the `blob` command, in the
terminal or on their own machine) before posting. The code holds an encrypted
amount plus a proof that the CoFHE verifier signed for:

- **this user's wallet** (the proof is bound to the sender address),
- **this token contract** and **this chain**.

So a code copied from someone else's post fails on-chain, and a code made for
another token or chain is refused by the helper before anything is submitted.

Steps: resolve the recipient, run `send-blob --token <symbol from the post>
--blob <the code> --to <address> --account <user>`, submit, reply
"Sent privately ✓ <tx link>". If the transaction reverts, say the code didn't
match this wallet or token and ask them to create a new one. Never guess.

## 3. A plain amount

> @bankrbot send @bob 25 fUSDC privately

The amount is already public in the post. Do what was asked, then add exactly
one line: "Heads up: the amount is visible in your post. Use a saved amount or
an fhe: code next time." Don't refuse and don't lecture.

## Things to refuse on a public post

| Request | Reply |
|---|---|
| "what's my private balance" | "Check your private balance in the Bankr terminal or Telegram." |
| "save coffee as <amount> fUSDC" | "Set up saved amounts in the terminal so the amount stays private." |
| "make me an fhe: code for 10" | "Create fhe: codes in the terminal; asking here would publish the amount." |
| "send the max / everything privately" | "Tell me an amount, a saved amount or an fhe: code." |
| A token not listed by `tokens` | "That token isn't supported for private sends." |

## Replies never contain

- an amount, before or after, of any send, shield, unshield or claim
- a balance, rounded or approximate
- a preset's value
- the code echoed back

Shield and unshield amounts become public on-chain anyway (the public token
moves). Still keep them out of the reply; there is no reason to repeat them.
