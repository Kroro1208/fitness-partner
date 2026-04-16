# 1. Agentic Stack とは何か

Agentic Stack は、AIエージェントに **永続的な記憶・再利用可能なスキル・安全プロトコル** を持たせるためのファイルベースのインフラ設計パターン。

コアの思想はシンプルで、「モデルは交換可能。蓄積した記憶とスキルこそが資産」というもの。Garry Tan の表現を借りれば：

> Memory is markdown. Skills are markdown. Brain is a git repo.
> The harness is a thin conductor — it reads the files, it doesn't own them.

つまり、ハーネス（Claude Code 等）は薄い指揮者に徹し、知性はすべてマークダウンファイルとして git リポジトリに置く。モデルを乗り換えても、ハーネスを変えても、スキルと記憶はそのまま残る。

---

## 2. なぜ導入すべきか — 5つのメリット

### 2-1. セッションを跨いだ記憶の永続化

Claude Code は会話がリセットされると過去の文脈を失う。Agentic Stack の4層メモリは、過去の失敗・意思決定・学習をファイルとして保持し、毎セッション開始時に読み込むことで「昨日の自分を覚えているエージェント」を実現する。

### 2-2. スキルの自己進化（Self-Rewrite Hook）

各スキルファイルの末尾に「自己書き換えフック」を持たせることで、失敗パターンを検知→スキル自身を更新→次回以降は改善済みの手順で動く、という自律改善ループが回る。

### 2-3. プログレッシブ・ディスクロージャー

全スキルを毎回コンテキストに詰め込むのではなく、トリガーワードにマッチしたスキルだけを動的にロードする。コンテキストウィンドウの無駄遣いを防ぎ、モデルの精度を維持できる。

### 2-4. プロトコルによる安全境界

`permissions.md` と `tool_schemas/` で「何をして良いか・悪いか」を明示的に定義し、`pre_tool_call` フックで実行時に強制する。本番環境への force push や秘密鍵への直接アクセスなど、致命的な操作を構造的にブロックできる。

### 2-5. Dream Cycle による自動圧縮

毎晩のクーロンジョブでエピソード記憶を圧縮し、繰り返し出現するパターンをセマンティック記憶に昇格させる。手動キュレーション不要で、記憶が自然に洗練されていく。

---

## 3. アーキテクチャ全体像

```
ここ数週間試して割といい感じの構成
.agent/
├── AGENTS.md                    # ルート設定（エージェントが最初に読むファイル）
├── memory/
│   ├── working/                 # Layer 1: 作業中の揮発的な状態
│   │   ├── WORKSPACE.md
│   │   └── ACTIVE_PLAN.md
│   ├── episodic/                # Layer 2: 過去の実行ログ（JSONL）
│   │   ├── AGENT_LEARNINGS.jsonl
│   │   └── snapshots/
│   ├── semantic/                # Layer 3: 過去の失敗・成功から自動抽出されたルール
│   │   ├── LESSONS.md
│   │   ├── DECISIONS.md
│   │   └── DOMAIN_KNOWLEDGE.md
│   ├── personal/                # Layer 4: 開発者それぞれの好みのやつ
│   │   └── PREFERENCES.md
│   └── auto_dream.py            # 夜間圧縮スクリプト
├── skills/
│   ├── _index.md                # スキル一覧（トリガー付き）
│   ├── _manifest.jsonl          # 機械が可読なスキルのメタデータ
│   ├── skillforge/SKILL.md      # スキル生成スキル（メタスキル）
│   ├── memory-manager/SKILL.md  # 記憶管理スキル
│   └── ...
├── protocols/
│   ├── permissions.md           # 許可/禁止ルール
│   ├── delegation.md            # サブエージェント委譲ルール
│   └── tool_schemas/            # ツールごとの型付きスキーマ
└── hooks/
    ├── pre_tool_call.py         # 実行前の権限チェック
    ├── post_execution.py        # 実行後の自動ログ
    └── on_failure.py            # 失敗時の学習トリガー
```

---

## 4. 4層メモリの設計思想

