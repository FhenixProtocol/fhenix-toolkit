# Using `fhenix-toolkit` with other AI tools

The toolkit's primary distribution is a **Claude Code plugin** (see the top-level README for install). Its content — SKILL.md activation prompts, lookup recipes, decision trees, gotcha catalog, concept files — is plain markdown and is usable from other AI coding assistants. This page documents the integration patterns.

Tracking issue: [#5 — Support other AI tooling](https://github.com/FhenixProtocol/fhenix-toolkit/issues/5).

---

## Cursor

Cursor reads rules from `.cursor/rules/*.mdc` files at the repo root. Two paths:

### Option A: Copy the skill files into Cursor rules

For each skill you want active, create a `.cursor/rules/<skill-name>.mdc` in your dApp's repo (NOT this plugin's repo). The Cursor frontmatter shape:

```
---
description: <one-line trigger description>
globs: ["**/*.sol", "**/*.t.sol"]   # or whatever file globs make sense
alwaysApply: false
---

<body content — paste the corresponding SKILL.md content from this plugin>
```

The `description` field can be the `description:` from the SKILL.md frontmatter. The `globs` should match where you want the rule to fire — generally the same trigger heuristics the skill uses. Body content can be the SKILL.md body verbatim.

When you need depth (concept files, gotcha catalog), you have two options:

- **Bundle them as more `.cursor/rules/*.mdc` files** — one per concept; activate manually.
- **Vendor the `references/` directories** under `.cursor/refs/<skill>/` and reference them with Cursor's `@file` mention.

### Option B: Use `@docs` to ingest the plugin repo

In Cursor's settings, add `https://github.com/FhenixProtocol/fhenix-toolkit` as a Docs source. Then `@docs fhenix-toolkit` in prompts to surface the relevant content.

Caveat: Cursor's `@docs` indexing may lag the repo's HEAD. Pin to a release tag if you care about reproducibility.

---

## GitHub Copilot

Copilot reads from `.github/copilot-instructions.md` at the repo root. The file is a single markdown document that Copilot includes in every prompt for the repo.

For a Fhenix dApp, write a `.github/copilot-instructions.md` that:

1. Names the project's CoFHE context (which network, which SDK version).
2. Mirrors the **hard rules** from this plugin's skills (`fhenix-contracts/references/hard-rules.md`, `fhenix-sdk/references/hard-rules.md`).
3. References this toolkit as the authoritative source: "For deeper guidance see [FhenixProtocol/fhenix-toolkit](https://github.com/FhenixProtocol/fhenix-toolkit)."

Example minimal copilot-instructions.md:

```
# Project: <your dApp> on Fhenix CoFHE

When editing Solidity (.sol) files that import @fhenixprotocol/cofhe-contracts/FHE.sol:

- No `if`/`require` on `ebool` — use `FHE.select(cond, a, b)`.
- Call `FHE.allowThis(x)` after every stored encrypted write.
- Avoid encrypted `mul`/`div` when `shr` works.
- `trivialEncrypt(literal)` exposes plaintext in calldata.

When editing TypeScript that uses @cofhe/sdk:

- Permits are explicit — call `client.permits.getOrCreateSelfPermit(undefined, undefined, { ... })`.
- Permit expiration is Unix SECONDS, not ms.
- `decryptForTx().withoutPermit()` requires on-chain `FHE.allowPublic`.

Full guidance: https://github.com/FhenixProtocol/fhenix-toolkit
```

---

## OpenAI Codex CLI

Codex CLI reads from `AGENTS.md` at the workspace root (and per-directory `AGENTS.md` files for scoped context).

Same shape as the Copilot instructions above — put a tight summary of hard rules in `AGENTS.md`, plus a pointer to this repo for depth. Codex supports markdown links so contributors can follow the trail when they need detail.

---

## Continue / Aider / generic markdown-aware AI assistants

Most generic AI coding assistants accept markdown in some form (`@file`, prompt prefix, ingestion). The plugin's `skills/<name>/SKILL.md` files are designed to be self-contained and ingestible.

Recipe:

1. Clone or vendor this plugin into your dApp at `vendor/fhenix-toolkit/`.
2. Add a one-line pointer in your project root (e.g., README, `AGENTS.md`, or assistant-specific config) describing when to consult the toolkit.
3. Let the assistant follow links / read files as needed.

---

## What's *not* in this v1 docs pass

- **No automated converter** from Claude Code SKILL.md → Cursor `.mdc` / `.github/copilot-instructions.md` / `AGENTS.md`. The transformation is mostly mechanical (frontmatter mapping + path adjustments) and a future PR may ship a script.
- **No first-class native install** for Cursor / Copilot / Codex. The toolkit ships only the Claude Code plugin natively in v1.
- **No tracked feature parity** across tools. Some tools surface activation context differently; expect minor behavioural differences.

Contributions welcome — open a PR if you've worked out a clean integration for a tool not listed here.

---

## Sources of truth (regardless of tool)

The plugin's content lives at `skills/<skill>/`:

- `skills/fhenix-contracts/` — confidential Solidity patterns
- `skills/fhenix-sdk/` — `@cofhe/sdk` integration
- `skills/fhenix-review/` — auditing confidential code
- `skills/fhenix-tests/` — testing confidential code

Each skill has a top-level `SKILL.md` plus a `references/` directory (lookup recipes, hard rules, decision trees, concept files). Read those files directly when you need depth, regardless of which AI tool you're using.
