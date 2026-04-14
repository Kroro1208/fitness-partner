# Project-Specific Principles

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Harnessing Claude's Intelligence（2026-04-13）

- Anthropic blog "Harnessing Claude's intelligence"（2026-04-02）の原則をこの repo の標準運用とする
- **Claude に既に得意な汎用ツールを使わせる**。`Bash` / editor / file read を中心にし、モデル能力の不足を補うためだけの専用 command・hook・wrapper を増やさない
- 新しい harness ルールや workflow を足す前に、必ず **「何をやめられるか」** を先に検討する。古い前提に基づく hard-coded filter、context reset、過剰な system 指示は削除候補として扱う
- **タスク固有の文脈は progressive disclosure で扱う**。常時プリロードするのは安定した原則・索引だけに留め、詳細は `.claude/rules/`、`.claude/skills/`、実ファイルを必要時に読みに行く
- **長時間タスクの記憶は `tasks/memories/` に要約して残す**。逐語ログは残さず、再利用価値の高い決定・前提・ユーザー嗜好だけを書く
- **専用の境界は security / UX / observability のためにだけ作る**。外部 API 呼び出し、破壊的変更、ユーザー確認が必要な操作、監査対象の操作のみ dedicated hook / tool / command に昇格させる
- モデル切り替えやツール追加はキャッシュ効率を壊すため、同一 workflow 内で頻繁に変えない。軽量化が必要なら別 agent / subagent に分離する

## セキュリティ（必須）

- 本番環境のクレデンシャルをソースコードに含めない
- 本番DBへの直接操作を行わない
- 外部APIキーをログに出力しない
- セキュリティに関わる作業は `.claude/skills/` 配下のスキルを必ず参照すること
- このリポジトリで Claude Code を使うときは **sandbox 有効を標準運用**とし、無効化したまま作業を開始しない
- sandbox 無効での実行は、sandbox では成立しない作業があり、かつユーザーが明示的に承認した場合だけ許可する
- `.env`、OAuth、DB 接続、依存追加、外部コード実行、長時間の自律実行は sandbox 前提で扱う

<important if="you are reviewing code or creating a PR">
- `.claude/skills/security-review.md` を参照し、全チェック項目を通過させること
- 攻撃チェーン、実悪用可能性、再現可能な exploitability の確認が必要な場合は `.claude/skills/pentest-review/SKILL.md` を追加で参照すること
- 秘密情報のハードコードを検知した場合は [CRITICAL] として即時指摘すること
</important>

<important if="you are creating a new repository, initializing a project, or configuring CI/CD">
- `.claude/skills/security-setup.md` を参照し、GitHub Settings・`.gitignore`・環境変数設計を確認すること
</important>

<important if="you are implementing API integrations, authentication, or handling secrets, tokens, or credentials">
- `.claude/skills/credential-guard.md` を参照すること。秘密情報は環境変数または Secrets Manager 経由で注入し、ソースコードに直書きしない
</important>

<important if="you are responding to a security incident, data breach, or credential leak">
- `.claude/skills/incident-report.md` を参照し、エスカレーション基準に従って報告を促すこと
- 初動対応（キー無効化等）を最優先すること
</important>

<important if="you are adding, updating, or removing dependencies or packages">
- `.claude/skills/security-review.md` の「依存ライブラリ」セクションを参照し、既知脆弱性と不要な依存を確認すること
</important>

<important if="you are writing documentation, README, proposals, or any content for external sharing">
- `.claude/skills/doc-guardrail.md` を参照し、個人情報・社内情報・技術情報の漏洩がないか確認すること
</important>

---

# Task Management

1. **Plan First** — `tasks/todo.md` にチェック可能な項目で計画を書く
2. **Verify Plan** — 実装前に計画を確認する
3. **Track Progress** — 完了したら即座にマークする
4. **Explain Changes** — 各ステップで高レベルのサマリーを提供する
5. **Document Results** — `tasks/todo.md` にレビューセクションを追加する
6. **Capture Lessons** — 修正を受けたら `tasks/lessons.md` を更新する

---

### Rules

1. **Never make the user run scans. Run them yourself.**
2. Fix all violations yourself. Re-scan after fixing to confirm zero violations.
3. Only report to the user after confirming zero violations.
4. **Never falsify scan results. Report violations honestly.**
5. "Knowing the rules" is not enough. Follow them at the moment of writing code.

---

## Claude Harness Rules

- `.claude/rules/harnessing-claude-intelligence.md` を、harness を追加・簡素化・分割するときの上位原則として参照すること
- Claude Code の command / agent を追加・更新するときは、`.claude/contracts/README.md` を参照し、artifact 契約を明記すること
- `/bug-review` と `/synth` は run metadata を `.claude/runs/` に保存する。新しい workflow も同じ構造に揃えること
- validator がある workflow では、artifact 生成後に validator を通すまで完了扱いにしないこと
- workflow ごとの中間成果物は、固定パスが必要なケースを除き run directory の `artifacts/` に閉じ込めること
