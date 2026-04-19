承知いたしました。
以下に、**パーソナルフィットネストレーナーサービスの実装前提UI仕様書 完成版**を、画面構成・情報設計・状態・コンポーネント・デザインシステム・遷移・レスポンシブ方針まで含めて一括で整理いたします。

---

# パーソナルフィットネストレーナーサービス

# 実装前提 UI仕様書 完成版

---

## 1. 目的

本仕様書は、パーソナルフィットネストレーナーサービスのUIを、**そのまま設計・実装へ移行できる粒度**で定義するものである。

このサービスの中核価値は以下の3点である。

1. 会話を通じてユーザー理解を深めること
2. 計算根拠のある食事・習慣プランを提示すること
3. 継続しやすい daily UX を提供すること

したがってUIは、単なるチャットアプリでも、単なるカロリー記録アプリでもなく、
**Conversational Onboarding + Daily Dashboard + Adjustable Plan UI**
として設計する。

---

# 2. プロダクト体験の中核方針

## 2.1 UX原則

### 原則1: 初回は会話で理解される感覚を作る

オンボーディングでは、ユーザーに「自分向けに作られている」と感じさせる必要がある。
そのため、初回設定はフォーム直打ちではなく、**会話風ステップ入力**を採用する。

### 原則2: 継続利用はホーム中心

日常利用で重要なのは、毎回長い会話をすることではない。
重要なのは、**今日何をすべきかが一目で分かること**である。

### 原則3: 数字は必要な場所でだけ強く出す

このサービスは計算精度が価値だが、最初から calorie / macro の数字を前面に出しすぎると圧迫感が強くなる。
よって、**感情的安心感を先に、精密さはオンデマンドで後に**出す。

### 原則4: 計画は固定ではなく調整前提

食事プランは一度作って終わりではなく、差し替え・外食・飲み会・予定変更を前提としたUIにする。

---

# 3. ターゲットデバイスと優先順位

## 3.1 優先

- **モバイルファースト**
- PWA対応を考慮可能な構成が望ましい

## 3.2 理由

利用シーンが以下に集中するため。

- 朝の確認
- 食事前
- 買い物中
- 外食前
- 間食したい瞬間
- 就寝前の振り返り

## 3.3 デスクトップ

- 閲覧性向上
- 週次レビュー
- プラン全体確認
  には有効だが主利用ではない

---

# 4. 情報設計

## 4.1 グローバル構造

```text
1. Onboarding
2. Home
3. Plan
4. Chat
5. Progress
6. Profile
7. Settings
```

## 4.2 タブ構成

モバイルの下部ナビゲーションは以下。

```text
Home | Plan | Chat | Progress | Profile
```

### 役割

- **Home**: 今日の行動の中心
- **Plan**: 7日食事計画の閲覧・調整
- **Chat**: 例外相談・変更相談
- **Progress**: 体重・行動達成の振り返り
- **Profile**: 嗜好・制限・生活条件の更新

---

# 5. ルーティング仕様

```text
/                         -> splash / auth gate
/onboarding               -> entry
/onboarding/safety
/onboarding/stats
/onboarding/lifestyle
/onboarding/preferences
/onboarding/snacks
/onboarding/feasibility
/onboarding/review
/onboarding/blocked        -> Safety で妊娠中 / 摂食障害既往 / 医師からの食事制限 のいずれかを検知した場合のみ遷移する受け皿画面

/home
/plan
/plan/day/:date
/plan/swap/:mealId
/chat
/progress
/profile
/profile/edit
/settings
/settings/notifications
/settings/privacy
```

---

# 6. 主要画面一覧

---

## 6.1 Onboarding

### 目的

- ユーザー情報の収集
- 安全フラグの検知
- 初回プラン作成に必要な入力完了
- 会話による信頼醸成

### UI形式

- **チャット風ステップフォーム**
- 1画面1セクション
- 上部 progress indicator 表示

### セクション

