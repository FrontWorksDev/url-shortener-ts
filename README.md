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

## Toolchain versions

Bun, its type definitions, and TypeScript are pinned to exact versions (no caret). A type check is
only worth running if local and CI agree — if they drift, an error caught in one is missed by the
other and the check stops being trustworthy.

The Bun version lives in two places. Bump them together, never one at a time.

| Where | What |
| --- | --- |
| `.tool-versions` | Bun runtime — read by asdf/mise locally, and by CI |
| `package.json` (`@types/bun`) | Bun type definitions |

`.tool-versions` uses the asdf format (`bun 1.3.14`). To have it pin your local runtime, install
Bun through [asdf](https://asdf-vm.com/) or [mise](https://mise.jdx.dev/) — Bun itself does not
read the file.

CI reads the `bun` line from `.tool-versions`, installs that exact version, and then fails if the
version it actually resolved differs. A missing or malformed `bun` line fails the job instead of
silently falling back to the latest release.
