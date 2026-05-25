# Known flaws / coverage gaps

What the plugin doesn't do well yet, ordered roughly by impact.

The goal of this file is to be honest about the gaps so users can compensate and contributors know where to push. If you hit something not on this list, open an issue per [`community-feedback.md`](community-feedback.md) and we'll triage.

## Coverage gaps in shipped skills

### `fhenix-contracts`

- **No coverage of confidential ERC721 / ERC1155.** Only the fungible-token standards are mapped. The non-fungible side has different ACL semantics (per-token-id allows) that aren't documented.
- **Cross-security-zone interactions.** The skill flags the security-zone parameter but doesn't document the rules for ops that span zones. Treat as out-of-scope until the SDK lands a stable cross-zone API.
- **Gas-cost guidance is sparse.** The skill teaches *correctness*; production gas-tuning advice (when to batch, when to delay an `allowThis`) isn't yet shipped.

### `fhenix-sdk`

- **No coverage of server-side / Node-only flows.** The skill emphasizes browser/SSR. Pure-backend integrations (relayer services, indexers) get a thinner treatment.
- **Permit-lifecycle edge cases under aggressive caching.** The canonical permit flow assumes one app, one user, modest cache. Multi-tenant SDK setups (e.g., wallet aggregators) have permit-rotation patterns the skill doesn't yet cover.

### `fhenix-review`

- **Composability audit lens is thin.** The 30+ gotcha catalog focuses on single-contract issues. Cross-contract patterns (encrypted-value routing through a router/diamond, callback re-entry under FHE delays) aren't well covered.
- **Off-chain decryption-flow auditing is biased toward the canonical recipes.** Non-canonical patterns (custom permit derivation, partial-permit caching) won't always be recognized.
- **No coverage of MEV considerations.** Confidential contracts have a different MEV surface than plaintext ones (timing channels, partial-reveal arbitrage). The skill doesn't yet teach how to think about it.

### `fhenix-tests`

- **Mock-vs-prod divergence is flagged but not quantified.** The skill warns "mock gas ≠ prod gas" but doesn't carry a current divergence table. The recipe to fetch one isn't easy to write (depends on Fhenix publishing it).
- **No coverage of Foundry's `vm.snapshot` interaction with FHE state.** Snapshots of encrypted state under the mock interact with the test environment in ways that surprise new users.
- **No load-testing or fuzz-testing recipes.** Confidential contracts have unique fuzzing needs (entropy sources, non-determinism under FHE).

### `fhe-reviewer` subagent

- **Severity ratings are heuristic.** The subagent emits Critical / High / Medium / Low ratings using catalog rules. Two reviewers with the same diff would probably converge; with novel patterns, ratings drift.
- **No machine-readable output format yet.** Reports are markdown only. Downstream tooling (status-check bots, dashboard ingest) has to parse free text.

## Infrastructure gaps

### `on-cofhe-release.yml` workflow

Not built. SPEC §9 and `docs/ci.md` describe the intent: `cofhesdk` / `cofhe-contracts` fire `repository_dispatch` on major releases, and this workflow opens an auto-PR bumping `compatibility.json`. Until it exists, drift detection is manual — someone has to notice the major release and open the PR by hand. See [`docs/release-process.md`](release-process.md) for the current manual flow.

### Lookup-recipe smoke covers URLs, not content

`lookup-recipe-smoke.yml` verifies every URL still 200s. It doesn't verify that the *content* at the URL is what the recipe expects (e.g., that `FHE.sol` still contains the function the recipe greps for). A renamed function would pass the smoke check but break the recipe semantically.

A future enhancement: smoke checks should `grep` for the target symbol in the fetched file, not just confirm the URL resolves.

### CODEOWNERS is minimal

`.github/CODEOWNERS` routes everything to `@fhenixprotocol/protocol-team` + `@toml01`. Per-area routing (contracts team for `/plugins/fhenix-toolkit/skills/fhenix-contracts/`, SDK team for `/plugins/fhenix-toolkit/skills/fhenix-sdk/`, etc.) was intentionally deferred — we wanted to mirror the simple cofhe pattern first. Revisit when the maintainer count grows.

### Default install floats on default-branch HEAD

`v0.1.0` is tagged and a GitHub release exists, but the default install command (`/plugin install fhenix-toolkit`) still resolves to whatever's on `main` right now, not the tagged release. Users who want reproducibility have to pin explicitly (`/plugin install fhenix-toolkit@v0.1.0`, syntax TBC). Until we publish a clear "how to pin" recipe in the README, expect installs to drift quietly as `main` advances between releases.

## Inherent limitations (not gaps — by design)

### No code snapshots

The plugin doesn't ship copy-paste templates of FHE.sol or `@cofhe/sdk` API calls. Users sometimes ask for them. The design philosophy is **link to canonical examples, don't vendor patterns** — see [`docs/architecture.md`](architecture.md) "Lookup-driven content."

If we ever ship templates, they go in `plugins/fhenix-toolkit/templates/` and the skills reference them by path.

### Activation can miss when context is sparse

Skills activate from file context (imports, type names) and prompt cues. A user pasting a code snippet into a fresh chat with no file open may not trigger the right skill automatically. Workaround: invoke explicitly with `Skill(skill="fhenix-review")`.

The trigger surface in each SKILL.md `description:` is tuned to catch as much as possible without false positives, but it's not perfect. Real-world drift cases (people saying "look over my FHE code" in non-standard phrasing) get added to the description over time.

### Plugin doesn't catch network-side issues

The plugin teaches contract + SDK patterns. It doesn't audit:
- threshold-network configuration
- coordinator / dispatcher behavior
- party-member quorum and rotation
- ciphertext-server availability

Those are operational concerns owned by Fhenix infra, not application-layer surface. If your bug is "the network returned a stale result" or "the decrypt took 30 seconds," this plugin won't help. See https://cofhe-docs.fhenix.zone for ops docs.
