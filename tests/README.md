# Tests

Two commands, two jobs. `npm test` **produces something you can look at**; `npm run test:gates` **verifies what you changed**.

```bash
npm test                  # generate tests/sandbox — a real `dprov init`
npm run test:gates        # assert the sandbox and the change are correct
npm run test:gates:fixtures  # the header gate's own regression fixtures
npm run snapshot          # rewrite tests/init-tree.txt after an intended change
```

## Inspecting what init produces

Run `npm test`. It wipes and rebuilds `tests/sandbox/` with a real `dprov init`, so that directory is the current output of the command, not a mock:

```text
tests/sandbox/
  AGENTS.md
  docs-constraint.yaml
  docs/AGENTS.md
  docs/doc-header.md
  .agents/skills/{doc-constraint,doc-standard,doc-flow}/
  .agents/notes/{implemented,proposed,rejected,archived}/
```

Open it, edit a file in it, run `bin/dprov.js audit tests/sandbox` against it — that is the reproducibility you get from a real install instead of a fixture.

The sandbox is disposable and git-ignored. The record of what it should contain is `tests/init-tree.txt`, which is written by `npm run snapshot` and reviewed in a diff.

## Verifying a change

Run `npm run test:gates`. It regenerates the sandbox, then asserts:

| Suite | Asserts |
|---|---|
| `init.test.ts` | The sandbox equals `init-tree.txt`, vendors only the runtime surface, links resolve, and every gate passes on it |
| `edit.test.ts` | One edit per case: the matching gate fails, and says why |
| `flow.test.ts` | The loop closes: route → audit → fail → fix → pass; two breaks surface in one run; doctor catches a tampered gate |
| `lifecycle.test.ts` | Every guarded status transition, including the two that look like exceptions |
| `cli-skill-resolution.test.ts` | The CLI resolves each skill from this repo's own `assets/` |

## The working rhythm

```text
npm test ──▶ inspect tests/sandbox ──▶ change code ──▶ npm run test:gates
                                                          │
                            intended? ──▶ npm run snapshot ──▶ review the diff
```

## Reading a green run

A glob that matches no file reports `# tests 0` and exits 0, so an empty suite and a passing suite look identical. Check the count.
