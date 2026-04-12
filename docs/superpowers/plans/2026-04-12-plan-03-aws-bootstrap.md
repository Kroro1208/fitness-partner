# Plan 03: AWS Bootstrap (CDK)

> **エージェント実行者向け**: `superpowers:subagent-driven-development` でタスク単位に実行してください。

**目標**: CDK (TypeScript) で AWS インフラの基盤を構築する。Cognito (invite-only) + API Gateway + DynamoDB single-table + hello Lambda を 1 スタックにまとめ、`cdk synth` がローカルで通る状態にする。実際のデプロイはユーザーが AWS 認証情報を持つターミナルで行う。

**アーキテクチャ**: design-decisions.md Section 2.1 の Hybrid アーキテクチャに従う。経路 A (AgentCore) と経路 B (API Gateway → Lambda 直接) の入口となる API Gateway + Cognito Authorizer を構築する。DynamoDB は Section 3.2 の single-table 設計を CDK で定義する。

**技術スタック**: AWS CDK v2 (TypeScript) / Cognito / API Gateway (HTTP API) / DynamoDB / Lambda (Node.js 22 runtime) / pnpm workspace 内 `infra/` パッケージ

**参考資料**: `docs/reference.md` の [fullstack-solution-template-for-agentcore](https://github.com/awslabs/fullstack-solution-template-for-agentcore) — CDK 構成・Cognito OAuth・Lambda 配置パターンの参考。

**仕様書参照**:

- `docs/superpowers/specs/2026-04-11-design-decisions.md` Section 2.1 (経路 A/B/C)
- 同 Section 3.1 (認証: Cognito + AgentCore Identity)
- 同 Section 3.2 (DB: DynamoDB single-table)
- 同 Section 4.3 (料金: invite-only, pre-signup Lambda)

---

## 前提条件

**Task 1〜7 (ローカル開発)**:

- Node.js 22 + pnpm がインストール済みであること
- AWS アカウントは不要 (`cdk synth` はローカルで完結する)

**Task 8 (デプロイ・smoke test) のみ追加で必要**:

- AWS アカウントが利用可能であること
- AWS CLI がインストール・設定済みであること (`aws sts get-caller-identity` が通る)
- CDK bootstrap が対象アカウント/リージョンで済んでいること (`cdk bootstrap`)

---

## ファイル構成

```
ai-fitness-partner/
├── infra/                              # CDK プロジェクト (新規)
│   ├── package.json
│   ├── tsconfig.json
│   ├── cdk.json
│   ├── bin/
│   │   └── app.ts                      # CDK App エントリポイント
│   ├── lib/
│   │   ├── fitness-stack.ts            # メインスタック (全リソース)
│   │   └── constructs/
│   │       ├── auth.ts                 # Cognito User Pool + pre-signup Lambda
│   │       ├── database.ts             # DynamoDB single-table
│   │       ├── api.ts                  # API Gateway HTTP API + Cognito Authorizer
│   │       └── hello-lambda.ts         # 動作確認用 hello エンドポイント
│   ├── lambdas/
│   │   ├── pre-signup/
│   │   │   └── index.ts               # 招待コード検証 Lambda
│   │   └── hello/
│   │       └── index.ts               # GET /hello 応答 Lambda
│   └── test/
│       └── fitness-stack.test.ts       # CDK スナップショットテスト
├── pnpm-workspace.yaml                 # "infra" を追加
└── package.json                        # (ルート、変更なし)
```

---

## タスク 1: CDK プロジェクト初期化

**対象ファイル**:

- 作成: `infra/package.json`, `infra/tsconfig.json`, `infra/cdk.json`
- 作成: `infra/bin/app.ts`, `infra/lib/fitness-stack.ts`
- 変更: `pnpm-workspace.yaml` に `"infra"` を追加

**ステップ**:

- [ ] `infra/package.json` を作成 (aws-cdk-lib, constructs, esbuild, typescript, ts-node, @types/node, vitest を devDep に。assertions は aws-cdk-lib/assertions を使用し追加パッケージ不要)
- [ ] `infra/tsconfig.json` を作成 (strict, CommonJS module, CDK 向け設定)
- [ ] `infra/cdk.json` を作成 (`"app": "npx ts-node --prefer-ts-exts bin/app.ts"`)
- [ ] `infra/bin/app.ts` を作成 (空の FitnessStack をインスタンス化)
- [ ] `infra/lib/fitness-stack.ts` を作成 (空の Stack クラス)
- [ ] `pnpm-workspace.yaml` に `"infra"` を追加
- [ ] `pnpm install` で依存インストール
- [ ] `cd infra && npx cdk synth` でテンプレートが生成されることを確認
- [ ] コミット: `feat(infra): initialize CDK project`

---

## タスク 2: DynamoDB single-table construct

**対象ファイル**:

- 作成: `infra/lib/constructs/database.ts`
- 変更: `infra/lib/fitness-stack.ts` (construct を追加)

**設計** (design-decisions.md Section 3.2 に準拠):

```
テーブル名: FitnessTable
pk: String (partition key)    # "user#<id>", "food#<id>", "recipe#<id>"
sk: String (sort key)         # "profile", "plan#<date>", "meal#<date>#<id>", etc.
billingMode: PAY_PER_REQUEST  # MVP はオンデマンド
pointInTimeRecovery: true     # データ保護
removalPolicy: RETAIN         # 削除時にデータを残す
```

**ステップ**:

- [ ] `database.ts` に `FitnessDatabase` construct を作成
- [ ] `fitness-stack.ts` に追加
- [ ] `cdk synth` でテンプレートに DynamoDB テーブルが含まれることを確認
- [ ] コミット: `feat(infra): add DynamoDB single-table construct`

---

## タスク 3: Cognito User Pool + pre-signup Lambda construct

**対象ファイル**:

- 作成: `infra/lib/constructs/auth.ts`
- 作成: `infra/lambdas/pre-signup/index.ts`
- 変更: `infra/lib/fitness-stack.ts`

**設計** (design-decisions.md Section 3.1 / 4.3 に準拠):

```
User Pool:
  - selfSignUpEnabled: true (ただし pre-signup Lambda で招待コード検証)
  - signInAliases: { email: true }
  - autoVerify: { email: true }
  - passwordPolicy: 8文字以上, 大小英数記号
  - MFA: OPTIONAL (TOTPのみ)

User Pool Client:
  - authFlows: USER_SRP_AUTH (フロントエンド標準) + ALLOW_USER_PASSWORD_AUTH (CLI smoke test 用)
  - disableOAuth: true (OAuth フロー無効。SRP/PASSWORD auth のみ)
  - ※ USER_PASSWORD_AUTH は本番移行時に削除を検討する

pre-signup Lambda:
  - CDK context (`-c inviteCodes=CODE1,CODE2`) で招待コード一覧を注入 → Lambda 環境変数 INVITE_CODES に設定
  - event.request.clientMetadata.inviteCode と照合
  - 一致しなければ error を投げてサインアップを拒否
  - context 未指定時は fail fast (デプロイ・synth ともにエラー)
```

**ステップ**:

- [ ] `infra/lambdas/pre-signup/index.ts` を作成 (招待コード検証ロジック)
- [ ] `auth.ts` に `FitnessAuth` construct を作成 (UserPool + Client + pre-signup Lambda)
- [ ] `fitness-stack.ts` に追加
- [ ] `cdk synth` で Cognito + Lambda がテンプレートに含まれることを確認
- [ ] コミット: `feat(infra): add Cognito User Pool with invite-only pre-signup Lambda`

---

## タスク 4: API Gateway HTTP API + Cognito Authorizer construct

**対象ファイル**:

- 作成: `infra/lib/constructs/api.ts`
- 変更: `infra/lib/fitness-stack.ts`

**設計** (design-decisions.md Section 2.1 経路ルールに準拠):

```
HTTP API (ApiGatewayV2):
  - corsPreflight: localhost:3000 (Next.js 開発サーバー)
  - defaultAuthorizer: Cognito JWT Authorizer (UserPool から JWT を検証)
  - /hello GET: hello Lambda (認証必須、動作確認用)
```

**ステップ**:

- [ ] `api.ts` に `FitnessApi` construct を作成
- [ ] Cognito JWT Authorizer を設定 (auth construct からの UserPool 参照)
- [ ] `fitness-stack.ts` に追加、auth.userPool を api に渡す
- [ ] `cdk synth` で API Gateway + Authorizer がテンプレートに含まれることを確認
- [ ] コミット: `feat(infra): add API Gateway HTTP API with Cognito JWT authorizer`

---

## タスク 5: Hello Lambda エンドポイント

**対象ファイル**:

- 作成: `infra/lambdas/hello/index.ts`
- 作成: `infra/lib/constructs/hello-lambda.ts`
- 変更: `infra/lib/fitness-stack.ts`

**設計**:

```typescript
// GET /hello → 認証済みユーザーの sub (Cognito user ID) を返す
export const handler = async (event: APIGatewayProxyEventV2) => {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Hello from ai-fitness-partner!",
      userId: claims?.sub ?? "unknown",
    }),
  };
};
```

**ステップ**:

- [ ] `hello/index.ts` を作成
- [ ] `hello-lambda.ts` construct を作成 (NodejsFunction + API Gateway 統合)
- [ ] `fitness-stack.ts` に追加、api + hello-lambda を結合
- [ ] `cdk synth` で Lambda + API route がテンプレートに含まれることを確認
- [ ] コミット: `feat(infra): add hello Lambda endpoint`

---

## タスク 6: CDK スナップショットテスト

**対象ファイル**:

- 作成: `infra/test/fitness-stack.test.ts`

**ステップ**:

- [ ] テストファイルを作成 (`Template.fromStack` + `aws-cdk-lib/assertions` でリソース検証)
- [ ] `infra/vitest.config.ts` を作成 (リポジトリ標準に合わせ vitest を使用)
- [ ] `cd infra && npx vitest run` でテスト pass を確認
- [ ] コミット: `test(infra): add CDK snapshot test`

---

## タスク 7: cdk synth 最終検証 + Stack 出力定義

**ステップ**:

- [ ] `fitness-stack.ts` に CfnOutput を追加:
  - `ApiUrl` (API Gateway エンドポイント URL)
  - `UserPoolId` (Cognito User Pool ID)
  - `UserPoolClientId` (Cognito App Client ID)
  - `TableName` (DynamoDB テーブル名)
- [ ] `cdk synth` で全リソースが含まれることを最終確認
- [ ] コミット: `feat(infra): add stack outputs for API URL, Cognito IDs, table name`

---

## タスク 8: デプロイ手順書 + smoke test スクリプト

**対象ファイル**:

- 作成: `infra/README.md`
- 作成: `scripts/smoke-test-api.sh` (オプション)

**ステップ**:

- [ ] `infra/README.md` にデプロイ手順を記述:
  ```bash
  # 前提: AWS CLI 設定済み、cdk bootstrap 済み
  cd infra
  pnpm install
  # 招待コードは必須 (省略するとエラー)
  npx cdk deploy -c inviteCodes=CODE1,CODE2 --require-approval never
  # 出力される ApiUrl / UserPoolId / UserPoolClientId を控える
  ```
- [ ] smoke test スクリプト (USER_PASSWORD_AUTH で `aws cognito-idp sign-up` → `admin-confirm-sign-up` → `initiate-auth` → GET /hello) の雛形を作成
- [ ] コミット: `docs(infra): add deployment guide and smoke test script`

---

## 完了条件

- [ ] `cd infra && npx cdk synth` がエラーなしでテンプレートを出力する
- [ ] テンプレートに DynamoDB / Cognito UserPool / API Gateway / Lambda が含まれる
- [ ] CDK スナップショットテストが pass する
- [ ] `infra/README.md` にデプロイ手順が記述されている
- [ ] pre-signup Lambda に招待コード検証ロジックが含まれる

---

## デプロイは Plan 03 のスコープ外

`cdk deploy` はユーザーが AWS 認証情報を持つ環境で手動実行する。Claude Code sandbox 内からは実行不可 (AWS API 呼出が sandbox network allow list に含まれない)。デプロイ後の smoke test も同様にユーザー実行。

---

## スコープ外 (後続プランで扱う)

- AgentCore Runtime / Memory / Gateway のセットアップ → Plan 06
- Lambda tools (fetchUserProfile, generateMealPlan 等) → Plan 05
- Food Catalog ETL (FCT2020 import) → Plan 04
- Next.js BFF + Cognito 統合 → Plan 07
- EventBridge cron (週次レビュー) → Plan 11
- 本番ドメイン設定 / HTTPS / WAF → Phase 2+
- マルチリージョン / DR → Phase 2+

---

## 実装者向け注意

- **CDK v2** を使う (v1 ではない)。`aws-cdk-lib` パッケージ 1 つで全サービス
- **HTTP API (ApiGatewayV2)** を使う (REST API ではない)。コスト安 + シンプル
- **NodejsFunction** (esbuild バンドル) を Lambda に使う。`@aws-cdk/aws-lambda-nodejs` ではなく `aws-cdk-lib/aws-lambda-nodejs`。esbuild は devDependencies に含める
- Lambda ランタイム: **Node.js 22** (NODEJS_22_X)
- DynamoDB の `removalPolicy: RETAIN` は本番データ保護のため。スタック削除でもテーブルは残る
- **Cognito User Pool は作り直しにコストが高い** (ユーザーデータ移行が発生)。最初から正しい設定を入れる
- `cdk synth` はローカルで動く (AWS 認証不要)。`cdk deploy` / `cdk diff` は AWS 認証が必要
- **テストランナーは vitest** を使う (リポジトリ標準に合わせる。jest は使わない)
- **tsconfig は CommonJS** (`module: "commonjs"`)。CDK + ts-node の標準構成。ESNext にすると ts-node の ESM 設定が追加で必要になる
