# Contributing

Thanks for helping. The dataset is only useful if it is accurate and even-handed, so contributions follow a strict process. Most of it is enforced by tooling.

1. Read [docs/METHODOLOGY.md](docs/METHODOLOGY.md).
2. Pick work from the queue: `npm run -s next -- --contest <contest>` (add `--subject person:<slug>` to work on one candidate). Each task links to its section of [docs/RESEARCH_GUIDE.md](docs/RESEARCH_GUIDE.md).
3. Write records with `npm run -s put -- <kind>`, not by hand. It computes ids, paths and formatting. (Hand edits are fine for fixes; run `npm run fmt` afterwards.)
4. Before opening a PR, run `npm run check` (typecheck, formatting, validation, tests).
5. Keep PRs small: ideally one contest, or one candidate's tasks. Include in the PR description any task you skipped because a source was unreachable.

## Changing the agenda or the questions

Agendas and issue questions are editorial decisions that affect every candidate, so they are changed in their own PRs, never mixed with research. Explain the reason. When removing a question, move it to `rejected_questions` with the reason. Don't change a contest's questions once stance research on it has started, except to fix wording that is objectively wrong. In that case, re-check every recorded stance on that question.

## Changing the schema or the tooling

Add or adjust a rule? Add a failing fixture in `tests/fixtures/invalid/<RULE>.json`. The test suite checks that every rule has one and that each fixture triggers exactly its rule. When the fictional fixture needs to change, edit `tests/fixtures/make-valid-fixture.ts` and regenerate it with `npx tsx tests/fixtures/make-valid-fixture.ts`.

## License of contributions

Code contributions are licensed under the MIT License ([LICENSE](LICENSE)); data and documentation contributions under CC BY 4.0 ([LICENSE-DATA](LICENSE-DATA)). Quoted source material keeps its owners' terms.