| Layer    | ディレクトリ       | 役割                     | 更新頻度       | 寿命                      |
| -------- | ------------------ | ------------------------ | -------------- | ------------------------- |
| Working  | `memory/working/`  | 今やっているタスクの状態 | 数分ごと       | タスク完了まで            |
| Episodic | `memory/episodic/` | 何が起きたかの生ログ     | 毎アクション   | 90日（Dream Cycleで圧縮） |
| Semantic | `memory/semantic/` | パターン化された教訓     | Dream Cycle時  | 半永久                    |
| Personal | `memory/personal/` | ユーザー固有の好み       | 手動 or 低頻度 | 永久                      |

**重要なところ**: Personal（個人の好み）を Semantic（一般教訓）に混ぜない。

「TypeScript strict mode を常に使う」は自分の好みであって、万人へのベストプラクティスとは限らない。

---

## 5. Claude Code への具体的な導入手順

### Step 1: ディレクトリ構造の作成

```bash
# プロジェクトルートで実行
mkdir -p .agent/{memory/{working,episodic/snapshots,semantic,personal},skills,protocols/tool_schemas,hooks}
```

### Step 2: AGENTS.md の作成

プロジェクトルートの `.agent/AGENTS.md` に以下を配置する。Claude Code がセッション開始時に参照する「脳の地図」になる。

```markdown
# Agent Infrastructure

## Memory

- `memory/working/WORKSPACE.md` — 現在のタスク状態（最初に読む）
- `memory/semantic/LESSONS.md` — 蒸留されたパターン（意思決定の前に読む）
- `memory/semantic/DECISIONS.md` — 過去の重要な意思決定と根拠
- `memory/personal/PREFERENCES.md` — ユーザーの規約・スタイル
- `memory/episodic/AGENT_LEARNINGS.jsonl` — 生の経験ログ

## Skills

- `skills/_index.md` — スキル発見用。ここをまず読む
- トリガーがマッチした場合のみ、フルの SKILL.md をロードする

## Protocols

- `protocols/permissions.md` — ツール呼び出し前に必ず確認

## Rules

1. 過去に修正された判断については、行動前に memory を確認する
2. 重要なアクションはすべて episodic memory にログする
3. 作業中は WORKSPACE.md を随時更新する
4. permissions.md のルールは厳守。blocked は blocked
```

### Step 3: CLAUDE.md との統合

既存の `CLAUDE.md`（または `.claude/CLAUDE.md`）に以下のセクションを追加し、Claude Code に `.agent/` の存在を認識させる。

```markdown
## Agent Infrastructure

このプロジェクトは `.agent/` ディレクトリにエージェントインフラを持つ。
セッション開始時に `.agent/AGENTS.md` を読み、memory・skills・protocols の所在を把握すること。

- 意思決定の前に `memory/semantic/LESSONS.md` と `DECISIONS.md` を確認
- タスク開始時に `memory/working/WORKSPACE.md` を更新
- 失敗時は `memory/episodic/AGENT_LEARNINGS.jsonl` にログを追記
- スキルは `skills/_index.md` のトリガーでマッチしたものだけロード
```

### Step 4: 4層メモリの初期ファイル作成

**WORKSPACE.md**（作業コンテキスト）:

```markdown
# Current Workspace

## Active Task

（ここにタスク開始時の状態を書く）

## Open Files

-

## Checkpoints

- [ ]
```

**PREFERENCES.md**（個人設定）:

```markdown
# Preferences

## Code Style

- TypeScript strict mode 必須
- `any` 型の使用禁止
- 関数型パターンを優先（class より）
- 2スペースインデント

## Workflow

- テスト実行後にコミット
- PR は小さく、early draft で作成
- コミットメッセージは日本語 OK

## Stack

- Frontend: React / Next.js / TypeScript
- Backend: Ruby on Rails
- DB: PostgreSQL
```

**LESSONS.md**（蒸留された教訓 — 最初は空でOK）:

```markdown
# Agent Lessons

<!-- Dream Cycle や手動で蒸留された教訓がここに蓄積される -->
```

**DECISIONS.md**（意思決定記録）:

```markdown
# Major Decisions

<!-- 重要な技術的意思決定を以下のフォーマットで記録 -->
<!--
## YYYY-MM-DD: タイトル
**Decision:** 何を決めたか
**Rationale:** なぜその選択か
**Alternatives considered:** 検討した代替案
**Status:** Active / Revisit / Superseded
-->
```