1. Safety
2. Stats
3. Lifestyle
4. Food Preferences
5. Snack Habits
6. Feasibility
7. Review

---

## 6.2 Home

### 目的

- 今日やることを即座に理解させる
- 1日の計画を迷わず実行させる
- 行動変容の中心UIになる

### 優先度

最重要画面

---

## 6.3 Plan

### 目的

- 7日間の計画を確認
- 日別詳細を見る
- 食事差し替えを行う

---

## 6.4 Chat

### 目的

- 外食
- 飲み会
- 間食衝動
- プラン変更
- 特定メニュー相談

など、**計画に対する例外処理UI** とする。

---

## 6.5 Progress

### 目的

- 体重の変化だけでなく、行動達成率も可視化
- 継続モチベーションの維持
- 停滞時にも前進を見せる

---

## 6.6 Profile

### 目的

- 嗜好
- 制限
- 生活条件
- 目標
- 水分や通知設定の調整

---

# 7. Onboarding UI仕様

---

## 7.1 共通レイアウト

### レイアウト構成

- App bar
- Progress bar
- Coach prompt card
- Input region
- Next button
- Back link

### Plan 07 実装ノート

- **Coach prompt 先読み (経路 C)**: 各 page の `useOnboarding.prefetchCoachPrompt(nextStage, snapshot)` を「次へ」押下時に呼ぶことで、次画面が render される前に `/api/onboarding/coach-prompt` (Route Handler → `@ai-sdk/anthropic` 経路) を TanStack Query cache に流し込む。次画面の `useQuery(["coach-prompt", stage])` は cache hit で即時描画される
- **Free-text parse (fire-and-forget)**: Lifestyle / Preferences / Snacks の Textarea 入力は「次へ」押下時に `/api/onboarding/free-text-parse` へ POST するが、ユーザー遷移をブロックしない。成功時は `<stage>_note` フィールドへ `useUpdateProfile` 経由で書き戻される
- **Safety 決定的ルール (非 LLM)**: 妊娠 / 摂食障害既往 / 医師からの食事制限 のいずれか true なら `/onboarding/blocked` へ遷移。判定はクライアント `@/lib/onboarding/safety` と Lambda `infra/lambdas/shared/onboarding-safety.ts` の 2 箇所で実施し、`packages/contracts-ts/schemas/fixtures/safety-matrix.json` の共有 fixture で TypeScript / Python 両実装の等価性をテスト担保

### 構造

```text
┌──────────────────────┐
│ ←        セットアップ       35% │
├──────────────────────┤
│ [progress bar]               │
│                              │
│ Coach message                │
│ 「まずは安全面を確認します」   │
│                              │
│ [input controls]             │
│                              │
│ [次へ]                       │
└──────────────────────┘
```

---

## 7.2 Safety Screen

### 入力項目

- 持病の有無
- 通院中か
- 服薬の有無
- 妊娠/授乳中か
- 医師から食事制限されているか
- 摂食障害既往の有無

### UI

- yes/no segmented controls
- 条件付き textarea
- caution banner

### バリデーション

- 医療的リスクがある場合は通常フロー停止
- ブロック時は専用画面へ遷移

---

## 7.3 Stats Screen

### 入力項目

- 年齢
- 生物学的性別
- 身長
- 現在体重
- 目標体重 or 目標の見た目
- 減量ペース希望

### UI

- number input
- segmented control
- goal chips
- optional textarea

### コンポーネント

- `NumberField`
- `ChoiceChips`
- `InlineUnitInput`

---

## 7.4 Lifestyle Screen

### 入力項目

- 仕事タイプ
- 運動頻度
- 運動種別
- 睡眠時間
- ストレス
- 飲酒

### UI

- job type cards
- workouts chips
- multi-select tags
- sleep slider or stepper
- alcohol frequency picker

---

## 7.5 Preferences Screen

### 入力項目

- 好きな料理 5つ
- 嫌いな食材
- アレルギー・制限
- 調理スタイル
- 食の冒険度

### UI

