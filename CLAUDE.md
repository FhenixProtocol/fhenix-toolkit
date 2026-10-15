# CLAUDE.md — fhenix-toolkit

This file is read by Claude Code when this plugin is loaded. It primes Claude on how the four `fhenix-*` skills behave together so they activate correctly without explicit invocation.

## Activation map

The skills are designed to activate from file context — Claude shouldn't need to be told which one to use. Use this table only when the user asks "which skill handles X?" or when activation seems to be missing.

| Task | Skill | Trigger surface |
|---|---|---|
| Writing a confidential contract | `fhenix-contracts` | Solidity file imports `@fhenixprotocol/cofhe-contracts/FHE.sol`; uses `euint*` / `ebool` / `eaddress` types |
| Encrypting inputs, decrypting outputs, managing permits in app code | `fhenix-sdk` | TypeScript file imports `@cofhe/sdk` or any subpath (`/adapters`, `/permits`, `/web`, `/node`); hooks like `useCofhe*` |
| Reviewing or auditing FHE code | `fhenix-review` | PR-review prompts ("audit this", "is this safe", "look over my FHE code"); `gh pr view` output; diffs touching FHE.sol or `@cofhe/sdk` |
| Writing tests for FHE code | `fhenix-tests` | `.test.ts` / `.t.sol` files importing FHE.sol, `@cofhe/sdk`, `@cofhe/hardhat-plugin`, or `@fhenixprotocol/cofhe-mock-contracts`; files under `tests/contracts/` |

## How the skills work together

Skills are **additive, not exclusive.** A test file that imports both FHE.sol and `@cofhe/sdk` legitimately fires `fhenix-contracts` + `fhenix-sdk` + `fhenix-tests`. The skills are designed to layer cleanly:

- `fhenix-contracts` and `fhenix-sdk` are *authoring* skills — they teach the right patterns.
- `fhenix-review` is an *audit lens* on top of the authoring skills. It activates when the task is review (PR diff, "is this safe"), not when writing fresh code.
- `fhenix-tests` is its own track — testing has different patterns (mocks vs plugin, deterministic seeds, multi-permit fixtures) that don't apply to authoring or review.
- The `fhe-reviewer` subagent is invoked by `fhenix-review` (or directly) for deep audit passes. Use it when the diff is >200 LOC of FHE code or the merge is security-sensitive.

## When to invoke explicitly

If activation isn't firing because the file context is missing — for example, the user pastes a code snippet rather than opens a file — invoke the skill manually:

```
Skill(skill="fhenix-review")
```

The skill descriptions are tuned for natural activation, but explicit invocation is always safe.

## Hard rules (never violate, regardless of skill)

These rules apply whenever Claude is writing or modifying Fhenix-confidential code, with or without skill activation:

- **No `if` / `require` / `while` on `ebool`.** Branching on an encrypted boolean compares ciphertext handles, not values. Use `FHE.select(cond, a, b)`.
- **Every encrypted state write needs `FHE.allowThis(result)`** before the function returns. Without it the contract can't reuse the handle next transaction.
- **`asEuintN(literal)` exposes the literal in calldata.** Only use for constants you don't mind revealing.
- **Uninitialized encrypted state operates as zero.** Don't use "is this set?" semantics; track presence with a plaintext flag.

When in doubt: invoke `fhenix-contracts` or `fhenix-review`, don't guess.

## Lookup-driven philosophy

This plugin **does not snapshot API surfaces.** When you need to know whether a specific function exists, what its current signature is, or what version a feature shipped in, **look it up live** — every skill's `references/lookup-recipes.md` carries the exact `curl` / `WebFetch` / `gh api` recipe.

Do not generate FHE.sol or `@cofhe/sdk` API calls from training-data memory. Fhenix repos move fast — what you remember may be stale.

## Bankr skills (`bankr/`)

`bankr/` holds skills for the Bankr agent, not for Claude Code. They are runtime artifacts Bankr executes, so the exception to the lookup-driven philosophy applies there: `bankr/fhenix-private/scripts/fhenix.mjs` **pins** token addresses and ABI on purpose as its trust anchor. When editing it, verify every address or selector on-chain (`cd bankr && bun test/verify-tokens.mjs`, `bun test/simulate-send.mjs`) and run `bun test test/`. Never move a Bankr skill under `plugins/`.

## See also

- [`README.md`](README.md) — install, overview, design philosophy
- [`docs/SPEC.md`](docs/SPEC.md) — full plugin design spec
- [`docs/architecture.md`](docs/architecture.md) — how skills, agents, and lookup recipes fit together
- [`docs/known-flaws.md`](docs/known-flaws.md) — current gaps in coverage
- [`docs/release-process.md`](docs/release-process.md) — how versions get cut and `compatibility.json` bumps work