**AGENT_LEARNINGS.jsonl**（エピソード記憶 — 空ファイルで作成）:

```bash
touch .agent/memory/episodic/AGENT_LEARNINGS.jsonl
```

### Step 5: スキルレジストリの作成

**skills/\_index.md**:

```markdown
# Skill Registry

## skillforge

新しいスキルを観察されたパターンから生成する。
Triggers: "create skill", "new skill", "スキル作成"

## memory-manager

記憶の読み取り・スコアリング・圧縮を行う。
Triggers: "reflect", "振り返り", "メモリ圧縮", "what did I learn"

## git-proxy

安全制約付きの git 操作。
Triggers: "commit", "push", "branch", "merge"
Constraints: main への force push 禁止、push 前にテスト実行
```

**skills/\_manifest.jsonl**:

```
{"name":"skillforge","version":"2026-04-16","triggers":["create skill","new skill","スキル作成"],"tools":["bash"],"preconditions":[],"constraints":[],"category":"meta"}
{"name":"memory-manager","version":"2026-04-16","triggers":["reflect","振り返り","メモリ圧縮"],"tools":["bash"],"preconditions":["memory/episodic/AGENT_LEARNINGS.jsonl exists"],"constraints":["高サリエンスのエントリを削除しない","personal を semantic にマージしない"],"category":"meta"}
{"name":"git-proxy","version":"2026-04-16","triggers":["commit","push","branch","merge"],"tools":["bash"],"preconditions":["git repo initialized"],"constraints":["main への force push 禁止","push 前にテスト実行"],"category":"operations"}
```

### Step 6: permissions.md の作成

```markdown
# Permissions

## Always Allowed（承認不要）

- プロジェクトディレクトリ内のファイル読み取り
- テスト実行
- ブランチ作成
- memory/ および skills/ ディレクトリへの書き込み
- Draft PR の作成

## Requires Approval（承認が必要）

- PR のマージ
- 本番環境へのデプロイ
- memory/working/ 以外のファイル削除
- 新しい依存パッケージのインストール
- CI/CD 設定の変更

## Never Allowed（絶対禁止）

- main / production / staging への force push
- シークレットや認証情報への直接アクセス
- permissions.md の変更（人間のみが編集する）
```

### Step 7: on_failure.py フックの配置

```python
# .agent/hooks/on_failure.py
import json, datetime

EPISODIC_PATH = ".agent/memory/episodic/AGENT_LEARNINGS.jsonl"
FAILURE_THRESHOLD = 3

def on_failure(skill_name, action, error, context=""):
    entry = {
        "timestamp": datetime.datetime.now().isoformat(),
        "skill": skill_name,
        "action": action,
        "result": "failure",
        "detail": str(error)[:500],
        "pain_score": 8,
        "importance": 7,
        "reflection": f"FAILURE in {skill_name}: {type(error).__name__}: {str(error)[:200]}",
        "context": context[:300]
    }
    with open(EPISODIC_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")

    recent_failures = count_recent_failures(skill_name)
    if recent_failures >= FAILURE_THRESHOLD:
        entry["reflection"] += f" | THIS SKILL HAS FAILED {recent_failures} TIMES. Flag for rewrite."
        entry["pain_score"] = 10
    return entry

def count_recent_failures(skill_name, days=14):
    cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
    count = 0
    try:
        with open(EPISODIC_PATH) as f:
            for line in f:
                if not line.strip():
                    continue
                e = json.loads(line)
                if (e.get("skill") == skill_name
                    and e.get("result") == "failure"
                    and datetime.datetime.fromisoformat(e["timestamp"]) > cutoff):
                    count += 1
    except FileNotFoundError:
        pass
    return count
```

### Step 8: Dream Cycle の設定

