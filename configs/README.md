# configs

项目配置中心，目标是“内容与参数可配置化”，减少硬编码。

## 子目录说明
- `persona/`：人物卡映射、系统提示词组装规则
- `events/`：日常事件与剧情事件配置
- `prompts/`：对话模板、风格模板、安全模板
- `environments/`：多环境参数（dev/staging/prod）

## 约定
- 配置文件优先 `yaml/json`。
- 每个配置都要带示例值与字段注释。
- 变更配置时同步更新 `docs/api/` 或 `docs/runbooks/` 中的说明。
