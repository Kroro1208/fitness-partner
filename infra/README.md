# infra — AWS CDK Stack

ai-fitness-partner の AWS インフラを CDK v2 (TypeScript) で定義する。

## リソース一覧

| リソース | 説明 |
|----------|------|
| DynamoDB | single-table 設計。pk/sk String, PAY_PER_REQUEST, PITR 有効。物理テーブル名は CDK が自動生成 (CfnOutput `TableName` が実際の名前) |
| Cognito User Pool | email サインイン, MFA optional (TOTP), pre-signup Lambda で招待コード検証 |
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

# 招待コードは必須 (省略するとエラー)
npx cdk deploy -c inviteCodes=CODE1,CODE2 --require-approval never

# 出力される値を控える:
#   ApiUrl          — API Gateway エンドポイント URL
#   UserPoolId      — Cognito User Pool ID (リージョン情報を含む: <region>_<id>)
#   UserPoolClientId — Cognito App Client ID
#   TableName       — DynamoDB テーブル名 (CDK 自動生成)
```

## ローカル検証

```bash
# テンプレート生成 (AWS 認証不要、inviteCodes 必須)
npx cdk synth -c inviteCodes=TEST

# テスト実行
npx vitest run
```

## Smoke Test

デプロイ後、`infra/scripts/smoke-test-api.sh` で動作確認できる。
リージョンは UserPoolId から自動抽出される。

```bash
INVITE_CODE=YOUR_CODE bash scripts/smoke-test-api.sh <ApiUrl> <UserPoolId> <UserPoolClientId>
```

## セキュリティ注意

- **招待コード**: デプロイ時に `-c inviteCodes=...` で指定必須。ソースコードにデフォルト値は含まれない。本番移行時は SSM Parameter Store SecureString への移行を推奨
- **USER_PASSWORD_AUTH**: smoke test 用に有効。本番移行時に削除を検討すること
- **`cdk.out/`**: `.gitignore` 済み。手動でコミットしないこと