- searchable chips input
- suggestion chips
- allergy pill tags
- cooking style cards
- 1-10 slider

---

## 7.6 Snacks Screen

### 入力項目

- 現在の間食
- 間食理由
- 甘い/しょっぱい
- 夜食の有無

### UI

- free input + suggested snack tags
- segmented reason selector
- taste preference segmented control

---

## 7.7 Feasibility Screen

### 入力項目

- 外食中心 / 自炊中心
- 食費感
- 1日の食事回数
- 平日休日差
- 居住国
- キッチン設備
- コンビニ利用頻度

### UI

- radio cards
- budget chips
- meal frequency stepper
- textarea
- country autocomplete

---

## 7.8 Review Screen

### 目的

- 入力内容確認
- 編集導線
- プラン生成開始

### UI

- section summary cards
- each card has edit button
- final CTA: 「プランを作成する」

---

# 8. Home画面 UI仕様

---

## 8.1 画面目的

Home は「今日のコーチ画面」である。
この画面だけ見れば、ユーザーが今日何をすればよいか分かる状態を作る。

---

## 8.2 レイアウト構成

上から以下の順で表示する。

1. Greeting Header
2. Daily Summary Card
3. Today Actions Card
4. Meal Cards
5. Coach Insight Card
6. Progress Summary
7. Quick Actions

---

## 8.3 Greeting Header

### 表示項目

- 挨拶
- 今日の日付
- 今日のテーマ

### 例

- おはようございます
- 今日は「高タンパクで安定させる日」
- 4月12日 月曜日

---

## 8.4 Daily Summary Card

### 表示項目

- 目標カロリー
- タンパク質目標
- 水分目標
- optional: 歩数 or 運動予定

### UI要件

- 最も視認性高く
- 主要数字は大きく
- 補足説明は小さく

### データ構造例

```ts
type DailySummary = {
  caloriesTarget: number;
  proteinTargetG: number;
  waterTargetL: number;
  dayTheme: string;
};
```

---

## 8.5 Today Actions Card

### 表示項目

- 今日やるべきアクション 3〜5件
- 完了チェック可能

### 例

- 朝食でタンパク質30gを確保
- 午後のおやつを置き換える
- 水をあと1.2L飲む
- 夜のアルコールは2杯まで

### UI

- checklist cards
- toggle completion
- completed items collapse optional

---

## 8.6 Meal Section

### 形式

- 2列カードグリッド
- モバイルでは縦積みも許容

### カード種別

- 朝食
- 昼食
- 夕食
- optional dessert

### 各カード要素

- meal type
- meal name
- calorie
- P/F/C
- prep time
- tags
  - batch
  - quick
  - treat

- swap action

### カード内アクション

- 記録する
- 差し替える
- 詳細を見る

---

## 8.7 Coach Insight Card

### 目的

AI感の演出ではなく、**今日の一言戦略メモ**を表示する。

### 表示内容

- 1〜3文
- ユーザー履歴に基づく短い提案

### 例

「昨日は夕食後の空腹が強かったため、今日は昼のタンパク質を少し増やして夜の食欲を抑えます。」

---

## 8.8 Progress Summary

### 表示項目

- kcal progress
- protein progress
- water progress

### UI

- 3つの progress ring か progress bar
- ホームでは簡易表示のみ

---

## 8.9 Quick Actions

### ボタン例

- 外食になった
- 間食したい
- 飲み会がある
- 今日は運動できない
- 食事を差し替える

### 役割

Chat導線を文脈付きで簡略化する

---

# 9. Plan画面 UI仕様

---

## 9.1 目的

- 7日計画を把握
- 今日以外の日も確認
- 食事差し替え
- 週単位での準備補助

---

## 9.2 上部構成

- week selector
- 今日のハイライト
- 週全体サマリー
  - 平均 kcal
  - 平均 protein
  - treat meals count
  - batch meal count

---

## 9.3 日別表示

### 推奨UI

- 横スクロール日付タブ
- 選択した日の meal cards 表示

