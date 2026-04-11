# Project-Specific Principles

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

- Claude Code の command / agent を追加・更新するときは、`.claude/contracts/README.md` を参照し、artifact 契約を明記すること
- `/bug-review` と `/synth` は run metadata を `.claude/runs/` に保存する。新しい workflow も同じ構造に揃えること
- validator がある workflow では、artifact 生成後に validator を通すまで完了扱いにしないこと
- workflow ごとの中間成果物は、固定パスが必要なケースを除き run directory の `artifacts/` に閉じ込めること
