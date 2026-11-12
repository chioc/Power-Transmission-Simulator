# 動力伝達・運動変換シミュレーター

中学校第2学年 技術分野「C エネルギー変換の技術」で使う、動力伝達・運動変換の仕組みを画面上で動かして確かめる Web アプリ（Google Apps Script）。

- 仕様書：[docs/仕様書.md](docs/仕様書.md)
- 開発ルール：[CLAUDE.md](CLAUDE.md)
- 関連資料（Google Drive）：[根拠シートの共有Driveフォルダ](https://drive.google.com/drive/folders/1m6v2QUdTdd8daQIAinZgDG2OQRa9C-mA?usp=sharing)

## GAS への反映

| 操作 | 内容 |
|---|---|
| `main` にマージ | GitHub Actions「GASへ反映（テスト用 /dev）」が `clasp push` を実行。テスト用URL（/dev）で確認できる |
| Actions「本番デプロイ（手動）」を実行 | 本番デプロイを新しい版に更新。生徒用URLは変わらない |

### 初回の準備（ユーザーが行う）

1. GAS プロジェクト（単体のスクリプト）を作成し、スクリプトIDを控える
2. リポジトリ直下に `.clasp.json` を追加する
   ```json
   { "scriptId": "（スクリプトID）", "rootDir": "src" }
   ```
3. GitHub の Settings → Secrets and variables → Actions に登録する
   - `CLASPRC_JSON`：`clasp login` で作られる `~/.clasprc.json` の中身
   - `GAS_DEPLOYMENT_ID`：GAS の「デプロイを管理」で作成した本番用 Web アプリのデプロイID（本番デプロイ時のみ必要）
