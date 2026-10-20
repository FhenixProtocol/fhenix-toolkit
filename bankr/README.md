# Bankr skills

Skills that run inside [Bankr](https://bankr.bot), the crypto agent on X,
Farcaster, Telegram and the Bankr terminal. These are **not** Claude Code
skills: they live outside `plugins/` so the Claude Code plugin never loads
them, and Bankr installs them straight from this public repo.

| Skill | What it does |
|---|---|
| [`fhenix-private`](fhenix-private/) | Shield, send, unshield and view Fhenix confidential tokens (fUSDC, fUSDT, fBTC, …) on Arbitrum One and Ethereum, without putting amounts in public posts |

```
install the skill at https://github.com/FhenixProtocol/fhenix-toolkit/tree/main/bankr/fhenix-private
```

Unlike the Claude Code skills, a Bankr skill is a runtime artifact: the agent
executes `scripts/fhenix.mjs` and submits what it returns. So the token
addresses and the contract ABI are **pinned** in the script on purpose. It is
the trust anchor that stops a post from steering funds to a look-alike
contract. CI re-checks every pinned address against mainnet.

## Layout

```
bankr/
├── fhenix-private/            # the skill folder Bankr installs (SKILL.md, catalog.json, references/, scripts/)
├── evals/fhenix-private.json  # behaviour cases for the Bankr agent
├── test/                      # local tests; not shipped to Bankr
│   ├── fhenix.test.mjs        # offline unit tests (bun test)
│   ├── verify-tokens.mjs      # re-checks every pinned token on mainnet
│   └── simulate-send.mjs      # mainnet dry run of a private send (eth_call, nothing broadcast)
└── package.json               # pins @cofhe/sdk@1.0.1 + viem@2.38.6, same as the skill
```

## Developing

```
cd bankr
bun install
bun test test/                       # offline
bun test/verify-tokens.mjs           # mainnet reads
bun test/simulate-send.mjs --account 0x96ebbe2e67cb24b25af344ff386de1d4eb72ec24
```

The helper runs the same locally as in Bankr's sandbox (bun, same pinned
packages), so any command can be tried by hand:

```
bun fhenix-private/scripts/fhenix.mjs tokens
bun fhenix-private/scripts/fhenix.mjs shield --token fUSDC --amount 2 --account 0x…
bun fhenix-private/scripts/fhenix.mjs blob --token fUSDC --amount 0.5 --account 0x…
```

`blob` and `send` call the mainnet CoFHE verifier (no transaction, no
signature). `balance` signs through Bankr's Wallet API and needs
`FHENIX_BANKR_API_KEY` in the environment.

## What's been checked, and what hasn't

Verified locally against Arbitrum One mainnet:

- All 14 pinned wrappers (7 tokens × Arbitrum, Ethereum): symbol, 6 decimals,
  `rate()`, `underlying()` and underlying decimals.
- The deployed selectors match the ABI the helper encodes:
  `shield(address,uint256)`, `confidentialTransfer(address,bytes32,bytes)`,
  `unshield(address,address,uint64)`, `claimUnshieldedBatch`, `getUserClaims`.
- Encryption with `@cofhe/sdk@1.0.1` under **bun** against the mainnet
  verifier (~9 s). The verifier rejects proofs from SDK 0.x
  (`ZK_VERIFY_FAILED`: proof metadata must end with the contract address), so
  don't pin below 1.0.
- A helper-built `confidentialTransfer` (both `send` and `send-blob`)
  succeeds in `eth_call` from a real fUSDC holder, and reverts `InvalidSigner`
  from any other sender, so a copied fhe: code is useless.

Not verifiable without a live Bankr wallet (the mainnet test below covers these):

- Staging the script into `execute_cli` with `filesFromUserFs`.
- Bankr's sandbox reaching `cofhe-vrf.mainnet.fhenix.zone` / `cofhe-tn.mainnet.fhenix.zone`.
- `/wallet/sign` accepting the ACP typed data (private balance).
- The claim path: no one had unshielded on mainnet yet, so there was no
  pending claim to decrypt.
