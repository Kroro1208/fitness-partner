# Next.js Frontend Bootstrap 設計書

> **ステータス**: 承認待ち
> **関連**: design-decisions.md Section 2.1 経路 B, Section 3.1 認証, Section 3.4.1 AI SDK

---

## 目的

pnpm monorepo に Next.js 15 (App Router) を追加し、Cognito 認証 + BFF プロキシを経由して Plan 05 の CRUD Lambda と疎通する最小フロントエンド基盤を構築する。

---

## スコープ

### 含む

- Next.js 15 アプリ (`packages/web/`)
- Tailwind CSS v4 + shadcn/ui + design tokens (ui-architecture.md §16)
- Cognito 認証 (BFF HttpOnly cookie session)
- Auth UI (Sign-in / Sign-up)
- API プロキシ (`/api/proxy/[...path]` → API Gateway)
- TanStack Query v5 セットアップ
- AppShell + BottomTabBar (5 tabs)
- Edge Middleware auth guard
- Profile ページ (contracts-ts Zod validation による E2E CRUD 証明)

### 含まない

- Onboarding フロー → Plan 07
- Chat / AI 機能 (経路 A / C) → Plan 08+
- Home / Plan / Progress ページの実コンテンツ → Plan 07+
- nuqs (URL state) → コンテンツページ実装時
- PostHog analytics → Phase 2

---

## アーキテクチャ

### 経路 B データフロー

```
Browser (React)
  │
  ├─ fetch('/api/proxy/users/me/profile')
  │
  ▼
Next.js Route Handler (/api/proxy/[...path]/route.ts)
  │  cookie から __fitness_access を読み取り
  │  Authorization: Bearer <token> を付与
  ▼
API Gateway (HTTP API v2)
  │  JWT Authorizer (Cognito)
  ▼
Lambda (fetch-user-profile / update-user-profile / ...)
  │
  ▼
DynamoDB (FitnessTable)
```

### 認証フロー

```
Sign-in Form → POST /api/auth/signin
  │
  ▼
Route Handler (BFF)
  │  CognitoIdentityProviderClient.InitiateAuth(USER_PASSWORD_AUTH)
  │  → tokens (id, access, refresh)
  │
  ▼
Set-Cookie (HttpOnly, SameSite=Lax, Secure=prod)
  ├─ __fitness_id      (1h maxAge, JWT payload: sub, email, exp)
  ├─ __fitness_access   (1h maxAge, API Gateway 転送用)
  └─ __fitness_refresh  (30d maxAge, token refresh 用)
```

- ブラウザ JS にトークンを露出しない
- Edge Middleware が `__fitness_id` cookie の有無で認証ガード
- Middleware は JWT 署名検証しない（存在チェックのみ、軽量）
- Route Handler は `getSession()` で id token の exp クレームを検証し、期限切れ時は refresh を試行

---

## BFF プロキシ設計

### `/api/proxy/[...path]/route.ts`

| 項目             | 仕様                                                             |
| ---------------- | ---------------------------------------------------------------- |
| メソッド         | GET, POST, PATCH, PUT, DELETE                                    |
| 認証             | `__fitness_access` cookie → `Authorization: Bearer` ヘッダに変換 |
| 転送先           | `${API_GATEWAY_URL}/${path.join("/")}`                           |
| リクエストボディ | そのまま透過 (Content-Type 維持)                                 |
| レスポンス       | API Gateway のステータスコードとボディをそのまま返却             |
| 未認証時         | 401 を返す (cookie 不在)                                         |

### セキュリティ考慮

- プロキシ先は `API_GATEWAY_URL` 環境変数に固定。パストラバーサルでも外部 URL に転送されない
- SSRF 防止: `API_GATEWAY_URL` は AWS API Gateway エンドポイントのみ許可

---

## Cognito SDK ラッパー

`src/lib/auth/cognito.ts` — server-only (Route Handler 内で使用)

| 関数                                         | Cognito Command                          | 用途                                       |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| `cognitoSignUp(email, password, inviteCode)` | SignUpCommand                            | 新規登録 (invite code は custom attribute) |
| `cognitoConfirmSignUp(email, code)`          | ConfirmSignUpCommand                     | メール確認コード検証                       |
| `cognitoSignIn(email, password)`             | InitiateAuthCommand (USER_PASSWORD_AUTH) | ログイン → tokens 取得                     |
| `cognitoRefreshTokens(refreshToken)`         | InitiateAuthCommand (REFRESH_TOKEN_AUTH) | token 更新                                 |

### Cognito 設定 (Plan 03 で構築済み)

- UserPool: selfSignUp=true, email sign-in, autoVerify email
- UserPoolClient: userPassword=true, userSrp=true, disableOAuth=true
- Pre-signup Lambda: invite code 検証 + profile 初期作成

---

## Cookie Session 管理

`src/lib/auth/session.ts` — server-only

```typescript
// Cookie 名定数
const COOKIE_ID = "__fitness_id";
const COOKIE_ACCESS = "__fitness_access";
const COOKIE_REFRESH = "__fitness_refresh";

// setSession: 3 cookie をセット
// getSession: id token の JWT payload デコード → { userId, email } | null
// clearSession: 3 cookie を削除
```

JWT payload デコードは `Buffer.from(token.split(".")[1], "base64url")` のみ。署名検証は不要（Cognito が発行し、API Gateway の JWT Authorizer が検証する）。

---

## Auth Route Handlers

