# fhenix-toolkit

Claude Code plugin for building confidential smart contracts and dApps on **Fhenix CoFHE** — the FHE coprocessor — using `FHE.sol` and `@cofhe/sdk`.

Four skills shipping in v1 (one more planned):

| Skill | Purpose | Activates on |
|---|---|---|
| `fhenix-contracts` | Write confidential Solidity contracts | Files importing `FHE.sol` or using `euint*` / `ebool` |
| `fhenix-sdk` | Integrate `@cofhe/sdk` (encrypt, decrypt, permits) | Files importing `@cofhe/sdk` |
| `fhenix-review` | Audit confidential code for ACL bugs, decrypt-flow mismatches, plaintext leaks | PR-review flows; explicit "audit this" prompts |
| `fhenix-tests` | Write tests for confidential contracts (Foundry mocks, Hardhat plugin) | Test files importing FHE.sol or `@cofhe/sdk` |
| `fhenix-migrate` *(v1.5)* | Migrate from legacy `cofhejs` to `@cofhe/sdk` | Files importing `cofhejs` |

## Install (Claude Code)

```
/plugin marketplace add FhenixProtocol/fhenix-toolkit
/plugin install fhenix-toolkit
```

## Status

Early / private. Public release pending — see [`docs/SPEC.md`](docs/SPEC.md) for the roadmap.

## Design philosophy

This plugin teaches Claude **how to look up current information**, not snapshots of it. Concepts, decision trees, and gotchas are curated. API surfaces (FHE.sol functions, SDK methods, error codes) are looked up live from the public Fhenix repos at the moment of need. That way the plugin stays correct as the underlying SDK and contracts evolve, without constant snapshot maintenance.

## Resources

- Fhenix docs — https://cofhe-docs.fhenix.zone
- `@fhenixprotocol/cofhe-contracts` — https://github.com/FhenixProtocol/cofhe-contracts
- `@cofhe/sdk` — https://github.com/FhenixProtocol/cofhesdk
- Hardhat starter — https://github.com/FhenixProtocol/cofhe-hardhat-starter
- Foundry / Hardhat mocks — https://github.com/FhenixProtocol/cofhe-mock-contracts (the old `cofhe-foundry-mocks` repo is archived)

## License

MIT. See [`LICENSE`](LICENSE).
