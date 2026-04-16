# Next.js Frontend Bootstrap (Plan 06) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pnpm monorepo に Next.js 15 (App Router) を追加し、Cognito 認証 (BFF HttpOnly cookie session) + API プロキシ経由で Plan 05 の CRUD Lambda と疎通する最小フロントエンド基盤を構築する。

**Architecture:** Next.js Route Handler が BFF として Cognito 認証とAPI プロキシを担う。JWT トークンは HttpOnly cookie に格納し、ブラウザ JS に露出しない。`/api/proxy/[...path]` が API Gateway に透過転送する経路 B パターン。Profile ページで contracts-ts の Zod スキーマを使い、Pydantic → JSON Schema → Zod → Frontend の全パイプライン疎通を証明する。

**Tech Stack:** Next.js 15+ (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query v5, @aws-sdk/client-cognito-identity-provider, @fitness/contracts-ts (Zod)

---

## 設計書

`docs/superpowers/specs/2026-04-14-nextjs-bootstrap-design.md`

## 前提条件

- Node.js 22+ / pnpm がインストール済み
- Plan 05 まで完了済み (contracts-ts に `UpdateUserProfileInputSchema` が存在)
- CDK スタックデプロイ済み (CfnOutput: `ApiUrl`, `UserPoolId`, `UserPoolClientId`)
- API Gateway CORS: `http://localhost:3000` 許可済み
- `pnpm-workspace.yaml` の `packages/*` パターンで `packages/web` は自動認識

## ファイル構成

### 新規作成

| ファイル                                                | 責務                                       |
| ------------------------------------------------------- | ------------------------------------------ |
| `packages/web/package.json`                             | Next.js app パッケージ定義                 |
| `packages/web/tsconfig.json`                            | TypeScript 設定 (strict, paths)            |
| `packages/web/next.config.ts`                           | Next.js 設定 (transpilePackages)           |
| `packages/web/postcss.config.mjs`                       | Tailwind v4 PostCSS 設定                   |
| `packages/web/components.json`                          | shadcn/ui CLI 設定                         |
| `packages/web/.env.local.example`                       | 環境変数テンプレート                       |
| `packages/web/middleware.ts`                            | Edge Middleware auth guard                 |
| `packages/web/src/app/layout.tsx`                       | Root layout (Providers, fonts, metadata)   |
| `packages/web/src/app/page.tsx`                         | Landing → redirect                         |
| `packages/web/src/app/globals.css`                      | Tailwind directives + design tokens        |
| `packages/web/src/lib/utils.ts`                         | `cn()` helper (clsx + tailwind-merge)      |
| `packages/web/src/lib/auth/cognito.ts`                  | Cognito SDK ラッパー (server-only)         |
| `packages/web/src/lib/auth/session.ts`                  | Cookie session R/W (server-only)           |
| `packages/web/src/lib/api-client.ts`                    | Client-side typed fetch wrapper            |
| `packages/web/src/lib/query-client.ts`                  | TanStack Query factory                     |
| `packages/web/src/components/providers.tsx`             | QueryClientProvider wrapper                |
| `packages/web/src/components/domain/app-shell.tsx`      | AppShell (TopBar + content + BottomTabBar) |
| `packages/web/src/components/domain/bottom-tab-bar.tsx` | 5 tabs navigation                          |
| `packages/web/src/components/domain/top-bar.tsx`        | Header bar                                 |
| `packages/web/src/hooks/use-auth.ts`                    | Auth state hook (TanStack Query)           |
| `packages/web/src/hooks/use-profile.ts`                 | Profile CRUD hooks                         |
| `packages/web/src/app/(auth)/layout.tsx`                | Centered auth layout                       |
| `packages/web/src/app/(auth)/signin/page.tsx`           | Sign-in page                               |
| `packages/web/src/app/(auth)/signup/page.tsx`           | Sign-up page (2-step)                      |
| `packages/web/src/app/(app)/layout.tsx`                 | AppShell layout                            |
| `packages/web/src/app/(app)/home/page.tsx`              | Home placeholder                           |
| `packages/web/src/app/(app)/profile/page.tsx`           | Profile E2E CRUD proof                     |
| `packages/web/src/app/api/auth/signup/route.ts`         | BFF signup handler                         |
| `packages/web/src/app/api/auth/signup/confirm/route.ts` | BFF confirm handler                        |
| `packages/web/src/app/api/auth/signin/route.ts`         | BFF signin handler                         |
| `packages/web/src/app/api/auth/signout/route.ts`        | BFF signout handler                        |
| `packages/web/src/app/api/auth/refresh/route.ts`        | BFF refresh handler                        |
| `packages/web/src/app/api/auth/me/route.ts`             | BFF me handler                             |
| `packages/web/src/app/api/proxy/[...path]/route.ts`     | API Gateway proxy                          |

### 変更

| ファイル              | 変更内容                            |
| --------------------- | ----------------------------------- |
| `package.json` (root) | `dev:web`, `build:web` scripts 追加 |

---

## Task 1: Next.js プロジェクト初期化

**Files:**

- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/next.config.ts`
- Create: `packages/web/src/app/layout.tsx`
- Create: `packages/web/src/app/page.tsx`
- Create: `packages/web/src/app/globals.css`

- [ ] **Step 1: package.json を作成**

  ```json
  {
    "name": "@fitness/web",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "next dev",
      "build": "next build",
      "start": "next start",
      "lint": "next lint"
    },
    "dependencies": {
      "next": "^15.0.0",
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "@fitness/contracts-ts": "workspace:*"
    },
    "devDependencies": {
      "typescript": "^5.6.0",
      "@types/node": "^22.10.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0"
    }
  }
  ```

- [ ] **Step 2: tsconfig.json を作成**

  strict mode、paths `@/* → ./src/*`、`next-env.d.ts` include。

- [ ] **Step 3: next.config.ts を作成**

  ```typescript
  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {
    transpilePackages: ["@fitness/contracts-ts"],
  };

  export default nextConfig;
  ```

- [ ] **Step 4: globals.css を作成**

  ```css
  @import "tailwindcss";
  ```

- [ ] **Step 5: Root layout を作成**

  html/body、metadata title "AI Fitness Partner"。

- [ ] **Step 6: Landing page placeholder を作成**

  シンプルな h1 + /signin へのリンク。

- [ ] **Step 7: pnpm install → dev server 起動確認**

  ```bash
  pnpm install
  pnpm --filter @fitness/web dev
  ```

  localhost:3000 でページが表示されることを確認。

- [ ] **Step 8: コミット**

  `feat(web): initialize Next.js 15 app in packages/web`

---

## Task 2: Tailwind CSS v4 + shadcn/ui + Design Tokens

**Files:**

- Create: `packages/web/postcss.config.mjs`
- Create: `packages/web/components.json`
- Create: `packages/web/src/lib/utils.ts`
- Modify: `packages/web/src/app/globals.css`
- Modify: `packages/web/package.json`

- [ ] **Step 1: 依存追加**

  tailwindcss ^4, @tailwindcss/postcss ^4, clsx ^2, tailwind-merge ^2

- [ ] **Step 2: postcss.config.mjs を作成**

  ```javascript
  const config = {
    plugins: {
      "@tailwindcss/postcss": {},
    },
  };
  export default config;
  ```

- [ ] **Step 3: globals.css に design tokens 追加**

  ui-architecture.md §16 のトークン:
  - Colors: primary-500 #4F7A5A, primary-600 #3F6549, primary-100 #E5EFE7, accent-500 #D98F5C, accent-100 #F8E8DD, bg-canvas #F7F8F5, bg-surface #FFFFFF, bg-subtle #F1F4EE, danger-500 #C65A5A, danger-100 #FBE8E8, warning-500 #C98A2E, warning-100 #FAF0DA
  - Radius: sm 8px, md 14px, lg 20px, xl 28px
  - Shadows: sm/md/lg

- [ ] **Step 4: components.json を作成**

  style: "new-york", aliases: components `@/components`, ui `@/components/ui`, hooks `@/hooks`, lib `@/lib`

- [ ] **Step 5: src/lib/utils.ts を作成**

  ```typescript
  import { clsx, type ClassValue } from "clsx";
  import { twMerge } from "tailwind-merge";

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
  }
  ```

- [ ] **Step 6: shadcn/ui コンポーネントをインストール**

  button, card, input, label, tabs, separator。sandbox で CLI が使えない場合は手動作成。

- [ ] **Step 7: Tailwind レンダリング確認**

  landing page に design token カラーを適用して表示確認。

- [ ] **Step 8: コミット**

  `feat(web): add Tailwind CSS v4 + shadcn/ui with design tokens`

---

## Task 3: 環境変数 + Cognito SDK + Cookie Session 管理

**Files:**

- Create: `packages/web/.env.local.example`
- Create: `packages/web/src/lib/auth/cognito.ts`
- Create: `packages/web/src/lib/auth/session.ts`
- Modify: `packages/web/package.json`

- [ ] **Step 1: .env.local.example を作成**

  ```
  COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXXXXX
  COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
  COGNITO_REGION=ap-northeast-1
  API_GATEWAY_URL=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com
  SESSION_SECRET=change-me-to-random-32-char-string
  ```

- [ ] **Step 2: @aws-sdk/client-cognito-identity-provider を追加**

- [ ] **Step 3: cognito.ts を作成**
  - `cognitoSignUp(email, password, inviteCode)` → SignUpCommand
  - `cognitoConfirmSignUp(email, code)` → ConfirmSignUpCommand
  - `cognitoSignIn(email, password)` → InitiateAuthCommand (USER_PASSWORD_AUTH)
  - `cognitoRefreshTokens(refreshToken)` → InitiateAuthCommand (REFRESH_TOKEN_AUTH)
  - 全関数で入力を Zod 検証

- [ ] **Step 4: session.ts を作成**
  - Cookie 名: `__fitness_id`, `__fitness_access`, `__fitness_refresh`
  - `setSession(tokens)`: HttpOnly, SameSite=Lax, Secure=prod
  - `getSession()`: id token JWT payload デコード → `{ userId, email }` | null
  - `clearSession()`: 3 cookie 削除
  - id token maxAge: 1h, refresh maxAge: 30d

- [ ] **Step 5: TypeScript コンパイル確認**

- [ ] **Step 6: コミット**

  `feat(web): add Cognito SDK helpers and cookie session management`

---

## Task 4: Auth Route Handlers (BFF)

**Files:**

- Create: `packages/web/src/app/api/auth/signup/route.ts`
- Create: `packages/web/src/app/api/auth/signup/confirm/route.ts`
- Create: `packages/web/src/app/api/auth/signin/route.ts`
- Create: `packages/web/src/app/api/auth/signout/route.ts`
- Create: `packages/web/src/app/api/auth/refresh/route.ts`
- Create: `packages/web/src/app/api/auth/me/route.ts`

- [ ] **Step 1: POST /api/auth/signup**

  Zod validation (`{ email, password, inviteCode }`) → `cognitoSignUp` → `{ needsConfirmation: true }`。
  エラー: UsernameExistsException → 409, InvalidPasswordException → 400

- [ ] **Step 2: POST /api/auth/signup/confirm**

  Zod validation (`{ email, code }`) → `cognitoConfirmSignUp` → `{ success: true }`。
  エラー: CodeMismatchException → 400, ExpiredCodeException → 400

- [ ] **Step 3: POST /api/auth/signin**

  Zod validation (`{ email, password }`) → `cognitoSignIn` → `setSession(tokens)` → `{ success: true }`。
  トークンはレスポンスボディに含めない（cookie のみ）。
  エラー: NotAuthorizedException → 401, UserNotConfirmedException → 403

- [ ] **Step 4: POST /api/auth/signout**

  `clearSession()` → `{ success: true }`

- [ ] **Step 5: POST /api/auth/refresh**

  refresh token cookie 読み取り → `cognitoRefreshTokens` → cookie 更新。
  cookie 不在 or refresh 失敗 → 401

- [ ] **Step 6: GET /api/auth/me**

  `getSession()` → null なら refresh 試行 → それでも null なら 401。
  成功: `{ user: { id, email } }`

- [ ] **Step 7: curl テスト**

  signin → Set-Cookie ヘッダに `__fitness_id`, `__fitness_access` が含まれることを確認。

- [ ] **Step 8: コミット**

  `feat(web): add BFF auth route handlers`

---

## Task 5: Auth UI (Sign-in / Sign-up ページ)

**Files:**

- Create: `packages/web/src/app/(auth)/layout.tsx`
- Create: `packages/web/src/app/(auth)/signin/page.tsx`
- Create: `packages/web/src/app/(auth)/signup/page.tsx`
- Create: `packages/web/src/hooks/use-auth.ts`

- [ ] **Step 1: Auth layout を作成**

  centered layout, max-w-md mx-auto, bg-canvas, BottomTabBar なし。

- [ ] **Step 2: useAuth hook を作成**

  TanStack Query で `GET /api/auth/me` → `{ user, isLoading, isAuthenticated, signOut }`。
  queryKey: `["auth", "me"]`, staleTime: 5 min。
  `signOut()`: `POST /api/auth/signout` → invalidate query → redirect /signin。

- [ ] **Step 3: Sign-in page を作成**
  - Client component (`"use client"`)
  - shadcn Card + Input + Label + Button
  - email / password フィールド
  - Submit → `POST /api/auth/signin` → success で `/home` redirect
  - エラーメッセージ表示
  - "/signup" へのリンク
  - CTA: primary-500 (#4F7A5A)

- [ ] **Step 4: Sign-up page を作成**
  - 2段階: (1) email/password/inviteCode → POST /api/auth/signup (2) confirmation code → POST /api/auth/signup/confirm
  - 確認完了後 → /signin redirect + success message
  - "/signin" へのリンク

- [ ] **Step 5: フルフロー検証**

  signup → メール確認 → signin → /home 遷移。

- [ ] **Step 6: コミット**

  `feat(web): add auth UI pages with signin and signup`

---

## Task 6: API Proxy + TanStack Query セットアップ

**Files:**

- Create: `packages/web/src/app/api/proxy/[...path]/route.ts`
- Create: `packages/web/src/lib/api-client.ts`
- Create: `packages/web/src/lib/query-client.ts`
- Create: `packages/web/src/components/providers.tsx`
- Modify: `packages/web/src/app/layout.tsx`
- Modify: `packages/web/package.json`

- [ ] **Step 1: @tanstack/react-query を追加**

- [ ] **Step 2: Proxy route handler を作成**

  ```typescript
  // /api/proxy/[...path]/route.ts
  // cookie __fitness_access → Authorization: Bearer <token>
  // → ${API_GATEWAY_URL}/${path.join("/")}
  // GET, POST, PATCH, PUT, DELETE 全メソッド対応
  ```

  cookie 不在 → 401。API Gateway のステータスとボディをそのまま返却。

- [ ] **Step 3: api-client.ts を作成**

  ```typescript
  export async function apiClient<T>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`/api/proxy/${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  ```

- [ ] **Step 4: query-client.ts を作成**

  staleTime: 5min, retry: 1, refetchOnWindowFocus: false

- [ ] **Step 5: providers.tsx を作成**

  `"use client"` — QueryClientProvider wrapper。`useState` で QueryClient 生成。

- [ ] **Step 6: Root layout に Providers wrap**

- [ ] **Step 7: 疎通確認**

  `/api/proxy/users/me/profile` が Lambda 応答を返すことを確認。

- [ ] **Step 8: コミット**

  `feat(web): add API proxy route and TanStack Query setup`

---

## Task 7: AppShell + BottomTabBar + Middleware Auth Guard

**Files:**

- Create: `packages/web/middleware.ts`
- Create: `packages/web/src/components/domain/app-shell.tsx`
- Create: `packages/web/src/components/domain/bottom-tab-bar.tsx`
- Create: `packages/web/src/components/domain/top-bar.tsx`
- Create: `packages/web/src/app/(app)/layout.tsx`
- Create: `packages/web/src/app/(app)/home/page.tsx`
- Modify: `packages/web/package.json`

- [ ] **Step 1: lucide-react を追加**

- [ ] **Step 2: Edge Middleware を作成**

  ```typescript
  // Protected: /home, /plan, /chat, /progress, /profile
  // Auth: /signin, /signup
  // cookie __fitness_id なし + protected → redirect /signin
  // cookie __fitness_id あり + auth path → redirect /home
  // matcher: /((?!api|_next/static|_next/image|favicon.ico).*)
  ```

- [ ] **Step 3: TopBar を作成**

  "AI Fitness Partner" centered, h-12, bg-surface, border-bottom。

- [ ] **Step 4: BottomTabBar を作成**

  5 tabs: Home (Home icon), Plan (CalendarDays), Chat (MessageCircle), Progress (TrendingUp), Profile (User)。
  Active: primary-500, Inactive: neutral-500。
  `usePathname()` で active 判定。min-h-[44px] touch targets, pb-safe。

- [ ] **Step 5: AppShell を作成**

  TopBar + scrollable content (flex-1 overflow-y-auto px-4 pb-20) + BottomTabBar。
  bg-canvas, max-w-lg mx-auto。

- [ ] **Step 6: (app)/layout.tsx を作成**

  children を AppShell で wrap。

- [ ] **Step 7: Home placeholder page を作成**

  `useAuth()` で email 取得、"Welcome, {email}" 表示。
  empty state cards: "オンボーディングを完了して食事プランを作成しましょう"。

- [ ] **Step 8: 認証フロー検証**

  未認証で /home → /signin redirect。認証後 → AppShell + 5 tabs 表示。

- [ ] **Step 9: コミット**

  `feat(web): add AppShell with BottomTabBar and middleware auth guard`

---

## Task 8: Profile ページ — E2E CRUD 証明

**Files:**

- Create: `packages/web/src/hooks/use-profile.ts`
- Create: `packages/web/src/app/(app)/profile/page.tsx`

- [ ] **Step 1: use-profile.ts を作成**

  ```typescript
  import { UpdateUserProfileInputSchema } from "@fitness/contracts-ts";
  // useProfile(): useQuery GET /api/proxy/users/me/profile
  // useUpdateProfile(): useMutation PATCH /api/proxy/users/me/profile
  //   UpdateUserProfileInputSchema.parse(data) で入力検証
  //   onSuccess: invalidate ["profile"]
  ```

  **contracts-ts の Zod スキーマを import することで全パイプライン疎通を証明。**

- [ ] **Step 2: Profile page を作成**
  - Loading state: skeleton cards
  - Empty state: "プロフィール未作成。オンボーディングを完了してください"
  - Data state: 3 セクション (Body: age/sex/height_cm/weight_kg, Activity: activity_level/desired_pace, Wellness: sleep_hours/stress_level)
  - 各セクションに "Edit" ボタン → inline edit mode
  - Edit form: shadcn Input/Label、contracts-ts Zod 検証
  - Submit → useMutation → success/error feedback
  - Error state: message + retry button

- [ ] **Step 3: E2E 検証**
  1. Sign in → Profile tab → Lambda からプロフィール取得
  2. Edit (例: weight_kg 変更) → Zod 検証通過 → PATCH → DynamoDB 永続化
  3. ページ reload → 更新値が保持されていることを確認

- [ ] **Step 4: コミット**

  `feat(web): add profile page with E2E CRUD proof using contracts-ts`

---

## Task 9: Root Scripts + 最終検証

**Files:**

- Modify: `package.json` (root)

- [ ] **Step 1: Root scripts 追加**

  ```json
  {
    "dev:web": "pnpm --filter @fitness/web dev",
    "build:web": "pnpm --filter @fitness/web build"
  }
  ```

- [ ] **Step 2: 最終検証チェックリスト**
  - [ ] `pnpm --filter @fitness/web build` — TypeScript エラー 0
  - [ ] `pnpm --filter @fitness/web dev` → localhost:3000 起動
  - [ ] 未認証で localhost:3000 → /signin redirect (middleware)
  - [ ] Sign-up (invite code) → メール確認 → Sign-in
  - [ ] HttpOnly cookie がブラウザに設定される
  - [ ] Sign-in 後 → /home に AppShell + BottomTabBar (5 tabs)
  - [ ] Profile tab → Lambda からデータ取得
  - [ ] Profile edit → Zod 検証 → PATCH → DynamoDB 永続化 → reload で値保持
  - [ ] Sign-out → cookie 削除 → /signin redirect
  - [ ] Mobile viewport (375px) → BottomTabBar がタップ可能 (44px+)
  - [ ] `UpdateUserProfileInputSchema` が `@fitness/contracts-ts` から正しく import される

- [ ] **Step 3: コミット**

  `chore(web): add root scripts and verify E2E auth + CRUD flow`

---

## Dependency Graph

```
Task 1 (Next.js init)
├── Task 2 (Tailwind + shadcn) ──────┐
├── Task 3 (Cognito + Session) ──────┤
│   └── Task 4 (Auth route handlers) ┤
└── Task 6 (Proxy + TanStack Query) ─┤
                                      ▼
                         Task 5 (Auth UI)
                              │
                              ▼
                         Task 7 (AppShell + Middleware)
                              │
                              ▼
                         Task 8 (Profile E2E)
                              │
                              ▼
                         Task 9 (Verification)
```

**並列化:** Task 1 完了後、Task 2, 3, 6 は並列実行可能。
