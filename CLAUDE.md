# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Bun + Hono による URL 短縮サービス。**アプリコードはスキャフォールド直後の状態**で、`src/index.ts` に `GET /` のプレースホルダが 1 本あるだけ。短縮 URL の生成・解決ロジック、永続化層、テストはいずれも未実装。一方で開発フロー側（型チェック・Lint / Format・Git フック・CI）は整備済み。

## コマンド

セットアップと起動は README.md を参照。README に載っていないもの：

```sh
bun run typecheck   # tsc --noEmit。pre-push フックと CI で同じものが走る
```

テストは Bun 標準のテストランナー（`bun:test`）を前提とする。テストファイル追加後は以下で実行する。

```sh
bun test                             # 全テスト
bun test src/shorten.test.ts         # ファイル単位
bun test --test-name-pattern "解決"  # テスト名でフィルタ
bun test --watch                     # ウォッチモード
```

パッケージマネージャは **Bun**（`bun.lock` を使用。npm / yarn / pnpm は使わない）。

Linter / Formatter は **Biome**（設定は `biome.json`）。`check` が formatter・linter・assist（import 並べ替え、キー並べ替え）をまとめて走らせる統合コマンドで、通常はこれを使う。

```sh
bun run check        # 検査のみ（formatter + linter + assist）
bun run check:fix    # 上記を自動修正まで行う
bun run format       # フォーマットのみ（書き込みは format:fix）
bun run lint         # Lint のみ（書き込みは lint:fix）
```

- 対象は `biome.json` の `files.includes`（`src/**` とルート直下の設定 JSON）。パス引数は不要で、渡せばその範囲に絞れる（例: `bun run check src/index.ts`）。
- `bunx biome` を直接叩かない。`@biomejs/biome` は `2.5.6` に完全固定してあるため、`bun run` 経由にする。
- バージョンを上げるときは `package.json` の `@biomejs/biome` と `biome.json` の `$schema` URL を**必ず一緒に**上げる。`$schema` はエディタ補完用で実行には影響しないため、古いまま放置すると補完だけ別バージョンを指す。

## 品質ゲート

ゲートは型チェックと Biome の 2 本。どちらも pre-push フック（`lefthook.yml`、`parallel: true` で並走）と CI が呼ぶ。

| ゲート | ローカル / pre-push | CI |
| --- | --- | --- |
| 型チェック | `bun run typecheck` | `.github/workflows/typecheck.yml`（`bun run typecheck`） |
| Lint / Format / assist | `bun run check` | `.github/workflows/biome.yml`（`bun run check:ci`） |

- CI だけ `check:ci`（`biome ci .`）を使う。ルールセットも対象ファイル（`src/index.ts`・`package.json`・`biome.json`・`tsconfig.json` の 4 つ）も終了コードも `check` と同じで、違いは 2 つ — `--write` を受け付けないことと、GitHub Actions 上で `::error` アノテーションを出して PR の diff にインライン表示されること。CI が落ちたらローカルの `bun run check` で再現し、`bun run check:fix` で直す。
- どちらのゲートも CI では `bun install --frozen-lockfile --ignore-scripts` で入れた依存を使う。`--ignore-scripts` は `prepare`（`lefthook install`）を CI で走らせないため。
- `bunx tsc` を直接叩かない。devDependencies の TypeScript（7.x のネイティブ実装版）を使うため、`bun run typecheck` 経由にする。
- チェックを追加するときは `package.json` の `scripts`・`lefthook.yml`・CI ワークフローの 3 箇所に同じコマンドを登録する。`scripts` だけに置くと「あるのに走らない」チェックになる。
- Bun 本体のバージョンは `.tool-versions`、型定義は `package.json` の `@types/bun`。**片方だけ上げない**（ローカルと CI で型チェック結果がずれる）。
- **ワークフローにバージョンを直書きしない。** Bun は `typecheck.yml` / `biome.yml` の両方が `.tool-versions` から解決して実際の値を検証する。Biome は `bun install` 経由で入るため `package.json` が唯一の源になる。CI 用にツールを別インストールする（`setup-*` アクションでバージョンを指定するなど）と源が二重化するので避ける。
- PR タイトルは `.github/workflows/pr-title.yml` が Conventional Commits 形式を検査する。形式を外すとマージできない。

## アーキテクチャ

