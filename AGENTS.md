# Fhenix toolkit — agent instructions (Cursor / Codex / Copilot)

This repository is the multi-tool distribution of the Fhenix CoFHE developer toolkit.

## Install paths

| Tool | How to load the curated skills |
| --- | --- |
| Claude Code | `/plugin marketplace add FhenixProtocol/fhenix-toolkit` then `/plugin install fhenix-toolkit` |
| Cursor | Open this repo (or add it as a project). Cursor rules under `.cursor/rules/` activate on matching globs. Point the agent at `plugins/fhenix-toolkit/skills/*/SKILL.md` for full recipes. |
| Codex CLI / other agents | Add this `AGENTS.md` plus the `plugins/fhenix-toolkit/skills/` tree to the agent's instruction/files allowlist. Skills are plain markdown. |

## Skill map

| Skill | Use when |
| --- | --- |
| `fhenix-contracts` | Writing/editing FHE Solidity |
| `fhenix-sdk` | Integrating `@cofhe/sdk` |
| `fhenix-review` | Auditing confidential code / PR review |
| `fhenix-tests` | Writing Foundry/Hardhat FHE tests |

## Non-negotiables

- Lookup-driven: do not invent FHE.sol / SDK APIs — fetch from public Fhenix repos.
- No `if`/`require` on `ebool`; use `FHE.select`.
- ACL after every encrypted write.