```python
# .agent/memory/auto_dream.py
import json, os, datetime, subprocess
from collections import defaultdict

EPISODIC_PATH = "memory/episodic/AGENT_LEARNINGS.jsonl"
SEMANTIC_PATH = "memory/semantic/LESSONS.md"
ARCHIVE_DIR = "memory/episodic/snapshots"
DECAY_DAYS = 90
PROMOTION_THRESHOLD = 7.0

def salience_score(entry):
    age_days = (datetime.datetime.now()
                - datetime.datetime.fromisoformat(entry["timestamp"])).days
    pain = entry.get("pain_score", 5)
    importance = entry.get("importance", 5)
    recurrence = entry.get("recurrence_count", 1)
    return (10 - age_days * 0.3) * (pain / 10) * (importance / 10) * min(recurrence, 3)

def find_recurring_patterns(entries):
    patterns = defaultdict(list)
    for e in entries:
        key = f"{e.get('skill', 'general')}::{e.get('action', '')[:50]}"
        patterns[key].append(e)
    recurring = {}
    for key, group in patterns.items():
        if len(group) >= 2:
            best = max(group, key=lambda x: salience_score(x))
            best["recurrence_count"] = len(group)
            recurring[key] = best
    return recurring

def promote_to_semantic(high_salience_entries):
    if not high_salience_entries:
        return
    existing = ""
    if os.path.exists(SEMANTIC_PATH):
        existing = open(SEMANTIC_PATH).read()
    new_lessons = []
    for entry in high_salience_entries:
        lesson_line = f"- {entry.get('reflection', entry.get('action', 'unknown'))}"
        if lesson_line not in existing:
            new_lessons.append(lesson_line)
    if new_lessons:
        with open(SEMANTIC_PATH, "a") as f:
            f.write(f"\n## Auto-promoted {datetime.date.today().isoformat()}\n")
            for lesson in new_lessons:
                f.write(lesson + "\n")

def run_dream_cycle():
    entries = [json.loads(l) for l in open(EPISODIC_PATH) if l.strip()]
    if not entries:
        return
    recurring = find_recurring_patterns(entries)
    promotable = [e for e in recurring.values()
                  if salience_score(e) >= PROMOTION_THRESHOLD]
    promote_to_semantic(promotable)

    cutoff = datetime.datetime.now() - datetime.timedelta(days=DECAY_DAYS)
    kept, archived = [], []
    for e in entries:
        ts = datetime.datetime.fromisoformat(e["timestamp"])
        if ts < cutoff and salience_score(e) < 2.0:
            archived.append(e)
        else:
            kept.append(e)

    if archived:
        os.makedirs(ARCHIVE_DIR, exist_ok=True)
        archive_file = f"{ARCHIVE_DIR}/archive_{datetime.date.today()}.jsonl"
        with open(archive_file, "a") as f:
            for e in archived:
                f.write(json.dumps(e) + "\n")

    with open(EPISODIC_PATH, "w") as f:
        for e in kept:
            f.write(json.dumps(e) + "\n")

    workspace = "memory/working/WORKSPACE.md"
    if os.path.exists(workspace):
        age = datetime.datetime.now() - datetime.datetime.fromtimestamp(
            os.path.getmtime(workspace))
        if age.days >= 2:
            os.makedirs(ARCHIVE_DIR, exist_ok=True)
            stale_name = f"{ARCHIVE_DIR}/workspace_{datetime.date.today()}.md"
            os.rename(workspace, stale_name)

    subprocess.run(["git", "add", "memory/"])
    subprocess.run(["git", "commit", "-m",
                     f"dream cycle: promoted {len(promotable)}, "
                     f"decayed {len(archived)}, kept {len(kept)}"])

if __name__ == "__main__":
    run_dream_cycle()
```

cron 設定:

```bash
crontab -e
# 毎晩3時に実行
0 3 * * * cd /path/to/your/project && python .agent/memory/auto_dream.py >> .agent/memory/dream.log 2>&1
```

---

## 6. 既存の .claude/skills/ との共存方針

Naoya の既存の `.claude/skills/` 体系（YAML frontmatter、500行制限、`references/` サブディレクトリ）と Agentic Stack のスキルは **別レイヤーとして共存** させるのが現実的。

