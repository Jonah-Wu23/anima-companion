# 白厄 陪伴助手

安卓端二次元角色情感陪伴项目，目标是整合 `SillyTavern` 人物卡、`GPT-SoVITS` 语音与 3D 模型互动能力。

## 目录总览
```text
android/            # 安卓客户端
server/             # 后端服务（ASR/LLM/TTS/记忆）
configs/            # 可配置内容（人物卡映射、事件、提示词）
assets/             # 模型/动作/贴图/音频等资源
tests/              # 跨模块测试与测试数据
docs/               # 架构、计划、ADR、API、运维文档
scripts/            # 本地开发与验证脚本
.github/            # CI 工作流与协作模板
```

## 协作约定（简版）
- 新增能力前先在 `docs/plans/` 写最小方案。
- 关键架构决策记录到 `docs/adr/`。
- 业务规则优先配置化，落在 `configs/`，避免硬编码。
- 每个顶层目录维护自己的 `README.md`，说明边界与入口命令。
