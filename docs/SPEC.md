# fhenix-toolkit — Design Spec

**Date:** 2026-05-12
**Status:** Draft v1 (private repo until public release)
**Owner:** TBD (CODEOWNERS pending)
**Repo:** https://github.com/FhenixProtocol/fhenix-toolkit

---

## 1. Goal

Ship a Claude Code plugin that makes building on **Fhenix CoFHE** dramatically easier and safer. The plugin teaches Claude how to write idiomatic confidential smart contracts, how to integrate `@cofhe/sdk`, how to migrate from legacy `cofhejs`, how to spot ACL and decrypt-flow bugs, and how to test confidential code — all by activating the right context at the right moment.

The plugin curates **timeless wisdom** (concepts, decision trees, gotchas) and teaches Claude **how to look up current information** from public Fhenix repos. It does not snapshot the SDK or contracts API surface, so it stays correct as upstream evolves.

## 2. Audience

- **Primary:** community developers building dApps with CoFHE in their own Claude Code workspace. The plugin equips *their* Claude with Fhenix expertise.
- **Secondary:** the Fhenix team building demos, fixtures, and devrel content internally — same plugin, same artifact, no internal-only variant.

## 3. Scope

### In scope (v1)

- Four skills: `fhenix-contracts`, `fhenix-sdk`, `fhenix-review`, `fhenix-tests`.
- One optional companion subagent: `fhe-reviewer`, invoked from the review skill for deep audit passes.
- Lookup-recipe-driven references (concept files + live-lookup instructions, no embedded code listings).
- CI: link-check, lookup-recipe-smoke.
- Drift coordination: cross-repo `repository_dispatch` handshake from `cofhesdk` and `cofhe-contracts` on major releases (added to those repos separately).

### Deferred (v1.5+)

- `fhenix-migrate` skill — migration from legacy `cofhejs` to `@cofhe/sdk`. Spec retained in section 5.3 for reference; ship timing TBD.
- Slash commands: `/fhenix:scaffold-dapp`, `/fhenix:scaffold-contract`.
- Auto-generated FHE.sol reference (parse source, emit markdown) — hand-curated lookup recipes are sufficient for v1.
- Localizations (English only at v1).
- Cursor / VS Code ports.

### Out of scope

- MCP server for live SDK doc lookup — `context7` already covers this for general docs.
- Hosting / publishing CoFHE itself.

## 4. Plugin shape

Five skills under one plugin, installable via:

```
/plugin marketplace add FhenixProtocol/fhenix-toolkit
/plugin install fhenix-toolkit
```

Each skill activates on its own triggers (file imports, file extensions, or user prompts). Context stays lean because only the relevant skill loads in a given turn — a TypeScript file editing session doesn't load Solidity skills, and vice versa.

## 5. The five skills

### 5.1 `fhenix-contracts`

- **Activates on:** files importing `@fhenixprotocol/cofhe-contracts/FHE.sol`; presence of `euint*`, `ebool`, or `eaddress` types; user prompts like "build a confidential X contract."
- **Teaches:** hard rules (no `if` / `require` on `ebool` → `FHE.select`; `allowThis` after every encrypted write; no encrypted `mul` / `div` if `shr` works); the four-verb ACL taxonomy (`allowThis` / `allowSender` / `allow(ct, addr)` / `allowPublic`); the three decrypt-flow choice; standards picker (`ERC20Confidential` vs FHERC20 vs ERC7984).
- **Concepts shipped:** `branchless-update`, `allow-cascade`, `encrypted-input`, `async-decrypt`, `select-vs-if`, `select-eaddress-sentinel`, `confidential-token-standards`, `bit-shift-ratio`, `operator-pattern-for-ciphertext-allowance`, `randomness-via-user-entropy`.

### 5.2 `fhenix-sdk`

- **Activates on:** files importing `@cofhe/sdk` or any subpath (`/adapters`, `/permits`, `/web`, `/node`); hooks named `useCofhe*` or `usePermit*`; user prompts like "encrypt this input", "set up cofhe in Next.js."
- **Teaches:** the canonical init recipe (`createCofheConfig` → `createCofheClient` → `connect(publicClient, walletClient)`) with the SSR-safe Proxy singleton pattern; the three-way decrypt decision (`decryptForView` vs `decryptForTx().withPermit()` vs `decryptForTx().withoutPermit()`); permit lifecycle (`getOrCreateSelfPermit`, ACP scoping, permit-version re-render trick); the `Encryptable.uintN` input flow and the `{ctHash, securityZone, utype, signature}` ABI cast; **Unix seconds (not ms)** trap.
- **Concepts shipped:** `init-ssr-safe-singleton`, `encrypt-input-flow`, `decrypt-view-vs-tx`, `permit-lifecycle`, `acp-scoping`, `permit-version-rerender`, `error-handling-cofheError`.