| 項目           | `.claude/skills/`                  | `.agent/skills/`                     |
| -------------- | ---------------------------------- | ------------------------------------- |
| 目的           | コーディング規約・レビュー基準     | エージェントの自律行動スキル          |
| 例             | React code review skill、DDD skill | skillforge、memory-manager、git-proxy |
| 更新者         | 人間が主導                         | エージェント自身が Self-Rewrite       |
| 参照タイミング | コード作成・レビュー時             | タスク実行ループの中                  |

**CLAUDE.md への記載例**:

```markdown
## Skill Sources

- `.claude/skills/`: コーディング規約・技術スキル（人間が管理）
- `.agent/skills/`: エージェント自律スキル（Self-Rewrite 対象）
- 両方を参照すること。コーディング時は `.claude/skills/` を優先。
```

---

## 7. 6つのフィードバックループ（なぜ複利で改善するか）

```
Memory → Skill Creation
  繰り返しパターンを検知 → skillforge が新スキル生成

Skill → Memory
  毎実行を post_execution でログ → episodic に蓄積

Skill → Protocol
  外部ツール呼び出し → pre_tool_call で権限チェック

Protocol → Skill
  型付きスキーマ → 正確な引数でスキル生成が容易に

Memory → Protocol
  過去の API 失敗記録 → 代替パスの優先

Protocol → Memory
  ツール出力・承認イベント → episodic にログ
```

このサイクルが自己強化的に回ることで、使えば使うほどエージェントが賢くなる。ただし、誤った教訓が増幅されるリスクもあるため、Dream Cycle の decay と Self-Rewrite Hook の保守的な更新ポリシーがブレーカーとして機能する。

---

## 8. 運用上の注意点

### コンテキスト予算の肥大化

スキルが30個を超えると、全ロードで90K+ トークンになりモデル精度が低下する。`_index.md` によるプログレッシブ・ディスクロージャーを必ず守ること。

### 古いスキルの放置

60日以上更新されていないスキルは内容が陳腐化している可能性がある。`_manifest.jsonl` の `version` フィールドで定期的にチェック。

### 安全でないスキルの合成

2つの安全なスキルが組み合わさると危険になるケース（例: auto-merge + auto-push = 意図しないデプロイ）。制約は個々のスキル内ではなく `pre_tool_call` フックに集約する。

### LESSONS.md の手動レビュー

完全自動化は危険。2〜3週間に一度は `LESSONS.md` を目視確認し、誤った教訓があれば `git revert` する。この部分だけは自動化しない。

### WORKSPACE.md の放置

タスク完了後にクリアしないと、次のセッションで「まだ作業中」と誤認する。Dream Cycle が2日経過で自動アーカイブするが、タスク完了スキルにリセットステップを入れるのがベター。

---

## 9. クイックスタート・チェックリスト

```
□ .agent/ ディレクトリ構造を作成
□ AGENTS.md を配置
□ CLAUDE.md に .agent/ への参照を追加
□ memory/ の4層初期ファイルを作成
□ PREFERENCES.md に自分のコーディング規約を記入
□ skills/_index.md と _manifest.jsonl を作成
□ protocols/permissions.md を作成
□ hooks/on_failure.py を配置
□ auto_dream.py を配置し cron 設定
□ git init && git add .agent/ && git commit -m "init agentic stack"
□ 1週間運用後、LESSONS.md の中身を確認
□ 3週間後、skillforge でスキル自動生成を試す
```

---

## 10. スキル記述のベストプラクティス（Bitter Lesson）

**悪い例（手順書型 = Driving Directions）**:

```markdown
1. npm test を実行
2. 出力から "passed" を grep
3. git add -A を実行
4. git commit -m "fix: ..." を実行
```

**良い例（目的地＋フェンス型 = Destinations + Fences）**:

```markdown
テストが全パスしていることを確認してからコミットする。
コミットメッセージは ACTIVE_PLAN.md のタスクIDを参照する。
以下は良いコミットの例: ...
以下は悪いコミットの例: ...
```

スキルには3つの要素だけを書く：

- **Procedures**: フェーズをスキップしないための骨格
- **Heuristics**: 分岐点でのデフォルト判断
- **Constraints**: 越えてはいけないフェンス

「どうやるか（How）」ではなく「良いものはどう見えるか（What good looks like）」を書く。モデルが進化すれば、同じスキルファイルからより良い出力が出る。
