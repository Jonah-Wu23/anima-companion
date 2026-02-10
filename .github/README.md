# .github

CI 与协作模板目录。

## 后续建议
- `workflows/ci.yml`：基础检查（配置校验、测试、lint）。
- `pull_request_template.md`：强制提交验证信息（变更点、风险、回滚方案）。

## 当前 CI（`workflows/ci.yml`）
- 执行 `scripts/validation/validate_configs.ps1`（人物卡 JSON + `configs/` YAML）。
- 执行 `scripts/validation/optional_web_typecheck.ps1`（可选，依赖缺失或安装失败时自动跳过）。