### タブ例

```text
Mon 12 | Tue 13 | Wed 14 | Thu 15 | Fri 16 | Sat 17 | Sun 18
```

---

## 9.4 日別詳細

### 表示項目

- テーマ名
- 1日総計 kcal / P/F/C
- 朝昼夕デザート
- alcohol allocation
- batch indicator
- shopping notes

---

## 9.5 差し替えモーダル / 画面

### 起動方法

Meal card の「差し替え」タップ

### 差し替え候補ロジック

- 同じ meal type
- 近い kcal
- 近い P/F/C
- 嗜好に合う
- 調理時間近い
- restrictions 遵守

### 表示要素

- 候補 meal list
- why suggested
- kcal / P/F/C
- prep time
- tags

### CTA

- この食事に変更
- 別の候補を見る

---

## 9.6 買い物補助

### 週単位セクション

- 今週のまとめ買い候補
- batch prep 推奨
- コンビニ代替案

---

# 10. Chat画面 UI仕様

---

## 10.1 目的

Chatは主導線ではなく、**例外対応UI**である。

---

## 10.2 レイアウト

- message list
- suggested prompts strip
- composer
- context banner

### context banner 例

- 今日の目標: 2050 kcal / P 150g
- 夕食未記録
- 飲酒予定あり

---

## 10.3 Suggested Prompts

### 初期候補

- 外食になる
- 飲み会が入った
- 間食したい
- 今日の夕食を変えたい
- 明日ジムに行けない
- コンビニで済ませたい

---

## 10.4 チャットメッセージ設計

### 返答の基本構成

1. 状況理解
2. 提案
3. 差し替え案
4. 数字影響
5. すぐ押せる選択肢

### 例UI

- plain text response
- inline action chips
  - これに変更
  - 今日は維持でいく
  - kcal調整する

---

# 11. Progress画面 UI仕様

---

## 11.1 目的

- 成果と行動の両方を見せる
- 停滞時の離脱を防ぐ
- 振り返りと自己効力感を支える

---

## 11.2 構成

1. 期間切替
2. 体重推移
3. 行動達成率
4. 週次サマリー
5. コーチレビュー

---

## 11.3 期間切替

- 7日
- 30日
- 90日

segmented control で切替

---

## 11.4 体重グラフ

### 表示

- daily point
- 7日移動平均線
- optional goal line

### 注意

- 単日変動を強調しすぎない
- 平均線を主役にする

---

## 11.5 行動達成率

### 表示項目

- protein target hit rate
- hydration hit rate
- plan adherence
- logging consistency
- late-night snack avoidance

### UI

- horizontal bars
- weekly comparison cards

---

## 11.6 週次サマリー

### 表示例

- 体重: -0.4kg
- タンパク質達成率: 82%
- 水分達成率: 71%
- 夜食回数: 2回
- 最も崩れた時間帯: 22時台

---

## 11.7 コーチレビュー

### 内容

- 1週間の傾向要約
- 改善優先順位 1〜2個
- 良かった点

---

# 12. Profile画面 UI仕様

---

## 12.1 表示セクション

- 目標
- 身体情報
- 生活スタイル
- 食の嗜好
- 間食傾向
- 安全情報
- 通知

### 各セクション

- summary row
- edit action

---

## 12.2 編集方針

- 単一項目編集ではなく、セクション単位編集
- 元の onboarding input component を再利用

---

# 13. Settings画面 UI仕様

---

## 13.1 設定項目

- 通知
- 単位設定
- データエクスポート
- プライバシー
- アカウント削除
- 免責表示

---

## 13.2 通知設定

- 朝の確認
- 食事前リマインド
- 水分リマインド
- 週次レビュー通知

---

# 14. ブロック / 注意画面仕様

---

## 14.1 Blocked Screen

### トリガー

- 妊娠中の減量相談
- 摂食障害兆候
- 強い医療リスク
- 急性危険症状

### UI要件

