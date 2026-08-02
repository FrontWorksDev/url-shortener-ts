To install dependencies:
```sh
bun install
```

This also installs Git hooks: the `prepare` script runs `lefthook install`, which sets up a
`pre-push` hook that type checks before every push. No manual setup is needed.

To run:
```sh
bun run dev
```

open http://localhost:3000

To type check:
```sh
bun run typecheck
```

The same command runs in the `pre-push` hook and in CI (`.github/workflows/typecheck.yml`).

## Lint and format

Linting and formatting are handled by [Biome](https://biomejs.dev/) (`biome.json`). `check` is the
umbrella command — it runs the formatter, the linter, and the assist actions (import sorting, key
sorting) in one pass, so it is the one to reach for day to day.

```sh
bun run check        # report formatting, lint, and assist issues
bun run check:fix    # ...and write the fixes
```

The narrower commands exist for when you want only one of the two:

```sh
bun run format       # formatting only     (bun run format:fix to write)
bun run lint         # lint rules only     (bun run lint:fix to write)
```

Every command runs against the paths in `biome.json`'s `files.includes` — `src/**` plus the
root-level config JSON — so no path argument is needed. Pass one to narrow the run:

```sh
bun run check src/index.ts
```

`bun run check` is enforced, so a violation blocks the push:

| Where | What runs |
| --- | --- |
| `pre-push` hook (`lefthook.yml`) | `bun run check`, in parallel with `bun run typecheck` |
| CI (`.github/workflows/biome.yml`) | `bun run check:ci` |

`check:ci` runs Biome's `ci` subcommand instead of `check`. Same rules over the same files, but it
refuses `--write` and it prints GitHub Actions annotations, so failures show up inline on the PR
diff. Both use the Biome pinned in `package.json`, so a CI failure reproduces locally with
`bun run check` and is fixed with `bun run check:fix`.

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

No workflow hardcodes a version: the Bun jobs resolve theirs from `.tool-versions` and verify what
they actually got, and CI runs Biome through `bun install`, so `package.json` is the only source.

`.tool-versions` uses the asdf format (`bun 1.3.14`). To have it pin your local runtime, install
Bun through [asdf](https://asdf-vm.com/) or [mise](https://mise.jdx.dev/) — Bun itself does not
read the file.

CI reads the `bun` line from `.tool-versions`, installs that exact version, and then fails if the
version it actually resolved differs. A missing or malformed `bun` line fails the job instead of
silently falling back to the latest release.
