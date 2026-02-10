# Implementation Plan. Task List and Thought in Chinese — P0 实现状态（截至 2026-02-10）

## 1. 本次确认结论
根据当前联调结果，以下两项 **已完成并确认可用**：

1. 跑通文本对话与人格一致性。  
2. 跑通 Web 语音链路：录音 → ASR（SenseVoice）→ LLM → TTS（GPT-SoVITS）。

说明：
- 语音链路已完成主通路打通（ASR/LLM/TTS 串联）；
- GPT-SoVITS 权重切换脚本可正常执行；
- 关键占位路径问题（`path/to/ref.wav not exists`）已修复并有兜底策略。

## 2. P0 四大目标当前状态

### 2.1 已完成
- 文本对话与人格一致性：**完成**
- Web 语音链路（录音→ASR→LLM→TTS）：**完成**

### 2.2 需继续收尾
- Web 3D 角色基础状态（Idle/Speak + 口型占位）：**待做最终验收**
- 关系值、事件卡、记忆管理、隐私开关：**待做最终验收与补齐**

## 3. 当前可运行启动链路（已验证）
1. `pwsh .\scripts\dev\start_sensevoice_api.ps1 -Root "E:\AI\VTT\SenseVoice" -Device "cuda:0"`
2. `pwsh .\scripts\dev\start_gpt_sovits_api.ps1`
3. `pwsh .\scripts\dev\set_gpt_sovits_weights.ps1`
4. `pwsh .\scripts\dev\start_server.ps1`
5. `pwsh .\scripts\dev\start_web.ps1 -Port 3001`

## 4. 下一步应该做什么（按优先级）

1. 完成 P0 最终验收清单（建议一次性跑通）  
   - 文本/语音主流程各至少 5 轮；  
   - 语音失败降级是否可见、可重试；  
   - 人设稳定性抽检（不同话题下角色一致性）。

2. 补齐并验收 3D 基础状态  
   - 明确 `Idle / Listening / Thinking / Speaking / Error` 状态切换；  
   - 播放 TTS 时口型/能量占位联动可观察；  
   - 移动端性能不低于 P0 基线（可先做中端机抽测）。

3. 验收“关系值 + 事件卡 + 记忆 + 隐私”  
   - 关系值随对话变化可追踪；  
   - 事件卡按策略注入；  
   - 记忆写入与读取可验证；  
   - 隐私开关与 `POST /v1/user/clear` 清除路径完整（前端+服务端）。

4. 固化发布前文档与 smoke 流程  
   - 更新 `docs/runbooks/local/` 本地联调步骤；  
   - 更新 `docs/runbooks/release/smoke_checklist.md` 并按清单回归一次；  
   - 将本轮关键配置（TTS 参考音频、切分参数、权重）写入可复用模板。

## 5. 阶段目标（下一里程碑）
在保持现有文本/语音稳定的前提下，完成上述第 2、3 项验收，达到 P0 全量可验收状态（不仅“可跑”，而是“可交付演示”）。