- Bankr's security scan accepting `approve()` to the wrapper.
- The skill loading on X mentions.

## Mainnet test plan

Bankr only submits to mainnets, so the first end-to-end test is on Arbitrum
One with small amounts. Use a fresh Bankr wallet holding about **5 USDC + 0.001
ETH on Arbitrum**.

**0. Install.** In the Bankr terminal (bankr.bot/terminal):

```
install the skill at https://github.com/FhenixProtocol/fhenix-toolkit/tree/main/bankr/fhenix-private
```

Before merge, point the URL at the branch. If Bankr misreads a branch name
containing `/`, push the commit to a slash-free branch and use that. Then
check Security → *Enable arbitrary contract calls* is on.

**1. Shield.** "shield 2 USDC into private fUSDC". Expect an approve and a
shield tx on Arbiscan; the agent's reply shouldn't need an amount. Proves
`execute_cli` staging and submission (and that the security scan allows the
approve).

**2. Dry-run your send locally** (optional, zero risk):
`bun test/simulate-send.mjs --account <your Bankr address>` should print
`ok` for your account and `InvalidSigner` for the other.

**3. Private send.** "send 0.5 private fUSDC to <second wallet>". **Proves
CoFHE encryption inside Bankr's sandbox** and that the sandbox can reach the
mainnet verifier. This is the riskiest step.

**4. Private balance.** Create the API key (Wallet API on, not read-only, no
recipient allowlist), save it as `FHENIX_BANKR_API_KEY`, then in the terminal:
"what's my private fUSDC balance". Expect `1.5`. **Proves `/wallet/sign`
accepts the ACP typed data.** If it fails, run the same command locally with
`FHENIX_BANKR_API_KEY=… bun fhenix-private/scripts/fhenix.mjs balance --token fUSDC --account <address>`
to separate a Bankr-sandbox problem from a signing problem.

**5. Presets on X.** In the terminal, "save coffee as 0.25 fUSDC". Then on X:
"@bankrbot send @<alt> a coffee in private fUSDC". Expect "Sent privately ✓"
with no amount. **Proves the skill loads on X mentions** and the privacy rules
hold.

**6. fhe: code.** In the terminal, "make an fhe: code for 0.1 fUSDC". Tweet
"@bankrbot send @<alt> fUSDC privately fhe:…". From a *different* account,
tweet the same code: it must fail.

**7. Unshield and claim.** "unshield 0.5 fUSDC", wait a minute, then "claim my
fUSDC". Expect USDC back. This is the first live run of the claim path.

**8. Edge cases.** "send 100 private fUSDC to <alt>" (more than the balance):
it succeeds but moves zero; check the balance afterwards. "send 1 fUSDC
privately on Base" should be refused.

## Known gaps

- **Send everything** isn't possible from an EOA: the `sharedEuint64`
  overloads need a contract caller. It would need a small helper contract.
- **fETH** (native ETH wrapper) isn't wired in: it shields with a payable
  `shieldNative`, and Bankr's agent prices `value` differently from the
  Wallet API.
- **Bankr's USD spend limits** value these txs at $0. The skill tells the user
  once; a native Bankr integration would be the real fix.
- **Over-balance sends and unshields** don't revert (they move 0), so the
  confirmation can't promise funds moved.
- **The balance API key** can also submit transactions. A Bankr-native
  "sign typed data" tool for skills would remove the need for it.
- **Red envelopes / random drops** need their own access-listed contract on
  CoFHE. That's the natural v2 and the best X demo.

## Listing in the Bankr catalog

Installing from this repo's URL needs no approval. For the public Bankr
catalog, open a PR to [BankrBot/skills](https://github.com/BankrBot/skills)
with the `fhenix-private/` folder (`catalog.json` is already in their format;
change `install.command` to their URL). That repo asks for no AI-attribution
lines in commits or PR bodies.
