# scripts

本地脚本目录，用于开发提效与质量守门。

## 建议脚本方向
- 配置校验（人物卡、事件卡、提示词模板）
- 数据清洗与迁移
- 本地联调启动（一次拉起依赖服务）

## 当前可用脚本
- `dev/start_gpt_sovits_api.ps1`：启动本地 GPT-SoVITS `api_v2.py`
- `dev/start_server.ps1`：启动后端 FastAPI 服务
- `dev/start_web.ps1`：启动 Web 前端开发环境
- `dev/run_local_stack.ps1`：打印本地联调推荐启动顺序
- `dev/set_gpt_sovits_weights.ps1`：切换 GPT-SoVITS 的 GPT / SoVITS 权重
- `dev/start_full_stack.py`：一键按顺序拉起 SenseVoice、GPT-SoVITS、切权重、Server、Web
- `validation/validate_configs.ps1`：校验人物卡 JSON + `configs/` 下 YAML
- `validation/optional_web_typecheck.ps1`：可选执行 Web TypeScript 类型检查（依赖缺失可跳过）

## 约定
- 脚本命名使用 `snake_case`，例如 `validate_persona_config.ps1`。
- 脚本必须支持失败返回非 0 退出码，便于后续接入 CI。
