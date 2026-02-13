# Implementation Plan. Task List and Thought in Chinese — 2026-02-12 P1 前端 UI + 3D 收尾纪要

## 1. 收尾范围
- 对应计划：`docs/plans/2026-02-12-p1-frontend-ui-3d-plan.md`
- 收尾目标：
1. 固化 P1 实际交付内容与质量门禁结果。
2. 明确 P0 主链路（文本/语音）未回归。
3. 检查 `scripts/dev/start_full_stack.py` 当前是否可继续用于本地联调。

## 2. P1 交付结论
- 结论：P1 工程收尾完成，可进入下一阶段（P2）。
- 关键达成：
1. UI 视觉体系已切换至 Sunshine/Clear Sky 主线（玻璃拟态 + 晴空配色 + 圆润交互）。
2. 页面布局完成移动端沉浸式与桌面端双栏模式统一。
3. 3D 场景已从 `Environment preset="city"` 切换到 `sunset`，并保留 stage/lipSync 响应。
4. 质量门禁通过（`typecheck`/`lint`/`build`）。

## 3. 已完成任务清单（按计划阶段）

### A. 设计基建
1. `globals.css` 完成主题 Token、玻璃参数、动画与 `prefers-reduced-motion` 降级。
2. UI 原子组件补齐：`Avatar`、`Badge`、`Switch`、`Sheet`，并扩展 `Button`/`Input`。

### B. 核心界面
1. `TopBar` 抽离并按设计规格实现（语义化 `<header>`、在线状态、响应式尺寸）。
2. `MessagePanel` 完成头像/情绪徽章/时间戳与打字态视觉升级。
3. `InputDock` 修复布局覆盖问题（取消 fixed），并保留现有文本/语音交互逻辑。
4. `SettingsSheet` 统一为晴空色系，避免冷紫偏离主题。

### C. 3D 场景
1. `Viewport3D` 完成基础灯光、雾化、占位体材质升级与 stage 状态映射。
2. `avatarStore` 建立并接入场景状态。

### D. 收尾体验
1. `LoadingScreen` 已接入首屏过渡。
2. 响应式结构已落地（移动端单列 + 桌面端双栏）。

## 4. 回归与稳定性结论（P0 主链路）

### 4.1 文本链路（未破坏）
1. `InputDock.handleSendText` 仍调用 `api.chatText`。
2. 消息入库路径（`addMessage`）保持原语义。

### 4.2 语音链路（未破坏）
1. 录音转换与上传仍走 `api.chatVoice`。
2. TTS 播放后仍驱动 `lipSyncEnergy`，播放结束/异常有归零清理。

### 4.3 3D 响应链路（未破坏）
1. `pipelineStore.stage` 与 `lipSyncEnergy` 仍参与占位体动画与颜色反馈。

## 5. 质量门禁记录
- 执行日期：2026-02-12
- 结果：
1. `npm --workspace web run typecheck`：通过
2. `npm --workspace web run lint`：通过（0 error / 0 warning）
3. `npm --workspace web run build`：通过

说明：`build` 在沙箱环境下首次触发 `spawn EPERM`，提权重试后稳定通过，属于执行环境限制，不是项目代码故障。

## 6. `start_full_stack.py` 可用性检查

### 6.1 检查命令
1. `python scripts/dev/start_full_stack.py --help`
2. `python scripts/dev/start_full_stack.py --dry-run --skip-weights`
3. `python -m compileall scripts/dev/start_full_stack.py`

### 6.2 结果
1. 参数解析正常（帮助信息输出完整）。
2. `dry-run` 可正确生成并打印 4 条启动命令（SenseVoice/GPT-SoVITS/Server/Web）。
3. 语法编译通过。
4. 依赖脚本存在：`start_sensevoice_api.ps1`、`start_gpt_sovits_api.ps1`、`set_gpt_sovits_weights.ps1`、`start_server.ps1`、`start_web.ps1`。

### 6.3 结论
- `scripts/dev/start_full_stack.py` 当前可继续使用。
- 建议实际联调启动命令：
`python scripts/dev/start_full_stack.py`

## 7. 风险与后续建议
1. LCP 与真机响应式（多端尺寸）建议在 P2 启动前做一次集中基准测试并固化到 release checklist。
2. 若后续接入 MMD 重模型，需补充性能降级开关与设备分层策略（低端机 fallback 到占位体）。

## 8. 收尾判定
- 判定：P1 收尾完成。
- 建议状态：`Closed`（进入 P2 实施）。

## 9. 2026-02-13 补充更新（联调基线）
1. `scripts/dev/start_full_stack.py` 已收敛为固定后端端口 `18000`。
2. Web 启动时注入的 API 基地址已固定为 `http://127.0.0.1:18000`，避免误连旧 `8000` 实例。
3. LLM 端点已固定为 `/v1/chat/completions`，不再走 `/messages`。
4. 角色输出长度上限已统一为“所有角色 50 字符”（不再仅对白厄放宽）。
5. 语音文本提取增加容错与降级：无 `<speak>` 或异常标签时可回退到可读台词，避免整条语音链路失败。
6. 新增 Kimi 诊断脚本：`scripts/dev/test_kimi_llm_pipeline.py`，用于核对请求 payload 与返回抽取解析。

### 9.1 当前联调建议命令
1. `python scripts/dev/start_full_stack.py`
2. `python scripts/dev/test_kimi_llm_pipeline.py --persona-id phainon --user-text "你好" --base-url "https://api.moonshot.cn" --model "kimi-k2.5"`
