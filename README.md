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
| `.bun-version` | Bun runtime — used locally, and read by CI via `bun-version-file` |
| `package.json` (`@types/bun`) | Bun type definitions |
