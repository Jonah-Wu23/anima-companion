# Repository Guidelines

## 协作语言与目标
- 默认使用中文沟通、文档与注释。
- 当前产品方向：Web/PWA 优先，快速迭代验证“文字对话 + 语音对话 + 3D 角色互动”。
- 平台策略：先网页验证体验，再评估是否投入原生移动端。

## 核心理念与原则
**简洁至上**：恪守KISS(Keep It Simple，Stupid)原则，崇尚简洁与可维护性，避免过度工程化与不必要的防御性设计。  
**深度分析**：立足于第一性原理(First Principles Thinking)剖析问题，并善用工具以提升效率。  
**事实为本**：以事实为最高准则。若有任何谬误，恳请坦率斧正，助我精进。

## 开发工作流
**渐进式开发**：通过多轮对话迭代，明确并实现需求。在着手任何设计或编码工作前，必须完成前期调研并厘清所有疑点。  
**结构化流程**：严格遵循“构思方案 → 提请审核 → 分解为具体任务”的作业顺序。

## 输出规范
**固定指令**:`Implementation Plan. Task List and Thought in Chinese`  
**终端语法**: 使用PowerShell语法而不是CMD语法。

## 项目结构（Web 架构）
- `web/`：前端应用（Next.js/React + WebGL）
- `server/`：后端服务（ASR、LLM、记忆、GPT-SoVITS 代理）
- `configs/`：人物卡映射、事件配置、提示词模板
- `assets/`：模型、动作、贴图、音频资产
- `docs/`：架构、计划、接口与运维文档
- `scripts/`：本地开发、启动与校验脚本

## MVP 路线（Web 优先）
1. 跑通文本对话与人格一致性。
2. 跑通 Web 语音链路（录音 -> ASR -> LLM -> TTS）。
3. 接入 Web 3D 角色基础状态（Idle/Speak + 口型）。
4. 完成关系值、事件卡、记忆管理与隐私开关。

## 编码与提交流程
- 编码：UTF-8；JSON/YAML 统一 2 空格缩进；保留 `{{user}}`、`{{char}}` 占位符。
- 命名：配置与脚本优先 `snake_case`；TypeScript 文件优先 `kebab-case` 或 `PascalCase`（组件）。
- 提交格式：`type(scope): 摘要`，示例：`feat(web-chat): add streaming message panel`。
- PR 必填：变更目的、影响范围、验证结果、风险与回滚方案。

## 风险红线
- 人格一致性、语音延迟、隐私可控是上线前置条件，不满足不得发布。
- 禁止提交密钥、令牌、敏感语音原始数据；日志必须脱敏。
