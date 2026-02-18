# MVP Design Review (2026-02-18)

## Recommendation

Use Electron + React for the initial MVP. Keep React Native out of scope until mobile is a goal.

## What is strong

1. Local-first JSON persistence is a good MVP lock that keeps complexity low.
2. Canonical `cm` with configurable display units prevents data drift.
3. Explicit rounding policy is the right call for knitting correctness.
4. Template copy-on-write avoids destructive edits to built-ins.
5. Epic order is pragmatic: storage -> templates -> derivation -> instructions -> colorwork.

## Gaps to close before implementation expands

1. Define coordinate system and orientation rules for geometry:
   - origin location
   - y-direction
   - whether points can go negative
2. Define schema migration contract now (even before SQLite):
   - file with higher version is blocked
   - file with lower version runs deterministic migration chain
3. Clarify profile linkage semantics:
   - project references profile IDs
   - project keeps snapshots for reproducibility
4. Lock row completion granularity:
   - set-of-rows vs max-completed-row behavior for instructions + charts
5. Add test vectors for gauge + rounding examples from spec to prevent regressions.

## Platform decision notes

- Electron:
  - one codebase for Windows/macOS/Linux
  - native filesystem support for local JSON
  - easiest route to a panel-heavy desktop UX
- React Native desktop:
  - separate platform adapters
  - no first-party Linux desktop path
  - higher setup and maintenance burden for your specific platform goals
