# 外部参考資料

本プロジェクトで参照する外部リソースと、活用タイミングの対応表。

---

## Strands Agents + Amazon Bedrock AgentCore

Plan 03 (AWS bootstrap) および Plan 06 (Strands Agents + AgentCore deploy) で使用する。

| 資料                                                                                                                                                                         | 概要                                                                                                                   | 活用タイミング                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [AWS Blog: AI Agents best practices with AgentCore](https://aws.amazon.com/jp/blogs/machine-learning/ai-agents-in-enterprises-best-practices-with-amazon-bedrock-agentcore/) | AgentCore の企業向けベストプラクティス。Runtime / Memory / Identity / Gateway / Observability / Evaluations の設計指針 | Plan 06: Strands 設計・デプロイ時                 |
| [fullstack-solution-template-for-agentcore (GitHub)](https://github.com/awslabs/fullstack-solution-template-for-agentcore)                                                   | AWS 公式のフルスタック参考実装テンプレート。IaC 構成・ディレクトリ構造・CI/CD パターンの参考                           | Plan 03: IaC 選定時 / Plan 06: プロジェクト構成時 |
| [Strands Agents 解説 (Qiita @nasuvitz)](https://qiita.com/nasuvitz/items/d7daf916d2b3a47c1e87)                                                                               | Strands Agents の日本語入門。@tool デコレータ・Agent クラス・会話ループの基本構造                                      | Plan 06: Strands 実装の学習参照                   |
| [AgentCore 追加解説 (Qiita @Kumoai)](https://qiita.com/Kumoai/items/dd55ce73a01926b7b820)                                                                                    | AgentCore の Memory / Gateway / Identity の具体的な使い方                                                              | Plan 06: AgentCore 各コンポーネント設定時         |
| [Personal AI Agent with Strands x AgentCore (SpeakerDeck)](https://speakerdeck.com/yokomachi/building-a-personal-ai-agent-with-strands-agents-x-amazon-bedrock-agentcore-jp) | **本プロジェクトと直接重なるユースケース**。パーソナル AI エージェントを Strands + AgentCore で構築する発表資料        | Plan 06: 設計開始時に**最初に読む**資料           |

### 特に重要な資料

- **fullstack-solution-template-for-agentcore**: Plan 03 で AWS インフラを bootstrap する前にこのテンプレートのディレクトリ構成・CDK/SAM 選択・Lambda tool 配置パターンを確認する。設計決定書 Section 2.1 の Hybrid アーキテクチャと照合し、不要な部分は削ぎ落として適用する
- **SpeakerDeck 発表資料**: Plan 06 の計画書を書く前に全スライドを通読する。「パーソナル AI エージェント × Strands × AgentCore」の構成が本プロジェクトの skill-stack.md / architecture.md と合致するか検証し、差分があれば設計決定書を更新する