- **エントリポイント**: `src/index.ts` が Hono アプリを `export default` する。Bun はこの default export（`fetch` ハンドラを持つオブジェクト）を自動で HTTP サーバとして起動するため、`Bun.serve()` の明示的な呼び出しやポート指定のコードは存在しない。ポートを変更する場合は `export default { port, fetch: app.fetch }` の形に切り替える。
- **ランタイム API**: Node.js ではなく Bun のランタイム API（`Bun.file`、`bun:sqlite` など）を第一候補とする。`tsconfig.json` の `types: ["bun"]` により Bun のグローバル型のみが有効で、Node の型は入っていない。
- **JSX**: `jsxImportSource: "hono/jsx"` が設定済み。UI を追加する場合は React ではなく Hono JSX（`hono/jsx`）を使う。React 用のパッケージを入れないこと。
- **strict モード**: TypeScript は `strict: true`。`any` や非 null アサーション（`!`）に頼らず、型で表現する。Biome 側も `noExplicitAny` を error、`noNonNullAssertion` を warn として重ねている（テストファイルのみ `noExplicitAny` を無効化）。`import type` の使い分け（`useImportType`）と `node:` プレフィックス（`useNodejsImportProtocol`）も error。
- **コードスタイル**: フォーマットの決定は `biome.json` に集約されている（シングルクォート、セミコロンあり、幅 120、インデント 2 スペース、trailing comma は es5）。手で整えず `bun run check:fix` に任せる。

## ブランチ運用

`main` では作業しない。ファイル編集の前に `git branch --show-current` で確認し、`main` にいれば `git switch -c <type>/<説明>`（例: `feat/short-code-resolution`）でブランチを切る。type はコミットの type と同じ語彙を使う。`main` の更新は PR の squash merge 経由のみ。

## 個人開発の学習ポリシー

このプロジェクトは学習目的です。以下のルールを厳守してください。

### 適用範囲

- **`src/` 配下のコード（テストを含む）は書かない。** 私が書いたコードをレビューするだけに徹すること。修正コードそのものを提示せず、考え方のヒントまでに留め、実装は私に書かせること。これは私が明示的に依頼しても変わらない。「ここだけ書いて」と言われたら、その場合も断って方針の説明に留めること。
- **それ以外の作業は、私が明示的に依頼したときのみ実行する。** 具体的にはコミット、PR 作成、`.claude/` や設定ファイル・ドキュメントの編集、調査、コマンド実行など。依頼していない作業を先回りしてやらないこと。
- 判断に迷ったら手を動かす前に確認すること。

### レビューの姿勢

- 「動くから良い」ではなく、その言語(Go/TypeScript)らしい書き方になっているかを厳しく見ること。
- 指摘は具体的に。「なぜ問題か」「その言語のベストプラクティスではどう書くか」までセットで説明すること。
- 褒めるだけで終わらせない。妥協せず、シニアエンジニアが新人のPRを見るレベルの厳しさで指摘すること。

## コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) に従う。**1 行目（subject）は英語**、body は日本語でもよい。subject は GitHub のコミット一覧・`git blame`・release notes に露出するため英語で揃え、body は設計判断の理由を正確に書くことを優先する。

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **type**: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf` / `ci` / `build`
- **scope**: 任意。変更範囲を示す（例: `api`, `store`, `deps`）
- **subject**: 英語。命令形・現在形、小文字始まり、末尾ピリオドなし、50 文字以内
- **body**: 日本語可。「何を」ではなく「なぜ」を書く
- **footer**: `Closes #123` / `Refs #456`。破壊的変更は `BREAKING CHANGE:` で始める段落を置く

```
feat(api): add short code resolution endpoint

短縮コードを元 URL に解決して 301 リダイレクトする。
未知のコードは 404 を返す。ここで next() に流すと SPA のフォールバック
ハンドラに吸われて 200 になってしまうため、明示的に打ち切っている。

Closes #12
```

1 コミット = 1 論理変更。フォーマット変更と機能変更は分けること。

## プルリクエスト

タイトルはコミットと同じ Conventional Commits 形式で、**`pr-title.yml` が CI で検査する**（squash merge では PR タイトルがそのまま `main` のコミットメッセージになるため）。本文は `.github/PULL_REQUEST_TEMPLATE.md` に従う（PR 作成時に GitHub が自動展開する）。

- PR は 1 つの目的に絞り、レビュー可能なサイズを保つ
- 未完成のものは Draft PR として開く
- レビュー指摘への対応は追加コミットで行い、`main` へのマージ時に squash する
