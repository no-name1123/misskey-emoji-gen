# misskey-emoji-gen

Misskey のカスタム絵文字に使う文字画像(文字絵文字)を、ブラウザだけで作成・保存できる Web サイトです。

- 文字・フォント・色・縁取り・影・動きを選び、PNG / APNG / GIF で保存します
- 入力した文字や読み込んだフォントは、利用者の端末の中だけで処理し、外部には送信しません
- GitHub Pages で公開します

## 公開

`main` に push すると、GitHub Actions(`.github/workflows/deploy.yml`)が `npm test` を実行し、成功したときだけ GitHub Pages に配置します。

## フォントの追加・削除

`fonts/` にフォントファイル(WOFF2)とライセンス文書を置き、`config.json` の `fonts` を編集します。

1. フォントの配布ファイルとライセンス文書を入手し、ライセンスが SIL Open Font License 1.1 または Apache License 2.0 であることを確認する
2. 可変フォントの場合は、fontTools で使う太さだけを取り出す:`fonttools varLib.instancer <入力>.ttf wght=<太さ> -o <出力>.ttf`
3. WOFF2 に変換する:`fonttools ttLib.woff2 compress <入力>.ttf -o fonts/<名前>.woff2`(fontTools と brotli は手元に入れる。リポジトリの依存にはしない)
4. `fonts/` にフォントとライセンス文書を置き、`config.json` に追記する(`bytes` にファイルの大きさを書く)

- 文字の範囲で分割(サブセット化)はしません(入力した文字が配信元から推測されないようにするため)
- 1 ファイル 5MB 以下を目安にします

## 開発

単体テストは Node.js 24 で次のコマンドで実行します(依存ライブラリはありません)。

```sh
npm test
```
