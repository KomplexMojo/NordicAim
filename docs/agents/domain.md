# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one `CONTEXT.md` and one `docs/adr/` at the root. Neither exists yet.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, if it exists.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in, if the directory exists.
- Project planning lives in `docs/PLAN.md` and `docs/spec/`. Those are authoritative for this repo; `CONTEXT.md` complements them and doesn't replace them.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md` when it exists, and the spec's names otherwise. Don't drift to synonyms the glossary or spec explicitly avoids.

## Flag ADR conflicts

If your output contradicts an existing ADR or spec, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