- 強い赤ではなく、落ち着いた注意配色
- 通常プランを停止
- 理由
- 受診・専門相談の案内
- 一般的に安全な範囲の助言のみ

---

## 14.2 Caution Banner

### 表示条件

- 高ストレス
- 睡眠不足
- 急激減量希望
- 高頻度飲酒

### 表示位置

- Home summary 下
- Plan overview 上
- relevant chat responses 上

---

# 15. 状態管理仕様

---

## 15.1 主要状態

```ts
type AppState = {
  onboardingCompleted: boolean;
  currentUserProfile: UserProfile | null;
  currentPlan: WeeklyPlan | null;
  todayProgress: TodayProgress | null;
  riskLevel: "safe" | "caution" | "blocked";
  unreadCoachMessages: number;
};
```

---

## 15.2 Home画面状態

```ts
type HomeViewState = {
  summary: DailySummary;
  actions: DailyAction[];
  meals: MealCardData[];
  coachInsight: string;
  progress: {
    calories: number;
    protein: number;
    water: number;
  };
};
```

---

## 15.3 Plan画面状態

```ts
type PlanViewState = {
  selectedDate: string;
  weekRange: {
    start: string;
    end: string;
  };
  days: DayPlan[];
};
```

---

# 16. デザインシステム仕様

---

## 16.1 デザインキーワード

- Calm
- Clear
- Personal
- Trustworthy
- Encouraging

---

## 16.2 カラートークン

### Base

```text
bg.canvas = #F7F8F5
bg.surface = #FFFFFF
bg.subtle = #F1F4EE
```

### Primary

```text
primary.500 = #4F7A5A
primary.600 = #3F6549
primary.100 = #E5EFE7
```

### Accent

```text
accent.500 = #D98F5C
accent.100 = #F8E8DD
```

### Info / Neutral

```text
neutral.900 = #1F2937
neutral.700 = #4B5563
neutral.500 = #6B7280
neutral.200 = #E5E7EB
neutral.100 = #F3F4F6
```

### Warning

```text
warning.500 = #C98A2E
warning.100 = #FAF0DA
```

### Danger

```text
danger.500 = #C65A5A
danger.100 = #FBE8E8
```

---

## 16.3 角丸

```text
radius.sm = 8px
radius.md = 14px
radius.lg = 20px
radius.xl = 28px
```

### 推奨

- card: md or lg
- modal: lg
- primary CTA: xl

---

## 16.4 シャドウ

```text
shadow.sm = 0 1px 2px rgba(0,0,0,0.05)
shadow.md = 0 4px 16px rgba(0,0,0,0.08)
shadow.lg = 0 10px 30px rgba(0,0,0,0.10)
```

過度な shadow は使わない。
柔らかい浮き感に留める。

---

## 16.5 タイポグラフィ

### Font role

- Heading: readable sans
- Body: neutral sans
- Numeric: same family, semibold for key stats

### サイズ

```text
display = 32
h1 = 28
h2 = 22
h3 = 18
body = 16
body.sm = 14
caption = 12
```

### 行間

```text
heading = 1.2
body = 1.5
caption = 1.4
```

---

## 16.6 スペーシング

```text
space.1 = 4px
space.2 = 8px
space.3 = 12px
space.4 = 16px
space.5 = 20px
space.6 = 24px
space.8 = 32px
space.10 = 40px
space.12 = 48px
```

---

# 17. コンポーネント仕様

---

## 17.1 基本コンポーネント一覧

- `AppShell`
- `BottomTabBar`
- `TopBar`
- `ProgressBar`
- `CoachPromptCard`
- `SummaryStatCard`
- `ActionChecklistCard`
- `MealCard`
- `MacroBadge`
- `TagChip`
- `SwapModal`
- `ProgressRing`
- `WeeklyTrendChart`
- `SectionSummaryCard`
- `CautionBanner`
- `DangerNoticeCard`
- `QuickActionButton`
- `ChoiceChipGroup`
- `InlineUnitInput`
- `SegmentedControl`
- `MultiTagInput`
- `CoachInsightCard`

