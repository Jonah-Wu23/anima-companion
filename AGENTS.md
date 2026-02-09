# Repository Guidelines

## 协作语言与目标
- 默认使用中文沟通、文档与注释。
- 项目目标：实现安卓端二次元角色情感伴侣 App，核心闭环为“聊得像、说得像、动得像”。
- 当前已知资产：`Phainon_actor_card.json`（SillyTavern 人物卡），后续将接入 MMD 模型与 GPT-SoVITS。

## 项目结构与模块规划
当前仓库仍在起步阶段，建议按以下结构演进：
- `android/`：安卓客户端（UI、语音采集播放、3D 渲染容器）
- `server/`：后端服务（ASR、LLM、记忆系统、TTS 编排）
- `assets/`：模型、动作、贴图、音频样本
- `configs/`：人物卡映射、事件卡、系统提示词模板
- `tests/`：单元测试、接口联调脚本
- `docs/`：架构设计、阶段计划、接口文档

## 实施路线（必须按优先级推进）
### Phase 0：资产与管线打底
1. 完成 MMD 模型工程化与格式转换可行性验证。
2. 准备基础动作集（Idle/Listen/Think/Speak/Happy/Shy/Sad/Angry）。
3. 实现人物卡解析器（系统提示词、示例对话、禁区规则）。
4. 封装 GPT-SoVITS 统一推理接口（文本+情绪 -> 音频）。

### Phase 1：MVP 跑通（P0）
1. 跑通文本与按住说话语音链路（ASR -> LLM -> TTS）。
2. 上线 3D 常驻角色（至少含 Idle + Speak + 口型同步）。
3. 实现基础关系值、日常事件卡、可编辑记忆（偏好/雷点/重要人名）。
4. 提供隐私开关与数据清除能力。

### Phase 2-3：沉浸升级与运营工具（P1/P2）
- 免按键通话（VAD）、情绪语音与表情动作联动、触摸互动、换装与房间。
- 回忆相册、合影分享、礼物系统、剧情配置后台、对话崩坏诊断与 A/B 调参。

## 开发与验证命令
- `Get-Content -Raw .\Phainon_actor_card.json | ConvertFrom-Json > $null`：校验人物卡 JSON。
- `python -m json.tool .\Phainon_actor_card.json > $null`：可选 JSON 校验。
- 新增服务后，必须在各子项目补齐 `README` 的启动、测试、构建命令并保持可复制执行。

## 编码与提交流程
- 编码：UTF-8；JSON 使用 2 空格缩进；保留 `{{user}}`、`{{char}}` 占位符。
- 命名：配置与脚本优先 `snake_case`；Kotlin/Java 按平台惯例使用 `PascalCase` 类名。
- 提交信息：`type(scope): 摘要`，示例：`feat(dialogue): 接入人物卡提示词编排`。
- PR 必填：变更目的、影响范围、验证结果、风险与回滚方案；涉及 UI/3D 必附截图或录屏。

## 风险红线
- 人格一致性、语音延迟、隐私可控是上线前置条件，不满足不得发布。
- 禁止提交密钥、令牌、敏感语音原始数据；调试日志需脱敏。
