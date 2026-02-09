# 白厄 陪伴助手

Web/PWA 优先的二次元角色情感陪伴项目，目标是整合 `SillyTavern` 人物卡、`GPT-SoVITS` 语音与 3D 模型互动能力。

## 目录总览
```text
web/                # Web/PWA 客户端（Next.js）
server/             # 后端服务（ASR/LLM/TTS/记忆）
configs/            # 可配置内容（人物卡映射、事件、提示词）
assets/             # 模型/动作/贴图/音频等资源
tests/              # 跨模块测试与测试数据
docs/               # 架构、计划、ADR、API、运维文档
scripts/            # 本地开发与验证脚本
.github/            # CI 工作流与协作模板
legacy/android/     # 历史安卓骨架（已归档）
```

## 协作约定（简版）
- 新增能力前先在 `docs/plans/` 写最小方案。
- 关键架构决策记录到 `docs/adr/`。
- 业务规则优先配置化，落在 `configs/`，避免硬编码。
- 每个顶层目录维护自己的 `README.md`，说明边界与入口命令。

## 本地维护命令
- `pwsh ./scripts/validation/validate_configs.ps1`：校验关键配置与人物卡 JSON。
- `pwsh ./scripts/bootstrap/init_workspace.ps1`：初始化工作区（骨架阶段占位）。
- `pwsh ./scripts/dev/start_gpt_sovits_api.ps1`：启动本地 GPT-SoVITS API（api_v2）。
- `pwsh ./scripts/dev/run_local_stack.ps1`：查看本地联调启动顺序。
- `pwsh ./scripts/dev/start_web.ps1`：启动 Web 前端开发服务。
