<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/fhenix-logo-dark.svg">
    <img src="assets/fhenix-logo.svg" alt="Fhenix" width="260">
  </picture>
</p>

<h1 align="center">fhenix-toolkit</h1>

<p align="center">
  <em>Claude Code's confidential-DeFi toolkit. Write, test, and audit CoFHE code without the footguns.</em>
</p>

<p align="center">
  <strong>4 skills</strong> &nbsp;·&nbsp; <strong>1 audit subagent</strong> &nbsp;·&nbsp; <strong>30+ gotcha catalog</strong> &nbsp;·&nbsp; <strong>lookup-driven (stays current)</strong>
</p>

---

## Install

```
/plugin marketplace add FhenixProtocol/fhenix-toolkit
/plugin install fhenix-toolkit
```

Then ask Claude *"help me write a confidential ERC20"* or *"audit this FHE.sol contract"* — the right skill activates on its own.

---

## Why fhenix-toolkit

Writing confidential smart contracts is full of subtle traps that look fine in plaintext-land but silently break under FHE. ACL slips. Decrypt flow mismatches. Type-tag misreads. Plaintext leaking through events or gas. A model with general Solidity knowledge will produce code that *compiles* and *passes mock tests* — and is unsafe in production.

This plugin closes that gap.

| The pain you know | How fhenix-toolkit handles it |
|---|---|
| Claude writes `if (FHE.gt(a, b))` and your tests pass against the mock | `fhenix-contracts` activates on the import, refuses `if/require` on `ebool`, routes to `FHE.select` |
| Stored encrypted state but forgot `FHE.allowThis` — next transaction reverts | Hard-rules check fires before you submit. `fhenix-review` flags it as **Critical (G1)** on PR review |
| `decryptForTx().withoutPermit()` silently 0s out because the contract didn't call `FHE.allowPublic` | `fhenix-review` flags it as **Critical (G15)** with the matching on-chain fix |
| Narrowing cast `asEuint8(euint64Val)` decrypts to a value you didn't expect | Gotcha **G3** explains the modular-reduction semantics and the saturation patterns |
| Test passes on mocks, fails in prod because gas profile differs | `fhenix-tests` carries the **mock-gas ≠ prod-gas** warning and the mocks-vs-plugin decision tree |
| Skill says X but the SDK shipped Y last week | Plugin is **lookup-driven**: no snapshots, every code reference is a recipe that pulls live from the public Fhenix repos |

Each skill activates on the right context (file imports, file extensions, prompt cues) so you don't pay context cost for skills you aren't using.

---

## What ships

| Skill | Activates on | Purpose |
|---|---|---|
| `fhenix-contracts` | Solidity files importing `@fhenixprotocol/cofhe-contracts/FHE.sol`, or files using `euint*` / `ebool` / `eaddress` | Hard rules (`FHE.select`, ACL cascade, no encrypted `mul`/`div`), the four-verb ACL taxonomy, three decrypt-flow choices, confidential-token standards picker |
| `fhenix-sdk` | Files importing `@cofhe/sdk` or its subpaths; hooks like `useCofhe*` | Canonical init recipe, decrypt-flow decision tree (`decryptForView` vs `decryptForTx`), permit lifecycle, encrypted-input ABI cast |
| `fhenix-review` | PR-review prompts, `gh pr view` output, "audit this" / "is this safe" requests | 30+ gotcha catalog, security checklist, ACL/decrypt-flow audit lens, confidentiality-vs-anonymity guardrails |
| `fhenix-tests` | `.test.ts` / `.t.sol` importing FHE.sol or `@cofhe/sdk` | Foundry-mocks vs Hardhat-plugin decision, encrypted-input fixtures, decrypt-flow tests, multi-permit, mock-vs-prod divergence |

Plus the **`fhe-reviewer` subagent** — deep-audit companion to `fhenix-review`. Invoked for substantial diffs (>200 LOC of FHE code) or pre-launch audits. Loads the full catalog into a fresh context, walks function-by-function, returns a prioritized report.

`fhenix-migrate` (legacy `cofhejs` → `@cofhe/sdk`) is deferred to v1.5 — design intact, ship timing TBD.

---

## Design philosophy

**Curated wisdom, looked-up specifics.** The skills carry concepts, decision trees, and gotchas — the things that don't change between releases. API surfaces (FHE.sol functions, SDK method signatures, error codes, deployed addresses) are looked up live from the public Fhenix repos at the moment of need.

That way the plugin stays correct as the SDK and contracts evolve, without constant snapshot maintenance. Drift gets caught by CI (`lookup-recipe-smoke.yml`) and surfaces as a failed build, not as silently-wrong Claude output.

See [`docs/SPEC.md`](docs/SPEC.md) and [`docs/architecture.md`](docs/architecture.md) for the full design.

---

## Resources

- Fhenix docs — https://cofhe-docs.fhenix.zone
- `@fhenixprotocol/cofhe-contracts` — https://github.com/FhenixProtocol/cofhe-contracts
- `@cofhe/sdk` — https://github.com/FhenixProtocol/cofhesdk
- Hardhat starter — https://github.com/FhenixProtocol/cofhe-hardhat-starter
- Foundry mocks (current) — https://github.com/FhenixProtocol/cofhe-mock-contracts
- Foundry mocks (archived) — https://github.com/FhenixProtocol/cofhe-foundry-mocks

---

## Status

**Public, pre-1.0.** All four v1 skills are merged. The remaining v1.0 milestone is tagging the first release. See [`docs/SPEC.md`](docs/SPEC.md) §10 for the release plan and [`docs/known-flaws.md`](docs/known-flaws.md) for current gaps in coverage.

## Reporting issues / community feedback

Open a GitHub issue. The feedback loop and review cadence are documented in [`docs/community-feedback.md`](docs/community-feedback.md).

## Contributing

PR-review routing is in [`.github/CODEOWNERS`](.github/CODEOWNERS). The release process is in [`docs/release-process.md`](docs/release-process.md).

## CI

Two GitHub Actions workflows — `link-check` and `lookup-recipe-smoke` — run on push, PR, and daily cron. See [`docs/ci.md`](docs/ci.md) for details.

## License

MIT. See [`LICENSE`](LICENSE).