---

## 17.2 MealCard 仕様

### Props 例

```ts
type MealCardProps = {
  mealType: "breakfast" | "lunch" | "dinner" | "dessert";
  title: string;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  prepTimeMin?: number;
  tags?: Array<"quick" | "batch" | "treat">;
  onSwap?: () => void;
  onLog?: () => void;
  onOpen?: () => void;
};
```

### UI要件

- 一目で meal type が分かる
- 栄養値は読みやすい
- タグは小さく、しかし識別可能
- CTAは最大3つまで

---

## 17.3 CoachInsightCard 仕様

### 要素

- title: 今日のコーチメモ
- message
- optional CTA

### ビジュアル

- 背景は subtle tint
- 強すぎないアイコン

---

## 17.4 ProgressRing 仕様

### 用途

- kcal
- protein
- water

### 状態

- 0〜100%
- 超過時は capped 表示 + over label optional

---

## 17.5 ChoiceChipGroup

### 用途

- 性別
- 仕事タイプ
- ストレス
- 間食理由
- 味の好み

### 条件

- キーボードでも操作可能
- 選択状態が明確
- touch target 44px以上

---

# 18. レスポンシブ仕様

---

## 18.1 Breakpoints

```text
sm: 0-639
md: 640-1023
lg: 1024+
```

---

## 18.2 モバイル

- 1カラム基本
- Meal cards は縦並び優先
- Sticky bottom nav
- Full-screen modal 許容

---

## 18.3 タブレット

- Home は 2カラム可
- Plan は left tabs + right details 可
- Progress は chart を広めに表示

---

## 18.4 デスクトップ

- max-width container
- Home:
  - left: summary/actions/coach
  - right: meals/progress

- Plan:
  - left rail date nav
  - center day plan
  - right swap suggestions optional

---

# 19. アクセシビリティ仕様

---

## 19.1 基本要件

- WCAG AA 準拠を目標
- コントラスト確保
- キーボード操作可能
- フォーカスリング明示
- スクリーンリーダー label 設定

---

## 19.2 入力UI

- placeholder 依存禁止
- label 常時表示
- error message は入力直下
- 単位は視覚だけでなく読み上げ可能にする

---

## 19.3 グラフ

- 数値代替表示あり
- 色だけに依存しない
- tooltips 以外に summary text を持つ

---

# 20. マイクロコピー方針

---

## 20.1 トーン

- 丁寧
- 明快
- 命令口調にしすぎない
- 罪悪感を煽らない
- 継続を評価する

---

## 20.2 例

### 良い

- 今日の目標を無理なく進めましょう
- この置き換えで満足感を保ちつつ調整できます
- 1日のズレは普通です。週単位で整えます

### 避ける

- 失敗しました
- 食べすぎです
- ルール違反です
- もっと頑張りましょう

---

# 21. 空状態 / エラー状態 / ローディング状態

---

## 21.1 Empty states

### Home

- まだ今日のプランがありません
- CTA: 先にプランを作成する

### Progress

- データが溜まると変化が見えるようになります

### Plan

- 今週の計画を作成中です

---

## 21.2 Loading states

- skeleton card 表示
- Home は summary -> actions -> meals の順に段階表示可

---

## 21.3 Error states

- プラン生成失敗
- 差し替え候補取得失敗
- チャット応答失敗
- 再試行CTAあり

---

# 22. 通知UX仕様

---

## 22.1 通知種類

- 朝のプラン確認
- 食事前リマインド
- 水分リマインド
- 週次レビュー
- 計画変更提案

---

## 22.2 通知文面方針

- 行動を1つに絞る
- 数字と目的を短く含める

### 例

- 今日の目標は 2050 kcal / たんぱく質 150g です
- 水分があと 900ml で目標です
- 今週の傾向がまとまりました

---

# 23. 分析イベント設計

---

## 23.1 Onboarding