| エンドポイント             | メソッド | 入力                              | 出力                                |
| -------------------------- | -------- | --------------------------------- | ----------------------------------- |
| `/api/auth/signup`         | POST     | `{ email, password, inviteCode }` | `{ needsConfirmation: true }`       |
| `/api/auth/signup/confirm` | POST     | `{ email, code }`                 | `{ success: true }`                 |
| `/api/auth/signin`         | POST     | `{ email, password }`             | `{ success: true }` + Set-Cookie    |
| `/api/auth/signout`        | POST     | なし                              | `{ success: true }` + Delete-Cookie |
| `/api/auth/refresh`        | POST     | なし (cookie)                     | `{ success: true }` + Set-Cookie    |
| `/api/auth/me`             | GET      | なし (cookie)                     | `{ user: { id, email } }`           |

入力は全て Zod でバリデーション。Cognito エラーは適切な HTTP ステータスにマッピング:

- `NotAuthorizedException` → 401
- `UserNotConfirmedException` → 403
- `UsernameExistsException` → 409
- `CodeMismatchException` → 400

---

## Edge Middleware (auth guard)

```
Protected paths: /home, /plan, /chat, /progress, /profile
Auth paths: /signin, /signup

cookie __fitness_id あり + auth path  → redirect /home
cookie __fitness_id なし + protected  → redirect /signin
それ以外                              → pass through
```

`/api/*` と `/_next/*` はマッチャーで除外。

---

## UI コンポーネント

### Component 2-Layer (design-decisions.md §4.2)

| レイヤー   | ディレクトリ             | 管理方法                          |
| ---------- | ------------------------ | --------------------------------- |
| Primitives | `src/components/ui/`     | shadcn CLI で追加、手動編集しない |
| Domain     | `src/components/domain/` | 手書き、プロジェクト固有          |

### AppShell 構成

```
┌─ TopBar (h-12, app name centered) ─────────┐
│                                              │
│  Content Area (flex-1, overflow-y-auto)      │
│  bg-canvas (#F7F8F5)                         │
│  max-w-lg mx-auto (desktop constraint)       │
│  px-4, pb-20 (bottom tab clearance)          │
│                                              │
├─ BottomTabBar (sticky bottom) ──────────────┤
│  Home | Plan | Chat | Progress | Profile     │
│  Icons: lucide-react                         │
│  Active: primary-500 (#4F7A5A)               │
│  Inactive: neutral-500                       │
│  min-h-[44px] touch targets                  │
│  pb-safe (iOS safe area)                     │
└──────────────────────────────────────────────┘
```

### Design Tokens (ui-architecture.md §16)

| Token       | Value   |
| ----------- | ------- |
| primary-500 | #4F7A5A |
| primary-600 | #3F6549 |
| primary-100 | #E5EFE7 |
| accent-500  | #D98F5C |
| accent-100  | #F8E8DD |
| bg-canvas   | #F7F8F5 |
| bg-surface  | #FFFFFF |
| bg-subtle   | #F1F4EE |
| danger-500  | #C65A5A |
| danger-100  | #FBE8E8 |
| warning-500 | #C98A2E |
| warning-100 | #FAF0DA |
| radius-sm   | 8px     |
| radius-md   | 14px    |
| radius-lg   | 20px    |
| radius-xl   | 28px    |

---

## Profile ページ (E2E CRUD 証明)

contracts-ts パイプラインの疎通を証明するページ。

### useProfile hook

```typescript
// GET /api/proxy/users/me/profile → TanStack useQuery
// PATCH /api/proxy/users/me/profile → TanStack useMutation
//   入力を UpdateUserProfileInputSchema.parse(data) で検証
//   → Pydantic → JSON Schema → Zod → Frontend の全パイプライン疎通
```

### 表示セクション

| セクション | フィールド                     |
| ---------- | ------------------------------ |
| Body       | age, sex, height_cm, weight_kg |
| Activity   | activity_level, desired_pace   |
| Wellness   | sleep_hours, stress_level      |

### 状態

- **Loading**: skeleton cards
- **Empty**: "プロフィール未作成。オンボーディングを完了してください"
- **Data**: セクション表示 + inline edit
- **Error**: エラーメッセージ + retry

---

## 環境変数

| 変数名                 | 説明                       | 取得元                           |
| ---------------------- | -------------------------- | -------------------------------- |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID       | CDK CfnOutput `UserPoolId`       |
| `COGNITO_CLIENT_ID`    | Cognito App Client ID      | CDK CfnOutput `UserPoolClientId` |
| `COGNITO_REGION`       | AWS リージョン             | デフォルト `ap-northeast-1`      |
| `API_GATEWAY_URL`      | API Gateway エンドポイント | CDK CfnOutput `ApiUrl`           |
| `SESSION_SECRET`       | Cookie 署名用シークレット  | 手動生成 (32+ chars)             |

---

## 依存パッケージ

```
dependencies:
  next: ^15
  react: ^19
  react-dom: ^19
  @tanstack/react-query: ^5
  @aws-sdk/client-cognito-identity-provider: ^3.700
  lucide-react: ^0.400
  clsx: ^2.1
  tailwind-merge: ^2.5
  @fitness/contracts-ts: workspace:*

devDependencies:
  typescript: ^5.6
  @types/node: ^22
  @types/react: ^19
  @types/react-dom: ^19
  tailwindcss: ^4
  @tailwindcss/postcss: ^4
```
