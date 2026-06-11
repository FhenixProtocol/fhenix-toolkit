# Release process

How fhenix-toolkit versions get cut and what triggers a bump.

## Versioning

The plugin uses its own semver, decoupled from `@cofhe/sdk` and `cofhe-contracts` versions ([SPEC §10](SPEC.md)):

| Plugin bump | When |
|---|---|
| **Patch** (0.1.0 → 0.1.1) | Bug fixes in skill content, lookup-recipe URL fixes, gotcha catalog corrections, doc fixes |
| **Minor** (0.1.0 → 0.2.0) | New concept files, new gotchas added to catalog, new lookup recipes, new skills landing into v1 scope |
| **Major** (0.x → 1.0, 1.x → 2.0) | Skill renames, activation-trigger changes, removed concepts, restructuring that breaks `Skill(skill="...")` invocations |

CoFHE upstream version bumps (`@cofhe/sdk`, `cofhe-contracts`) are handled separately via `compatibility.json` — see below.

## The release cut

1. **Pick a version.** Look at what's landed in `## [Unreleased]` of `CHANGELOG.md` since the last tag. Match it against the table above.
2. **Update version in four places** — they have to stay in sync:
   - `.claude-plugin/marketplace.json` → `metadata.version` AND `plugins[0].version`
   - `.claude-plugin/marketplace.json` → `plugins[0].source.ref` (the tag the install actually resolves to: bump this to `vX.Y.Z`)
   - `plugins/fhenix-toolkit/.claude-plugin/plugin.json` → `version`
   - `CHANGELOG.md` → rename `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD` and add a fresh `## [Unreleased]` block above
3. **Open a release PR** titled `[RELEASE] vX.Y.Z`. The PR body summarizes the user-visible changes (copied / refined from the CHANGELOG entry).
4. **Merge to main.**
5. **Tag the merge commit:**
   ```
   git tag -a vX.Y.Z -m "vX.Y.Z — <short summary>"
   git push origin vX.Y.Z
   ```
   > The `source.ref` you set in step 2 points at this tag, so until it's pushed the ref is dangling and a fresh `/plugin install` won't resolve. Tag right after merging, and don't leave `main` un-tagged once the bumped `ref` has landed.
   >
   > Existing installs pick the new tag up with `/plugin marketplace update` followed by `/plugin update fhenix-toolkit`, no remove + re-add needed. Update detection keys off the plugin `version`, not the `ref`, which is why step 2 bumps both together: a `ref` bump with an unchanged version is silently skipped.
6. **Create the GitHub release** (`gh release create vX.Y.Z --notes-file <release notes>`). Release notes are typically the CHANGELOG entry for that version, lightly polished.

Users who installed with `@FhenixProtocol` pin to the latest published release once a tag exists.

## Compatibility bumps (upstream majors)

`compatibility.json` declares which `@cofhe/sdk` and `cofhe-contracts` majors the curated content was authored against:

```json
{
  "@cofhe/sdk": "^0.5.0",
  "@fhenixprotocol/cofhe-contracts": "^0.2.0"
}
```

The plugin tracks a **single major per upstream dep**, not a matrix. When upstream majors, the plugin picks the new one and moves forward.

### Intended flow (deferred to v1.0)

Per [SPEC §9](SPEC.md) and [`docs/ci.md`](ci.md):

1. Upstream majors release.
2. Workflows in `cofhesdk` / `cofhe-contracts` fire `repository_dispatch` into this repo.
3. `on-cofhe-release.yml` (not yet built) auto-opens a PR titled `Bump compatibility.json to vX.Y — review lookup recipes for drift`.
4. Maintainer reviews drift, fixes whatever broke (renamed functions, removed flags, changed semantics), merges.

### Current manual flow

Until `on-cofhe-release.yml` lands, this is human-driven:

1. Notice the upstream major release (subscribe to `cofhesdk` / `cofhe-contracts` releases on GitHub).
2. Bump `compatibility.json` to the new caret range.
3. Run the lookup recipes locally against the new version — check that grepped symbols still resolve in the new source.
4. Update any concept files / hard-rules that the new version changes.
5. Cut a plugin **minor or major** release depending on how invasive the changes are.

The bump PR title convention is `[CHORE] bump compatibility.json to vX.Y` (or `[FIX]` if it also patches broken skill content).

## Patch / minor upstream releases

These do **not** trigger a compatibility bump. The curated content shouldn't churn on them — concepts, hard rules, and the ACL taxonomy don't move on a minor release.

If a minor release breaks something (a renamed function, a changed default), it's caught by `lookup-recipe-smoke.yml` and surfaces as a CI failure on the next nightly run. That failure is the trigger to patch the recipe (and maybe the concept file that links to it), then cut a plugin patch release.

## What to do if you find broken content after a release

1. Open a normal bug-fix PR against `main`.
2. Add the fix entry under `## [Unreleased]` in CHANGELOG.
3. Cut a patch release as soon as practical.

Don't sit on broken content. The plugin is teaching Claude how to write production-critical confidential code; silently-wrong skill output is the worst failure mode.

## Pre-1.0 caveats

While we're in v0.x (pre-1.0):

- Tag often — every meaningful change can get a tag, since there are no external consumers being disrupted.
- Don't be precious about majors — a v0.x → v0.(x+1) major is cheap.
- Once we hit v1.0 (public release), tighten this up: minors land only after a working integration test against `cofhe-hardhat-starter`, majors require a migration note in the release body.
