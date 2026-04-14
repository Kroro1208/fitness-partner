# infra — AWS CDK Stack

ai-fitness-partner の AWS インフラを CDK v2 (TypeScript) で定義する。

## リソース一覧

| リソース | 説明 |
|----------|------|
| DynamoDB | single-table 設計。pk/sk String, PAY_PER_REQUEST, PITR 有効。物理テーブル名は CDK が自動生成 (CfnOutput `TableName` が実際の名前) |
| Cognito User Pool | email サインイン, MFA optional (TOTP), pre-signup Lambda で SecureString の招待トークンを検証し単回利用で消費 |
| API Gateway (HTTP API) | Cognito JWT Authorizer, CORS localhost:3000 |
| Hello Lambda | GET /hello — 認証済みユーザーの sub を返す動作確認用 |

## 前提条件

- Node.js 22+
- pnpm
- AWS CLI 設定済み (`aws sts get-caller-identity` が通ること)
- CDK bootstrap 済み (`npx cdk bootstrap`)

## デプロイ

```bash
cd infra
pnpm install

# 招待トークンを SecureString に保存しておく
# 1 行 1 トークン、またはカンマ区切り。各トークンは 24 文字以上の高エントロピー値にすること。
aws ssm put-parameter \
  --name /ai-fitness-partner/prod/invite-codes \
  --type SecureString \
  --overwrite \
  --value $'5f4f8d3a2c1b0e9d8c7b6a5f4e3d2c1b\n3bb4f1f09d4c4b6db8f2a3d0e2c4f8a1'

# SecureString パラメータ名は必須 (省略するとエラー)
npx cdk deploy \
  -c inviteCodesParameterName=/ai-fitness-partner/prod/invite-codes \
  --require-approval never

# 出力される値を控える:
#   ApiUrl          — API Gateway エンドポイント URL
#   UserPoolId      — Cognito User Pool ID (リージョン情報を含む: <region>_<id>)
#   UserPoolClientId — Cognito App Client ID
#   TableName       — DynamoDB テーブル名 (CDK 自動生成)
```

## ローカル検証

```bash
# テンプレート生成 (AWS 認証不要、inviteCodesParameterName 必須)
npx cdk synth -c inviteCodesParameterName=/ai-fitness-partner/test/invite-codes

# テスト実行
npx vitest run
```

## Smoke Test

デプロイ後、`infra/scripts/smoke-test-api.sh` で動作確認できる。
リージョンは UserPoolId から自動抽出される。

```bash
INVITE_CODE=YOUR_CODE bash scripts/smoke-test-api.sh <ApiUrl> <UserPoolId> <UserPoolClientId>
```

`INVITE_CODE` は単回利用なので、smoke test ごとに未使用トークンを使うこと。

## セキュリティ注意

- **招待トークン**: 平文は CDK context や Lambda 環境変数に載せない。`SecureString` に保存し、24 文字以上の高エントロピー値を単回利用トークンとして配布すること
- **USER_PASSWORD_AUTH**: smoke test 用に有効。本番移行時に削除を検討すること
- **`cdk.out/`**: `.gitignore` 済み。手動でコミットしないこと
