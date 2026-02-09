# scripts

本地脚本目录，用于开发提效与质量守门。

## 建议脚本方向
- 配置校验（人物卡、事件卡、提示词模板）
- 数据清洗与迁移
- 本地联调启动（一次拉起依赖服务）

## 当前可用脚本
- `dev/start_gpt_sovits_api.ps1`：启动本地 GPT-SoVITS `api_v2.py`
- `validation/validate_configs.ps1`：校验人物卡 JSON

## 约定
- 脚本命名使用 `snake_case`，例如 `validate_persona_config.ps1`。
- 脚本必须支持失败返回非 0 退出码，便于后续接入 CI。
