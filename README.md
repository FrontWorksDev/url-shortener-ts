[![codecov](https://codecov.io/gh/FrontWorksDev/url-shortener-ts/graph/badge.svg)](https://codecov.io/gh/FrontWorksDev/url-shortener-ts)

To install dependencies:

```sh
bun install
```

This also installs Git hooks: the `prepare` script runs `lefthook install`, which sets up a
`pre-push` hook that runs every quality gate before a push. No manual setup is needed.

To run:

```sh
bun run dev
```

open <http://localhost:3000>

To type check:

```sh
bun run typecheck
```

The same command runs in the `pre-push` hook and in CI (`.github/workflows/ci.yml`).

## Lint and format

Linting and formatting are handled by [Biome](https://biomejs.dev/) (`biome.json`). `check` is the
single entry point — it runs the formatter, the linter, and the assist actions (import sorting,
`package.json` key sorting) in one pass. There are deliberately no separate `format` or `lint`
scripts: one command means local, hook, and CI cannot drift apart on which of the three ran.

```sh
bun run check        # report formatting, lint, and assist issues
bun run check:fix    # ...and write the fixes
```

Both run against the paths in `biome.json`'s `files.includes` — `src/**` plus the root-level config
JSON — so no path argument is needed. Pass one to narrow the run:

```sh
bun run check src/index.ts
```

`bun run check` is enforced, so a violation blocks the push:

| Where | What runs |
| --- | --- |
| `pre-push` hook (`lefthook.yml`) | `bun run check`, in parallel with the other `pre-push` jobs |
| CI (`.github/workflows/ci.yml`) | `bun run check:ci` |

`check:ci` runs Biome's `ci` subcommand instead of `check`. Same rules over the same files, but it
refuses `--write` and it prints GitHub Actions annotations, so failures show up inline on the PR
diff. Both use the Biome pinned in `package.json`, so a CI failure reproduces locally with
`bun run check` and is fixed with `bun run check:fix`.

## Tests

Tests run on Bun's built-in test runner (`bun:test`). There is nothing to install and nothing to
pin: the runner ships with the Bun version already fixed in `.tool-versions`.

```sh
bun test                             # everything
bun test src/index.test.ts           # one file
bun test --test-name-pattern "解決"  # by test name
bun test --watch                     # re-run on change
```

Test files sit next to the code they cover, named `*.test.ts`.

The `pre-push` hook calls `bun test` with no arguments and no `package.json` script behind it. A
script exists to keep a flag set identical across call sites — `typecheck` and `check` each wrap a
pinned binary whose flags must not drift between the laptop, the hook, and CI. A bare `bun test`
has no flags to drift and resolves to the runtime itself, so wrapping it would only add a name.

CI runs the same tests with coverage on, and that *does* carry flags — see below.

## Coverage

Coverage comes from Bun's own runner (`bun test --coverage`); there is no c8 or nyc in the tree.

```sh
bun run test:coverage    # bun test --coverage
```

This one is a script precisely because it carries flags: the CI leg and anyone reproducing a
coverage number locally have to run the identical command, which is the same reason `typecheck` and
`check` are scripts. What the flags do *not* carry is the choice of reporter — that lives in
`bunfig.toml` as `coverageReporter = ["text", "lcov"]`, where no call site can pick a different one.
`text` prints the table you see locally, `lcov` writes `coverage/lcov.info` for Codecov, and both
outputs are already in `.gitignore`, so the artifacts never reach a commit.

`[test]` holds nothing else on purpose. Bun also offers `root`, which points test discovery at a
subdirectory, and `root = "./src/"` looks obviously correct in a repo whose tests all sit in `src/`.
It is not: it turns discovery into an allowlist, and a test file placed anywhere else is then not
run, not reported, and not counted as missing. Nothing goes red — the suite just quietly gets
smaller, which is the one failure a test suite cannot afford. Leaving `root` unset costs nothing,
since Bun skips `node_modules` on its own.

One property of the number is worth knowing before trusting it: Bun measures only the files the test
run actually imports. A module no test touches is not reported as 0% — it does not appear in the
report at all, and the percentage is computed as if it did not exist. Adding an entirely untested
module therefore leaves coverage unchanged, or raises it. Verified: a source file with two uncovered
functions, imported by nothing, produced no row in the table and no `SF:` entry in `lcov.info`, with
the total still reading 100%.

Bun writes repository-root-relative paths into the report (`SF:src/index.ts`), which is what Codecov
expects, so `codecov.yml` needs no `fixes:` block. Worth re-checking the generated `lcov.info` if the
layout ever moves: when the paths stop matching, files still upload — they just show up in Codecov
with no source attached, which reads as a Codecov problem rather than a path problem.

### Where the threshold lives

In `codecov.yml`, and nowhere else. Bun can enforce a minimum itself via `coverageThreshold` in
`bunfig.toml`; **do not add it back.** The problem is not just two owners for one number — it is
where the enforcement lands. A Codecov status is not a required check and cannot block a merge; the
`Test` leg is and does. Putting the threshold in `bunfig.toml` therefore converts an advisory
comment into a merge blocker, without that promotion appearing anywhere near the branch protection
settings that are supposed to decide it. Bun's scalar threshold also applies to *functions*, not
just lines, so one uncovered helper is enough to trigger it — which would undo the deliberately
gentle rollout below on the first PR that dips.

Both Codecov statuses start `informational: true`: they comment on the PR and never block the merge.
`project` compares against the base commit, `patch` looks only at the lines the PR touched. Flip
them to blocking once the numbers have been trustworthy for a while — that ordering is Codecov's own
recommendation, and it keeps the first few PRs from failing on a metric nobody has calibrated yet.

Whoever makes that call should re-read what `project` is measuring first. Because unimported files
are absent rather than zero, `project` is a percentage *of the code the tests reach*, not of the
codebase: a PR that adds a module with no tests at all cannot lower it. Do not assume `patch` closes
that gap either — those lines are missing from the uploaded report too, so there may be nothing for
Codecov to mark as uncovered. That exact case, a new file with no test, is the one to try against a
real upload before either status is trusted to block a merge.

### Why coverage is CI-only

The `pre-push` hook runs plain `bun test`, not `bun run test:coverage`. Instrumenting the run costs
time in the hook's budget and produces a number with nowhere to go: there is no upload and no base
commit to compare against locally. The test *results* still gate the push; only the measurement is
deferred to CI.

## CI

All three gates live in one workflow, `.github/workflows/ci.yml`, as a three-leg matrix — they need
the same Bun setup and the same `bun install`, and duplicating that across three files meant fixing
every change three times.

| Check name | Command |
| --- | --- |
| `Type Check` | `bun run typecheck` |
| `Biome` | `bun run check:ci` |
| `Test` | `bun run test:coverage` |

The check name is the matrix leg's `name`, and that is the string `main`'s branch protection has to
match. Rename a leg and the old name stays required forever, waiting on a check that no longer runs.

Those three are the required checks, and they are the only ones. `Validate Codecov` (below) runs in
CI but is deliberately **not** required, because it is `paths`-filtered: on a PR that does not touch
`codecov.yml` it never runs, and a required check that never reports does not resolve to "skipped" —
it sits at "Expected" and blocks the merge indefinitely. Requiring it would make every PR unmergeable
except the ones that happen to edit `codecov.yml`. The second reason is that it calls out to
codecov.io, and a check that can go red because someone else's service is having a bad day does not
belong in the set that decides whether code lands.

`fail-fast: false` matters here: the default cancels the remaining legs the moment one fails, so a
branch with a type error, a lint error, and a failing test would only ever show you one of the three
per push.

Adding a gate means adding a `matrix.include` entry alongside the `lefthook.yml` job — plus a
`package.json` script when the gate wraps a pinned binary rather than the runtime. The legs do not
share a runner, so this does not make CI faster — it removes the duplicated setup, nothing more.

That is the default shape, not the only one. A check that shares none of this setup, or that should
only run when certain files change, belongs in its own workflow instead — see "Validating
`codecov.yml`" below for the one that does.

### The Codecov upload

One step, `codecov/codecov-action@v7`, and it is guarded with `if: matrix.coverage`. The legs do not
share a runner, so `Type Check` and `Biome` have no `coverage/lcov.info` on disk — without the guard
the action runs three times and comes up empty twice.

The guard reads a `coverage: true` flag on the `Test` leg rather than comparing `matrix.name` to
`'Test'`, because that name is not free to change: it is the string branch protection matches, so
renaming the leg is already a two-place edit. Keying the upload off the display name would make it a
third, and the one that fails silently — the rename lands, the required check is updated, and the
upload simply stops happening with nothing red to point at it.

The rest of the `with:` block is not decoration:

- **`fail_ci_if_error: true`.** The default is `false`, and it means an expired token, a renamed
  output path, or a network blip leaves the step logging an error while the job goes green. Nothing
  else in the pipeline notices that coverage stopped updating; the badge just freezes at whatever it
  last read. Same failure shape as a stale `$schema` — silent because nothing checks it.
- **`files: ./coverage/lcov.info` together with `disable_search: true`.** These two only work as a
  pair. On its own, `files` *adds* to the reports the action finds by searching — it does not replace
  them — so the named path is free to rot: move `coverageDir` and the search happily uploads the
  report from its new location while the workflow still points at the old one, green the whole way.
  Turning the search off makes that path the only thing that can be uploaded, so a stale one fails
  the step instead of being quietly routed around. Same rule as `skipLibCheck` and the pinned
  toolchain versions: writing a value down is only worth it if something checks it.

Authentication is `secrets.CODECOV_TOKEN`. The alternative, `use_oidc: true`, drops the secret but
requires adding `id-token: write` to the workflow's `permissions`, which is otherwise `contents:
read` and worth keeping that way. The trade-off to know about: a pull request from a fork cannot read
repository secrets, so with `fail_ci_if_error: true` the upload step fails on fork PRs. That is
acceptable while this repo takes no outside contributions — revisit it the first time one arrives.

### Validating `codecov.yml`

Nothing in this repository reads `codecov.yml`. It is uploaded and interpreted on Codecov's side,
which means a typo in it breaks no build and fails no test — it just leaves the status quietly
behaving differently from what the file says. `.github/workflows/validate-codecov.yml` posts the file
to Codecov's validation API so that mistake has somewhere to surface:

```sh
curl --fail-with-body --silent --show-error --data-binary @codecov.yml https://codecov.io/validate
```

A valid file comes back `Valid!` followed by the config Codecov actually parsed, with its defaults
filled in around what you wrote — worth reading, not just exit-code checking. An unknown key comes
back HTTP 400 naming the exact path, e.g. `Error at ['coverage', 'status', 'project', 'default',
'informationall']: unknown field`.

`--fail-with-body` is doing real work there: it turns the 400 into a non-zero exit *and* still prints
the body. Plain `--fail` would exit non-zero with the explanation thrown away, and a bare `curl`
would print the explanation and exit 0 — a red check with no reason, or a green check with a broken
config.

It is a separate workflow rather than a fourth leg of `ci.yml` for two reasons. It shares none of
what justifies that matrix — no Bun, no `bun install`, no cache — so folding it in would have it sit
through the whole toolchain setup to run one `curl`. More decisively, it is `paths`-filtered to
`codecov.yml` and its own workflow file, and `paths` is a workflow-level trigger: a matrix leg cannot
be filtered on its own. As a leg it would either run on every push or drag the same filter across all
of CI, and CI has to run on every push.

### What belongs in `pre-push`

Every gate above runs in both places today, and that is the default: a check CI enforces should fail
on the laptop first, before a push spends a CI run and a review round-trip on something that was
already knowable locally.

The hook has a budget, though. `pre-push` is for checks that finish in seconds with nothing else
running — type check, Biome, unit tests. Anything needing Docker, the network, or a fixture database
(integration tests, load tests) is CI-only, with no `lefthook.yml` counterpart. Whether it lands as a
`matrix.include` leg or as its own workflow is a separate question, answered by whether it shares the
Bun setup and has to run on every push — `validate-codecov.yml` needs the network and is CI-only, yet
is not a leg. A hook slow enough to break concentration gets bypassed with `--no-verify`, and once
that becomes reflex every gate in the hook is off, not just the slow one.

## Toolchain versions

Bun, its type definitions, TypeScript, and Biome are pinned to exact versions (no caret). A check is
only worth running if every machine agrees — if they drift, an error caught in one is missed by the
other and the check stops being trustworthy. For Biome that also means a minor bump cannot silently
reformat the tree or enable new lint rules.

Each tool's version lives in two places. Bump both together, never one at a time. One category is
deliberately outside this table and pinned differently — the GitHub Actions in `.github/workflows/`,
covered at the end of this section.

| Where | What |
| --- | --- |
| `.tool-versions` | Bun runtime — read by asdf/mise locally, and by CI |
| `package.json` (`@types/bun`) | Bun type definitions |
| `package.json` (`@biomejs/biome`) | Biome itself — the same install runs locally, in the hook, and in CI |
| `biome.json` (`$schema`) | Schema URL, versioned — stale means editor hints for the wrong release |

The workflow hardcodes no version: it resolves Bun from `.tool-versions` and fails if the version it
actually got differs, and it installs Biome through `bun install`, so `package.json` is the only
source.

`.tool-versions` uses the asdf format (`bun 1.3.14`). To have it pin your local runtime, install
Bun through [asdf](https://asdf-vm.com/) or [mise](https://mise.jdx.dev/) — Bun itself does not
read the file.

CI reads the `bun` line from `.tool-versions`, installs that exact version, and then fails if the
version it actually resolved differs. A missing or malformed `bun` line fails the job instead of
silently falling back to the latest release.

Pinning only pays off if a mismatch is actually checked, which is why `tsconfig.json` leaves
`skipLibCheck` out. Skipping the `.d.ts` files of dependencies takes `bun run typecheck` from 0.28s
to 0.07s — 0.2 seconds — and in exchange a conflict between `@types/bun` and a dependency's own
types compiles green. That conflict is the thing bumping Bun and `@types/bun` together is meant to
surface, so the check keeps its teeth. The option is absent on purpose, not by oversight; if a real
conflict ever forces it in, name the offending dependency in a comment beside it.

### GitHub Actions are the exception

Everything above pins an exact version. The actions in `.github/workflows/` do not — they are
referenced by major-version tag, and that is a decision, not an oversight:

| Action | Published by |
| --- | --- |
| `actions/checkout@v5`, `actions/cache@v4` | GitHub |
| `oven-sh/setup-bun@v2` | the Bun team |
| `codecov/codecov-action@v7` | Codecov |

Each of these is first-party — published by whoever owns the thing it wraps — and a major tag from
such a publisher is treated as trustworthy enough to follow. The payoff is that patch and minor
fixes, including security ones, arrive without a dependency bump PR for each.

Be clear about what is being accepted. A tag is mutable: `v7` is a pointer its publisher can move,
so a compromised publisher account reaches this repository's workflows, and `codecov-action` is
handed `secrets.CODECOV_TOKEN`. Pinning to a full commit SHA is the standard answer and would remove
that path. It was weighed and declined here: this is a public repository whose only secret is a
Codecov *upload* token, which authorises publishing coverage numbers for a repository whose code is
already public. The blast radius does not justify the friction of SHA-pinning five references and
re-pinning them by hand on every release.

That calculus is specific to what is in the secret store today. **Add a secret that grants anything
real — a deploy credential, a package registry token, cloud access — and this decision has to be
revisited in the same change**, because none of the reasoning above survives it. A third-party action
(one not published by the owner of the tool it wraps) should be SHA-pinned from the start regardless.
