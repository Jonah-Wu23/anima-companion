# Implementation Plan. Task List and Thought in Chinese — 2026-02-12 双 Subagent 并行执行纪要

## 1. 执行范围
- 执行模式：A 轨主线 + B 轨资产准备并行。
- A 轨范围：`web/`、`docs/runbooks/release/`、`docs/plans/`。
- B 轨范围：`assets/motions/`、`configs/motions/`、`docs/assets/`。
- Coordinator 收尾：冲突检查、`.gitignore` 风险处理、自动化检查、手工 smoke 建议。

## 2. 完成度
1. A 轨完成（100%）
- 发布检查清单补充状态映射表。
- `InputDock` 接入 TTS 播放期 `WebAudio Analyser`，将能量写入 `setLipSyncEnergy(0~1)`。
- 播放结束/失败/中断与组件卸载时统一归零口型能量并清理资源。
- `pipelineStore` 增加 dev-only 状态流转日志，便于链路回放。
- 补充竞态修正：新一轮文本/录音请求发起前，先中断旧播放，避免旧 `onended` 覆盖新阶段。

2. B 轨完成（100%）
- 创建并填充目录：`assets/motions/phainon/raw`。
- 全量解压 `docs/mmd_download/*.zip` 到 `raw/<zip同名目录>/`，保留原始压缩包。
- 生成资产台账：`docs/assets/mmd-motion-registry.md`（含 `asset_id`、来源、路径、格式、预分类、骨骼要求、风险、限制、校验日期、zip 级 SHA256）。
- 生成状态映射清单：`configs/motions/phainon-motion-manifest.yaml`（每状态至少 1 候选，含 `priority`/`fallback`）。
- 合规策略落地：`ミニモーション集.zip` 相关条目标记 `high`，并提供替代候选。

3. Coordinator 完成（100%）
- 更新 `.gitignore` 忽略 `assets/motions/phainon/raw/`，防止误提交大体积解压资产。
- 产物可提交面维持为文档与配置文件（registry + manifest）。

## 3. 阻塞项与处理
- 阻塞：部分日文文件名在控制台显示存在编码异常。
- 处理：按磁盘真实路径落盘并在 registry 记录异常说明，不阻塞追溯性与后续接入。

## 4. 验收与门禁结论
- 代码与文档层面：已达到本轮“准备态 + P0 可验收”目标。
- 自动化门禁：以本次执行结论为准，需在当前工作区再次执行：
  - `npm run lint --workspace web`
  - `npm run typecheck --workspace web`
  - `python -m pytest tests/unit -q`
- 手工 smoke：建议按发布清单覆盖文本 5 轮、语音 5 轮、TTS 异常恢复、快速连续语音与口型归零。

## 5. 下步建议
1. 将 manifest 接入运行时动作选择器（仅接低/中风险条目，高风险默认屏蔽）。
2. 新增一条开发态可视化调试信息：实时显示 `stage + lipSyncEnergy`，便于回归。
3. 对 B 轨中异常文件名条目进行人工重命名映射（保留 registry 原始路径字段），降低后续脚本接入成本。
