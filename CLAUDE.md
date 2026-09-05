# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Bun + Hono による URL 短縮サービス。永続化層のインターフェース（`EntryStore`、`src/store.ts`）とメモリ実装（`src/store.memory.ts`）は実装済みで、実装非依存の契約テスト（`src/store.contract.ts`）が検証している。一方、短縮 URL の生成・解決エンドポイントは未実装で、`src/index.ts` には `GET /` のプレースホルダが 1 本あるだけ。開発フロー側（型チェック・Lint / Format・テスト・Git フック・CI）は整備済み。

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
bun run test:coverage                # カバレッジ付き。CI の Test leg と同じ。設定は bunfig.toml の [test]
```

パッケージマネージャは **Bun**（`bun.lock` を使用。npm / yarn / pnpm は使わない）。

Linter / Formatter は **Biome**（設定は `biome.json`）。`check` が formatter・linter・assist（import 並べ替え、`package.json` のキー並べ替え）をまとめて走らせる唯一の入口。

```sh
bun run check        # 検査のみ（formatter + linter + assist）
bun run check:fix    # 上記を自動修正まで行う
```

- **`format` / `lint` のような部分実行スクリプトを増やさない。** 1 種だけ実行したいときは `bun run biome format` のようにその場で叩く。
- 対象は `biome.json` の `files.includes`（`src/**` とルート直下の設定 JSON）。パス引数を渡せばその範囲に絞れる（例: `bun run check src/index.ts`）。

## 品質ゲート

型チェック（`bun run typecheck`／CI 上のチェック名は `Type Check`）、Biome（`bun run check`／`Biome`）、テスト（pre-push は `bun test`／CI は `bun run test:coverage`／`Test`）の 3 本。pre-push フック（`lefthook.yml`）と CI（`.github/workflows/ci.yml` の matrix 3 leg）が同じ検査を走らせる。構成の詳細は README.md の「CI」節を参照。

- CI だけ `check:ci`（`biome ci`）を使う。ルール・対象ファイル・終了コードは `check` と同じ。CI が落ちたら `bun run check` で再現し、`bun run check:fix` で直す。
- **チェックを追加するときは `package.json` の `scripts`・`lefthook.yml` のジョブ・`ci.yml` の `matrix.include` の 3 箇所に登録する。** `scripts` だけに置くと「あるのに走らない」チェックになる。ただしこれは「Bun のセットアップを共有し、毎 push 走らせる」チェックの既定形で、当てはまらないものは下の 2 本で判断する。
- **`scripts` を作る基準は「複数の呼び出し口で揃えるべき固定版バイナリかフラグがあるか」。** `typecheck` / `check` は前者、`test:coverage` は `--coverage` を揃えるため。pre-push の `bun test` は引数なしでランタイム自身に解決されるので `scripts` を持たない（理由は README「Tests」節）。
- **すべてのチェックが `ci.yml` の leg になるわけではない。** Bun のセットアップを共有しない・`paths` で絞りたい・外部サービスを叩く、のいずれかに当てはまるなら独立ワークフローにする（例: `validate-codecov.yml`）。`paths` はワークフロー単位のトリガーで leg 単位には効かず、CI 本体は毎 push 走らせる必要がある。
- **pre-push に載せるのは数秒で終わるチェックだけ。** Docker・ネットワーク・フィクスチャ DB が要るものは `ci.yml` の leg のみにする。
- **`ci.yml` の `fail-fast: false` と `--ignore-scripts` を外さない。** 前者は片方のエラーで他方が cancel されるのを防ぎ、後者は CI で `prepare`（`lefthook install`）を走らせないため。
- **ブランチ保護の必須チェックに入れてよいのは、毎 push 必ず走り、外部サービスに依存しないチェックだけ。** `paths` で絞ったワークフローを必須にすると、対象ファイルを触らない PR で skipped ではなく Expected のまま残り、マージ不能になる（`validate-codecov.yml` が該当するので必須にしない）。同じ理由で、**CI のチェック名を変えたらブランチ保護の設定も直す**。古い名前を待ち続けて詰まる。
- **ワークフローにバージョンを直書きしない。** Bun は `.tool-versions`、Biome は `bun install` 経由の `package.json` が唯一の源。`setup-*` アクションでの別インストールは源が二重化するので避ける。
- `bunx tsc` / `bunx biome` を直接叩かない。固定版を使うため `bun run` 経由にする。
- Bun 本体（`.tool-versions`）と型定義（`package.json` の `@types/bun`）は**対で上げる**。片方だけだとローカルと CI で型チェック結果がずれる。
- **`tsconfig.json` に `skipLibCheck` を入れない。** 速くなるのは実測 0.2 秒で、引き換えに `@types/bun` と依存の型定義の衝突が緑のまま通る（理由は README「Toolchain versions」節）。**入れなかったことは痕跡が残らない**ので、「推奨オプションなのに無い＝知らずに抜けている」と判断して足さないこと。
- **`bunfig.toml` に `coverageThreshold` を入れない。** カバレッジの閾値は `codecov.yml` の status に一本化してある（理由は README「Where the threshold lives」節）。入れると強制の場所が移り、必須チェックでない Codecov status で済んでいた閾値割れが、必須チェックの `Test` を落としてマージを止めるようになる。`skipLibCheck` と同じく**入れなかったことは痕跡が残らない**ので、「閾値を強制したいならまずここ」と判断して足さないこと。
- **`bunfig.toml` の `[test]` に `root` を入れない。** テストの探索が許可リストに変わり、`src/` の外に置いたテストが失敗ではなく「無かったこと」になる。`src/**` に揃える意図で書きたくなるが、Bun は `node_modules` を元から除外するので利得は無い。
- Biome（`package.json` の `@biomejs/biome`）と `biome.json` の `$schema` URL も**対で上げる**。`$schema` はエディタ補完用で実行には一切影響せず、古いバージョンでも存在しないバージョンでも Biome は何も言わずに exit 0 を返す。**ずれが実行時に検知される機会はどこにも無い**ので、「実行に影響しないなら後でいい」「間違っていればエラーになるはず」と判断せず、必ず同時に上げる。
- Biome を上げた後に `Found an unknown key` で落ちたら、そのルールが `nursery` を卒業した合図。**キーを消して黙らせず、新しいグループへ移す**（消すと適用が静かに失われる）。
- PR タイトルは `.github/workflows/pr-title.yml` が Conventional Commits 形式を検査する。形式を外すとマージできない。

## アーキテクチャ

- **エントリポイント**: `src/index.ts` が Hono アプリを `export default` する。Bun はこの default export（`fetch` ハンドラを持つオブジェクト）を自動で HTTP サーバとして起動するため、`Bun.serve()` の明示的な呼び出しやポート指定のコードは存在しない。ポートを変更する場合は `export default { port, fetch: app.fetch }` の形に切り替える。
- **ランタイム API**: Node.js ではなく Bun のランタイム API（`Bun.file`、`bun:sqlite` など）を第一候補とする。`tsconfig.json` の `types: ["bun"]` により Bun のグローバル型のみが有効で、Node の型は入っていない。
- **JSX**: `jsxImportSource: "hono/jsx"` が設定済み。UI を追加する場合は React ではなく Hono JSX（`hono/jsx`）を使う。React 用のパッケージを入れないこと。
- **strict モード**: TypeScript は `strict: true`。`any` や非 null アサーション（`!`）に頼らず型で表現する。Biome も `noExplicitAny` / `noConsole` を error で重ねる（テストのみ `noExplicitAny` 無効）。
- **コードスタイル**: フォーマットの決定は `biome.json` に集約。手で整えず `bun run check:fix` に任せる。

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