- onboarding_started
- onboarding_step_completed
- onboarding_abandoned
- onboarding_completed

## 23.2 Home

- home_viewed
- daily_action_checked
- meal_logged
- swap_started
- swap_completed

## 23.3 Plan

- day_plan_viewed
- weekly_plan_viewed
- meal_swapped

## 23.4 Chat

- quick_action_clicked
- message_sent
- plan_adjustment_applied

## 23.5 Progress

- progress_viewed
- timeframe_changed

---

# 24. 実装優先順位

---

## Phase 1

- Onboarding
- Home
- Plan
- Meal swap
- Basic Chat
- Profile

## Phase 2

- Progress
- Weekly review
- Notifications
- Shopping support

## Phase 3

- Advanced substitutions
- Deeper analytics
- Habit suggestions personalization
- PWA polish

---

# 25. 推奨技術実装方針

これは推測ですが、フロントエンド実装前提としては以下が相性がよいです。

- Next.js / React
- TypeScript
- Tailwind CSS
- shadcn/ui ベースの部品設計
- TanStack Query で daily summary / plan / progress を取得
- Zod で onboarding 入力境界を parse
- nuqs で plan/date/filter の URL 状態管理

### UI実装で重要なこと

- 画面単位ではなく**カード単位の疎結合設計**
- `HomeSummary`, `TodayActions`, `MealGrid`, `CoachInsight` のように分ける
- 入力系コンポーネントは onboarding と profile で再利用する

---

# 26. 画面別ワイヤーフレーム簡易版

---

## 26.1 Home

```text
┌──────────────────────────────┐
│ おはようございます                      │
│ 今日は「高タンパクで安定させる日」       │
│ 2050 kcal | P 150g | 水 2.8L           │
├──────────────────────────────┤
│ 今日やること                            │
│ □ 朝食でタンパク質30g                  │
│ □ 午後のおやつを置き換える             │
│ □ 水をあと1.2L                         │
├──────────────────────────────┤
│ 朝食カード                              │
│ 昼食カード                              │
│ 夕食カード                              │
│ デザートカード                          │
├──────────────────────────────┤
│ 今日のコーチメモ                        │
├──────────────────────────────┤
│ kcal / protein / water progress        │
├──────────────────────────────┤
│ [外食] [間食] [飲み会] [差し替え]      │
└──────────────────────────────┘
```

---

## 26.2 Plan

```text
┌──────────────────────────────┐
│ 今週のプラン                            │
│ 平均 2050 kcal / P 150g                │
├──────────────────────────────┤
│ Mon | Tue | Wed | Thu | Fri | Sat | Sun│
├──────────────────────────────┤
│ Monday: Mediterranean Monday          │
│ Total: 2050 / P150 F65 C210            │
│ 朝食カード                              │
│ 昼食カード                              │
│ 夕食カード                              │
│ デザートカード                          │
│ [食事を差し替える]                     │
└──────────────────────────────┘
```

---

## 26.3 Progress

```text
┌──────────────────────────────┐
│ Progress                                  │
│ [7日] [30日] [90日]                      │
├──────────────────────────────┤
│ 体重グラフ                                │
├──────────────────────────────┤
│ 達成率                                    │
│ Protein 82%                              │
│ Water 71%                                │
│ Plan adherence 76%                       │
├──────────────────────────────┤
│ 今週のコーチレビュー                      │
└──────────────────────────────┘
```

---

# 27. このUI仕様の最終結論

このサービスのUIは、以下の一文に集約されます。

**「理解される体験は会話で作り、継続する体験はダッシュボードで支える」**

したがって完成形は、

- 初回: 会話風ステップ入力
- 日常: Home中心
- 計画確認: Plan
- 例外相談: Chat
- 振り返り: Progress
- 条件変更: Profile

という構造です。

そしてビジュアルは、

- 高級ウェルネス寄り
- 穏やかなグリーン/ティール系
- 柔らかいカードUI
- 数字は明快だが圧迫しない
