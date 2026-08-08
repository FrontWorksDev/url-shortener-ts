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

open http://localhost:3000

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

Unlike `typecheck` and `check`, this gate has no `package.json` script — the hook and CI call
`bun test` directly. Those two wrap a pinned binary (`tsc`, `biome`) whose flags must stay identical
across three call sites, which is what the script exists to guarantee. `bun test` is the runtime
itself, so there is no second tool it could resolve to and no flag set to keep in sync.

## CI

All three gates live in one workflow, `.github/workflows/ci.yml`, as a three-leg matrix — they need
the same Bun setup and the same `bun install`, and duplicating that across three files meant fixing
every change three times.

| Check name | Command |
| --- | --- |
| `Type Check` | `bun run typecheck` |
| `Biome` | `bun run check:ci` |
| `Test` | `bun test` |

The check name is the matrix leg's `name`, and that is the string `main`'s branch protection has to
match. Rename a leg and the old name stays required forever, waiting on a check that no longer runs.

`fail-fast: false` matters here: the default cancels the remaining legs the moment one fails, so a
branch with a type error, a lint error, and a failing test would only ever show you one of the three
per push.

Adding a gate means adding a `matrix.include` entry alongside the `lefthook.yml` job — plus a
`package.json` script when the gate wraps a pinned binary rather than the runtime. The legs do not
share a runner, so this does not make CI faster — it removes the duplicated setup, nothing more.

### What belongs in `pre-push`

Every gate above runs in both places today, and that is the default: a check CI enforces should fail
on the laptop first, before a push spends a CI run and a review round-trip on something that was
already knowable locally.

The hook has a budget, though. `pre-push` is for checks that finish in seconds with nothing else
running — type check, Biome, unit tests. Anything needing Docker, the network, or a fixture database
(integration tests, load tests) is CI-only: its own `matrix.include` leg with no `lefthook.yml`
counterpart. A hook slow enough to break concentration gets bypassed with `--no-verify`, and once
that becomes reflex every gate in the hook is off, not just the slow one.

## Toolchain versions

Bun, its type definitions, TypeScript, and Biome are pinned to exact versions (no caret). A check is
only worth running if every machine agrees — if they drift, an error caught in one is missed by the
other and the check stops being trustworthy. For Biome that also means a minor bump cannot silently
reformat the tree or enable new lint rules.

Each tool's version lives in two places. Bump both together, never one at a time.

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
