# Architecture

How fhenix-toolkit is put together, why, and what each piece does at runtime.

## The five-piece model

The plugin is four skills plus one subagent, with a thin lookup layer underneath.

```
                       ┌────────────────────────────────┐
                       │     Claude Code session        │
                       └───────────────┬────────────────┘
                                       │ file imports, prompts, gh pr view output
                                       ▼
        ┌──────────────────────────────────────────────────────────────┐
        │           Skills (activated by description matching)          │
        │                                                              │
        │   fhenix-contracts ─── authoring                              │
        │   fhenix-sdk       ─── authoring        ┐                    │
        │   fhenix-tests     ─── testing          ├── layer cleanly    │
        │   fhenix-review    ─── audit lens       ┘                    │
        │                                                              │
        └──────────────────────────────┬───────────────────────────────┘
                                       │ invoked for deep audit
                                       ▼
                          ┌──────────────────────────┐
                          │  fhe-reviewer subagent    │
                          │  (fresh context, full     │
                          │  gotcha catalog loaded)   │
                          └──────────────┬───────────┘
                                         │ recipes
                                         ▼
                  ┌─────────────────────────────────────┐
                  │  Lookup recipes → public Fhenix     │
                  │  repos (FHE.sol, cofhesdk, mocks)   │
                  └─────────────────────────────────────┘
```

## Skill anatomy

Every skill lives under `plugins/fhenix-toolkit/skills/<name>/` and has:

```
skills/<name>/
├── SKILL.md                      # frontmatter (name, description) + activation prompt
└── references/
    ├── concepts/                 # focused timeless concepts (one per file)
    ├── hard-rules.md             # never-violate rules
    ├── decision-trees.md         # when to use what
    └── lookup-recipes.md         # how to fetch live API surface
```

The `description:` field in SKILL.md frontmatter is what Claude Code matches against to decide activation. It carries the trigger surface — file patterns, type names, prompt cues — concentrated into one line.

### Why split into `references/`?

The SKILL.md itself is loaded into every activation. Heavy content (concept files, decision trees, the 30+ gotcha catalog) is split out so it doesn't bloat context until the model actually needs it. Skills tell Claude *which reference to read* for the specific question at hand, rather than dumping everything every time.

## The subagent pattern

`fhe-reviewer` is the only subagent. It exists because:

- The full gotcha catalog (`references/gotchas.md`) is ~30 items with examples — too heavy for routine activation.
- Deep audit passes benefit from a **fresh context window** that hasn't been polluted by the conversation up to that point.
- Subagents return structured reports back to the parent skill, which the parent renders to the user.

`fhenix-review` activates on every review-context prompt; `fhe-reviewer` is invoked only for substantial diffs or pre-launch audits. The decision tree lives in `fhenix-review/references/decision-trees.md`.

## Lookup-driven content (the key choice)

This plugin **does not snapshot** the FHE.sol or `@cofhe/sdk` API surface. The cost of snapshots is high:

- Snapshots go stale every minor release.
- Maintaining them requires constant manual drift-checking.
- A stale snapshot is worse than no snapshot — the model trusts it.

Instead, every skill ships a `references/lookup-recipes.md` that tells Claude *exactly how* to fetch the current source of truth:

```
# from skills/fhenix-contracts/references/lookup-recipes.md
curl -s https://raw.githubusercontent.com/FhenixProtocol/cofhe-contracts/main/contracts/FHE.sol \
  | grep -nE "function (allowGlobal|allowPublic)\b" -A 20
```

When Claude needs to know the current signature of `FHE.allowPublic`, it runs the recipe and quotes the result. The signature is always whatever upstream shipped today.

CI (`lookup-recipe-smoke.yml`) verifies that every recipe URL still resolves. If FhenixProtocol moves a file, CI fails and the recipe gets updated — drift surfaces as a build break, not as silently-wrong Claude output.

## Compatibility window

`compatibility.json` declares which upstream majors the curated content was authored against:

```json
{
  "@cofhe/sdk": "^0.5.0",
  "@fhenixprotocol/cofhe-contracts": "^0.2.0"
}
```

This is a **single window per dep**, not a matrix. When upstream majors, the plugin doesn't ship parallel content for old + new; it picks one and moves forward. See [`docs/release-process.md`](release-process.md) for the bump flow.

## What this plugin is NOT

- **Not a code generator.** Skills don't carry copy-paste templates of contracts. They teach patterns and link to canonical example repos (`poc-shielded-stablecoin`, `poc-sealed-bid-auction`, `rfq-demo`) for reference implementations.
- **Not a CLI / MCP server.** No commands, no servers, no runtime state. It's pure activation-driven instruction.
- **Not a workflow engine.** No router, no persistent task state, no orchestration. Each skill is an additive lens on the model's existing reasoning. (Inspiration came from looking at cc10x; the runtime-orchestration shape is wrong for a content plugin.)
- **Not version-pinned to CoFHE.** The plugin has its own semver, decoupled from upstream versions per [`docs/SPEC.md`](SPEC.md) §10.

## File map

```
.
├── .claude-plugin/marketplace.json   # marketplace manifest (this plugin's address)
├── plugins/fhenix-toolkit/           # the actual plugin
│   ├── .claude-plugin/plugin.json    # plugin manifest
│   ├── skills/                       # the four skills
│   └── agents/                       # fhe-reviewer subagent
├── bankr/                            # Bankr agent skills (not loaded by Claude Code; see bankr/README.md)
├── docs/                             # design, architecture, process
├── compatibility.json                # upstream version window
├── CHANGELOG.md                      # keep-a-changelog
├── CLAUDE.md                         # primer for Claude when this plugin is loaded
├── README.md                         # user-facing pitch + install
└── .github/                          # CI workflows, CODEOWNERS
```
