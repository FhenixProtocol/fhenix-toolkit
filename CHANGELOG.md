# Changelog

All notable changes to `fhenix-toolkit` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-05-31

Minor release — substantial new concept coverage across `fhenix-contracts` and `fhenix-sdk`, plus new hard rules and lookup recipes.

### Added

#### `fhenix-contracts`

- **`allow-transient`** concept — `FHE.allowTransient(ct, addr)` for single-transaction ACL grants that never write storage, and when to reach for it over the persistent `FHE.allow`.
- **`handle-lifecycle-backfill`** concept — re-granting handles at scale; the per-op rule from `allow-cascade` applied to loops, batch updates, and migrations.
- New hard rules and expanded guidance in `confidential-token-standards` and `encrypted-input`.

#### `fhenix-sdk`

- **`bundler-config`** concept — Next.js and Vite recipes for loading the TFHE WASM module, CJS-only transitive deps, and top-level-await init (fixes blank-page / missing-export / SSR-crash failure modes).
- **`debugging-decryption`** concept — the three buckets a failing `decryptForView` / `decryptForTx` falls into, and how to triage each.
- **`entry-points-web-vs-node`** concept — `@cofhe/sdk/web` vs `/node` are not interchangeable; which to import where.
- **`permit-dedup`** concept — the concurrent `getOrCreateSelfPermit` race that fires two wallet popups, and how to serialize it.
- **`permit-issuer-gotcha`** concept — the EIP-712 `issuer`/signer mismatch behind "Invalid issuer signature".
- **`sharing-permits`** concept — selective off-chain disclosure: authorizing a recipient to decrypt specific handles without granting on-chain ACL access.
- New hard rules and new lookup recipes covering the above.

### Changed

- `README.md` — added Claude Code Desktop install instructions alongside the terminal flow.

## [0.1.1] — 2026-05-25

Patch release — install-command correction.

### Fixed

- **Install command.** The README, CHANGELOG (v0.1.0 block), and known-flaws all instructed `/plugin install fhenix-toolkit@FhenixProtocol`. This fails with `Marketplace "FhenixProtocol" not found` — the `@<suffix>` is the **marketplace name** (defined by the `name` field in `marketplace.json`, which is `fhenix-toolkit`), not the GitHub owner. The short form `/plugin install fhenix-toolkit` (no suffix) is what users should run; the explicit equivalent is `/plugin install fhenix-toolkit@fhenix-toolkit`.

### Changed

- `docs/known-flaws.md` — the "No tagged release yet" gap from v0.1.0 was replaced with "Default install floats on default-branch HEAD." v0.1.0 is now tagged, but `/plugin install fhenix-toolkit` still resolves to whatever's on `main`, not the tagged release. Explicit-pin recipe still TBC.

## [0.1.0] — 2026-05-25

First public release. The four v1 skills, the audit subagent, the CI, the docs, the brand.

### Added

#### Skills (the core content)

- **`fhenix-contracts`** — write confidential Solidity for Fhenix CoFHE. Hard rules (no `if`/`require` on `ebool` → `FHE.select`, mandatory `allowThis` after every encrypted write, no encrypted `mul`/`div` when `shr` suffices), the four-verb ACL taxonomy, the three decrypt-flow choice, the confidential-token standards picker. Seven concept files (`branchless-update`, `allow-cascade`, `encrypted-input`, `bit-shift-ratio`, `operator-pattern`, `randomness-via-entropy`, `confidential-token-standards`).
- **`fhenix-sdk`** — integrate `@cofhe/sdk`. Canonical init recipe with SSR-safe Proxy singleton, the three-way decrypt decision (`decryptForView` vs `decryptForTx().withPermit()` vs `decryptForTx().withoutPermit()`), permit lifecycle, encrypted-input ABI cast, the **Unix seconds (not ms)** trap. Six concept files (`init-singleton`, `encrypt-input`, `decrypt-view-vs-tx`, `permits`, `error-handling`, `hooks-pattern`).
- **`fhenix-review`** — audit confidential code. 30+ gotcha catalog, security checklist, decision trees, four concept files (`confidentiality-vs-anonymity`, `pattern-leakage`, `proof-of-plaintext-input`, `reveal-labels`).
- **`fhenix-tests`** — test confidential code. Foundry-mocks vs Hardhat-plugin decision, encrypted-input fixtures, decrypt-flow tests, multi-permit, `mock-gas ≠ prod-gas` warning. Six concept files (`foundry-mocks-setup`, `hardhat-plugin-setup`, `testing-encrypted-input`, `testing-decrypt-flows`, `testing-multi-permit`, `mock-vs-prod-divergence`).

#### Companion subagent

- **`fhe-reviewer`** — deep-audit subagent invoked by `fhenix-review` for substantial diffs (>200 LOC of FHE code) or pre-launch audits. Loads the full gotcha catalog into a fresh context, walks function-by-function, returns a prioritized report.

#### Plugin shape

- `.claude-plugin/marketplace.json` — `git-subdir` source pointing at `plugins/fhenix-toolkit`, rich metadata (`keywords`, `category`, author, homepage, repository, license).
- `plugins/fhenix-toolkit/.claude-plugin/plugin.json` — plugin manifest.
- `CLAUDE.md` at repo root — primer Claude reads when the plugin is loaded; documents activation map, skill layering, hard rules, lookup-driven philosophy.
- `compatibility.json` — upstream version window: `@cofhe/sdk ^0.5.0`, `@fhenixprotocol/cofhe-contracts ^0.2.0`.

#### Docs

- `README.md` — marketing-grade with `<picture>`-based light/dark Fhenix logo, three-stat headline, problem→solution table, install instructions in `@FhenixProtocol` form.
- `docs/SPEC.md` — full plugin design spec.
- `docs/architecture.md` — runtime model, skill anatomy, lookup-driven philosophy, file map.
- `docs/known-flaws.md` — honest coverage-gap catalog grouped by skill + infra.
- `docs/release-process.md` — version bump rules, manual compatibility-bump flow.
- `docs/ci.md` — link-check + lookup-recipe-smoke workflow documentation.
- `docs/community-feedback.md` — feedback intake + per-release audit cadence.
- `assets/fhenix-logo.svg` + `assets/fhenix-logo-dark.svg` — official Fhenix logo (light + dark variants).

#### CI + infra

- `.github/workflows/link-check.yml` — daily Lychee link check across all markdown, with `.lycheeignore` allowlist.
- `.github/workflows/lookup-recipe-smoke.yml` — daily extraction + HEAD-check of every URL referenced from `plugins/*/skills/*/references/lookup-recipes.md`. Catches upstream repo moves before they break user installs.
- `.github/CODEOWNERS` — routes PRs to `@fhenixprotocol/protocol-team` + `@toml01`.

### Notes

- **Install:** `/plugin marketplace add FhenixProtocol/fhenix-toolkit` then `/plugin install fhenix-toolkit`.
- **Repo is public.** Anyone can install.
- **`fhenix-migrate`** (legacy `cofhejs` → `@cofhe/sdk`) is deferred to v1.5. Spec retained at `docs/SPEC.md` §5.3.
- **`on-cofhe-release.yml`** (auto-PR on upstream majors) deferred to v1.0; manual bump flow documented in `docs/release-process.md`.

[0.2.0]: https://github.com/FhenixProtocol/fhenix-toolkit/releases/tag/v0.2.0
[0.1.1]: https://github.com/FhenixProtocol/fhenix-toolkit/releases/tag/v0.1.1
[0.1.0]: https://github.com/FhenixProtocol/fhenix-toolkit/releases/tag/v0.1.0
