# misskey-emoji-gen

Misskey のカスタム絵文字に使う文字画像(文字絵文字)を、ブラウザだけで作成・保存できる Web サイトです。

- 文字・フォント・色・縁取り・影・動きを選び、PNG / APNG / GIF で保存します
- 入力した文字や読み込んだフォントは、利用者の端末の中だけで処理し、外部には送信しません
- GitHub Pages で公開します

## 設計書

設計書は [no-name1123/web-tool-blog-document](https://github.com/no-name1123/web-tool-blog-document) の `docs/design/misskey-emoji-gen/` にあります。

- 要件定義書:`01_requirements.md`
- 基本設計書:`02_basic_design.md`
- 詳細設計書:`03_detailed_design.md`

## 公開

`main` に push すると、GitHub Actions(`.github/workflows/deploy.yml`)が `npm test` を実行し、成功したときだけ GitHub Pages に配置します。

## フォントの追加・削除

`fonts/` にフォントファイル(WOFF2)とライセンス文書を置き、`config.json` の `fonts` を編集します。手順は詳細設計 7.5 のとおりです。

- 用意するフォントは SIL Open Font License 1.1 または Apache License 2.0 のものに限ります
- 文字の範囲で分割(サブセット化)はしません(入力した文字が配信元から推測されないようにするため)
- 1 ファイル 5MB 以下を目安にします

## 開発

開発ルールは [web-tool-blog-document の docs/development-rules.md](https://github.com/no-name1123/web-tool-blog-document/blob/main/docs/development-rules.md) に従います。

単体テストは Node.js 24 で次のコマンドで実行します(依存ライブラリはありません)。

```sh
npm test
```