### 5.3 `fhenix-migrate` (deferred to v1.5)

This skill is designed but not in v1 scope. Spec retained so the eventual implementation has a target. The other four skills cover enough of new-development surface to ship the plugin without it.

- **Activates on:** files importing `cofhejs` (any subpath); presence of `unseal(`, `Result<`, `cofhejs.initialize`, or `cofhejs.encrypt(`; explicit "migrate from cofhejs."
- **Teaches:** a seven-step migration playbook — inventory every decrypt site, classify each as **UI view** or **protocol reveal**, then convert init → encrypt → decrypt → error handling → permits → contract-side `FHE.decrypt` → `publishDecryptResult` / `verifyDecryptResult`. Plus the silent footguns: `.withoutPermit()` requires on-chain `FHE.allowPublic`; `Result<T>` → typed `CofheError`; auto-permits gone.
- **Why separate from `fhenix-sdk`:** activation context differs (legacy imports trigger it; new-code imports don't), and the depth of migration content is heavy enough that loading it alongside the new-SDK skill would bloat the active context.

### 5.4 `fhenix-review`

- **Activates on:** PR-review flows; user prompts like "audit this", "is this safe", "review my FHE code"; files matching either the contracts or SDK triggers *during* a review context.
- **Teaches:** the gotcha catalog (15+ items including uninitialized-CT-defaults-to-zero; `allowTransient` is Solidity-identical to `allow`; downcast doesn't truncate ciphertext; `trivialEncrypt` makes the plaintext visible in calldata; `withoutPermit` silent-fail; gas-pattern leakage; event-emit leakage; confidentiality ≠ anonymity; encrypted-`approve` not at parity); security checklist for confidential contracts; "Proof of Plaintext Input" pattern for validating `InEuintXX` arrivals.
- **Companion subagent:** `agents/fhe-reviewer.md`, invoked for deeper review passes. The subagent loads the full gotcha catalog up front; the main skill stays lean.

### 5.5 `fhenix-tests`

- **Activates on:** `*.test.ts` / `*.t.sol` files touching FHE.sol or `@cofhe/sdk`; files under `tests/contracts/`; user prompts like "test this confidential contract."
- **Teaches:** Foundry mocks (`cofhe-foundry-mocks`) vs Hardhat plugin (`@cofhe/hardhat-plugin`) decision; canonical test patterns (encrypted I/O, public-decrypt ACL, deep-nesting, multi-permit); polling decrypt-results in tests; deterministic random seeding; **mock-gas ≠ prod-gas** warning.

## 6. Content philosophy — concepts + lookup, no embedded code

The plugin does **not** snapshot SDK or contract API surfaces. Instead:

- **Curated:** timeless concepts, hard rules, decision trees, the migration playbook, and the gotcha catalog. These don't change with releases.
- **Looked up live:** function signatures, op×type availability, error codes, version numbers, deployed-contracts addresses. Every skill's `references/lookup-recipes.md` tells Claude *where* and *how* to fetch the current source of truth from the public Fhenix repos.

Concept files reference **public example repos by URL**. When Claude needs a concrete example, it `WebFetch`es the file from `main`, greps for the named target (a function name or hook name), and quotes the lines it needs.

### Allowlist of repos linked from concept files

- `FhenixProtocol/cofhe-contracts`
- `FhenixProtocol/cofhesdk`
- `FhenixProtocol/poc-shielded-stablecoin`
- `FhenixProtocol/poc-sealed-bid-auction`
- `FhenixProtocol/rfq-demo`
- `FhenixProtocol/selective-disclosure-demo`
- `FhenixProtocol/miniapp-equle`
- `FhenixProtocol/encrypted-secret-santa`
- `FhenixProtocol/cofhe-hardhat-starter`
- `FhenixProtocol/cofhe-foundry-mocks`
- `marronjo/fhe-hooks` (vetted community Uniswap v4 hooks example)

Adding more requires a PR that updates this spec.

### Link policy

- Link to **`main` branch with named targets**, not pinned commits, not line numbers. Function names and hook names survive refactors; line numbers don't.
- The `link-check` workflow catches outright file deletions or repo moves daily.

## 7. Reference design

Each skill's `references/` directory:

```
skills/<skill>/
├── SKILL.md                       # lean prompt loaded on activation
└── references/
    ├── lookup-recipes.md          # where and how to fetch live API info
    ├── concepts/
    │   └── <concept>.md           # one file per concept, with public-repo links
    ├── hard-rules.md              # timeless rules (skill-specific)
    ├── decision-trees.md          # branching decisions (skill-specific)
    └── gotchas.md                 # skill-specific traps
```

`SKILL.md` is the prompt Claude loads when the skill activates. It's short (~150-300 lines), names the concepts the skill covers, and tells Claude when to read which reference file.

`references/concepts/*.md` and the other reference files are loaded on demand — Claude only reads what it needs.

## 8. CI & drift detection

Two workflows in v1:

### `link-check.yml`

- **Triggers:** push to PR branches (paths-filtered), daily cron at 02:00 UTC, manual dispatch.
- **What it does:** lychee link-checks every markdown file in the repo. Fails the PR / opens an issue on red.

### `lookup-recipe-smoke.yml`

- **Triggers:** daily cron at 03:00 UTC, manual dispatch.
- **What it does:** runs each commanded lookup recipe (e.g. `curl` to fetch the raw `FHE.sol`) and expects success. Catches when upstream paths move.

### What we don't run in CI

- No Solidity compile, no `tsc --noEmit` — the plugin doesn't own any code. The example repos own their own CI and are independently maintained.

## 9. Version coupling with CoFHE

Loose coordination via `repository_dispatch`:

- Workflows in `FhenixProtocol/cofhesdk` and `FhenixProtocol/cofhe-contracts` (added separately) fire a `repository_dispatch` event into `fhenix-toolkit` on **major** release tags.
- This plugin repo has an `on-cofhe-release.yml` workflow (deferred to v1.0 release, added when CODEOWNERS exist) that opens a PR titled `Bump compatibility.json to vX.Y — review lookup recipes for drift`. A human reviews and merges.

Patch and minor CoFHE releases don't trigger this — the curated content shouldn't churn on those.

## 10. Release & versioning

- Plugin uses its own semver, decoupled from CoFHE versions.
- v0.x ships during private development.
- v1.0 marks public release.
- Minor bumps: new concepts, new skills.
- Major bumps: skill renames, activation-trigger changes, removed concepts.

## 11. Implementation plan

PRs land into `main` in order:

1. **Initial commit:** README, LICENSE, CHANGELOG, plugin manifest, marketplace manifest, compatibility matrix, CI workflows, spec doc, `.gitignore`. Direct commit (empty repo, no PR needed).
2. **PR #1:** `skills/fhenix-contracts/` — SKILL.md, lookup-recipes, hard-rules, decision-trees, concepts/.
3. **PR #2:** `skills/fhenix-sdk/` — same shape.
4. **PR #3:** `skills/fhenix-review/` + `agents/fhe-reviewer.md` — gotchas + checklist + subagent.
5. **PR #4:** `skills/fhenix-tests/` — Foundry vs Hardhat + test patterns.
6. **(v1.5):** `skills/fhenix-migrate/` — deferred. Spec retained in section 5.3 for when it lands.

Each PR is independently reviewable; merging them in order means the plugin is incrementally installable from any point in the sequence.

## 12. Open questions / decisions deferred

- **CODEOWNERS:** none at scaffolding time. Add when the first co-owner is named.
- **Slash commands** (`/fhenix:scaffold-*`): v1.5.
- **`on-cofhe-release.yml` workflow + its sibling workflows in upstream repos:** added at v1.0 release time, not before.
- **Auto-generated FHE.sol reference:** revisit if hand-curated lookup recipes prove insufficient.
- **Public release date:** TBD after v1 PRs land and internal review.

## 13. Research sources

The design draws on a parallel ingest of:

- `FhenixProtocol/poc-shielded-stablecoin`
- `FhenixProtocol/poc-sealed-bid-auction`
- `FhenixProtocol/rfq-demo`
- `FhenixProtocol/selective-disclosure-demo`
- `marronjo/fhe-hooks`
- `FhenixProtocol/miniapp-equle`
- `FhenixProtocol/encrypted-secret-santa`
- The docs site at https://cofhe-docs.fhenix.zone
- The Fhenix blog at https://www.fhenix.io/blog (notably the *Decryption in CoFHE, Evolved* and *CoFHE Architecture* posts)
- The local `cofhe-contracts/FHE.sol`, `ICofhe.sol`, and `tests/contracts/*.sol` for the canonical on-chain API surface.

Findings synthesized into the concept set listed in section 5 and the cross-cutting principles in section 6.
