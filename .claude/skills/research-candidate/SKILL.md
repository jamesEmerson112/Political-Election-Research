---
name: research-candidate
description: Research California election candidates for this dataset using the deterministic agent loop (next -> research -> put -> validate -> commit). Use when asked to research a contest, a candidate, or "the next task".
---

# Research a candidate or contest

Follow AGENTS.md exactly. In short:

1. `npm run -s next -- --json --limit 1` (add `--contest <id>` and/or `--subject person:<slug>` if the user named one). If it reports validation errors, fix those first.
2. Open the task's `guide` section in docs/RESEARCH_GUIDE.md and follow its search order.
3. Open every source yourself. Register each with `npm run -s put -- source` and use the `ref` it prints.
4. Write the result with `npm run -s put -- <put kind from the task>`. If `put` rejects it, fix the record. Never hand-write ids or paths.
5. Run `npm run -s validate` (0 errors), then commit with message `research(<contest>): <task id>`.
6. Repeat until the user's scope is done, then run `npm run -s coverage -- <contest>` and report asymmetries and skipped tasks.

Hard stops: never record anything you did not read in a source during this session; quotes must be verbatim; never infer a stance; if a source is unreachable, skip the task and report it instead of substituting.
