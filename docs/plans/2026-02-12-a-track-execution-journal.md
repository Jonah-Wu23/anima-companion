# Implementation Plan. Task List and Thought in Chinese — 2026-02-12 A轨执行纪要

## 1. 记录范围
- 执行轨道：A 轨（主线）。
- 允许改动目录：`web/`、`docs/runbooks/release/`、`docs/plans/`。
- 本次目标：补齐状态映射文档、TTS 播放期口型能量驱动、开发期状态流转可观测性。

## 2. 已完成项
1. 发布清单补充状态映射附录：
- 文件：`docs/runbooks/release/release_checklist.md`
- 映射：`Idle -> idle`、`Listening -> recording`、`Thinking -> uploading|processing`、`Speaking -> speaking`、`Error -> error`。

2. TTS 播放阶段接入 WebAudio Analyser：
- 文件：`web/src/components/InputDock.tsx`
- 实现点：
  - TTS `audio.play()` 成功后启动 `AudioContext + AnalyserNode + RAF`。
  - 周期计算时域 RMS 能量，归一化后写入 `setLipSyncEnergy(0~1)`。
  - 在播放结束、播放失败、播放中断（切换新音频前 `pause`）、组件卸载、链路异常时统一清理并强制 `setLipSyncEnergy(0)`。
  - 清理覆盖：取消 RAF、断开 source/analyser、关闭 `AudioContext`，避免内存泄漏。

3. 开发环境最小状态流转日志：
- 文件：`web/src/lib/store/pipelineStore.ts`
- 实现点：
  - `setStage` 改为基于前态输出 dev-only 日志：`[pipeline] prev -> next`。
  - 不修改 `PipelineStage` 类型，保持现有状态枚举不变。

4. 3D 消费链路确认：
- `Viewport3D` 仍通过 `lipSyncEnergy` 驱动 speaking 态形变，无需改模型体系。

## 3. 风险与注意事项
- 浏览器自动播放策略仍可能拦截 `audio.play()`；当前策略为回落到 `idle` 并归零口型能量，避免残留状态。
- `createMediaElementSource` 对同一 `HTMLAudioElement` 只能创建一次；当前实现每次创建新 `Audio` 实例并在切换前清理，规避该问题。
- 不同设备音量基准不同，RMS 归一化系数可能需后续按真实听感微调。

## 4. 未覆盖项
- 未新增自动化测试（当前为实现与手工联调改动）。
- 未改动 `assets/` 与 `configs/motions/`（按限制保持不动）。
- 未扩展额外状态或重构 pipeline 架构（遵循 KISS，仅做最小可用改动）。
