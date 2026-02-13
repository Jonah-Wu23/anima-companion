# Implementation Plan. Task List and Thought in Chinese — 2026-02-10 P0 MVP 阶段执行纪要

## 1. 记录范围与背景
- 起点指令：基于 `docs/plans/2026-02-09-p0-mvp-web-subagents-plan.md`，先不执行前端实现，其它方向先执行；同时为前端 subagent 产出开发文档。
- 终点：本次会话最新状态（已完成 GPT-SoVITS 路径根因修复、角色卡接入、语音链路稳定化、参考音频归档与参数落地）。
- 说明：本仓库在此期间存在多来源改动（含其他 AI/人工变更）。本文聚焦“本轮协作中已执行并确认”的工作事实。（在此期间，其他AI扮演了前端agent按照前端开发文档完成了初步开发）

## 2. 总体执行摘要
- 已完成“前端 subagent 文档化输出”：`docs/plans/2026-02-09-p0-frontend-development-spec.md`。
- 已完成非前端优先事项：后端接口、语音链路、配置体系、本地启动脚本、文档与校验链路持续修复。
- 对前端侧仅执行“必要故障修复与联调支持”，未做超范围重构。
- 当前主链路状态：文本可用、语音链路可跑通、TTS 占位路径根因已消除、人设注入已接入角色卡。

## 3. 阶段时间线（按问题驱动）

### 3.1 启动脚本与本地联调修复
1. 修复 PowerShell 脚本语法与参数冲突。
2. 修复 Web 启动脚本端口参数问题，避免 `next dev -p 3000 3001` 误传参。
3. 增强端口占用报错可读性（给出 PID 与替代端口命令）。

关键文件：
- `scripts/dev/start_gpt_sovits_api.ps1`
- `scripts/dev/start_server.ps1`
- `scripts/dev/start_web.ps1`
- `scripts/dev/start_sensevoice_api.ps1`

### 3.2 前端运行时崩溃修复（React / R3F 版本矩阵）
1. 针对 `ReactCurrentOwner` 报错，完成 Next/React/@react-three 版本对齐。
2. 处理编译缓存影响（`.next` 清理后回归）。
3. 前端依赖树恢复到可运行状态。

关键结果：
- `npm ls react react-dom @react-three/fiber @react-three/drei --workspace web` 不再出现冲突错误。

### 3.3 语音链路稳定化（录音、ASR、错误透传）
1. 前端录音改造：将录音转为 `16k PCM WAV` 上传，补齐空录音/短录音保护。
2. 服务端 ASR 返回解析增强：兼容多层字段结构，避免“200 但无文本”。
3. 服务端 `/v1/chat/voice` 优化：TTS 失败时降级返回文本，不阻断整链路。
4. 前端错误提示改造：优先显示后端 `detail`，减少“泛化错误文案”。

关键文件：
- `web/src/components/InputDock.tsx`
- `server/app/services/asr/sensevoice_client.py`
- `server/app/api/v1/endpoints/chat.py`
- `server/app/services/dialogue/chat_service.py`

### 3.4 角色扮演一致性修复（接入角色卡）
根因：
- LLM system prompt 原先为硬编码模板，未读取 `Phainon_actor_card.json`。
- 前端 `persona_id` 曾硬编码为 `bai-e`，与现有配置 `phainon` 脱节。

修复：
1. 新增 persona loader，从 `configs/persona/*.yaml` 映射并加载角色卡。
2. 在 LLM client 构建 system prompt 时注入角色卡核心字段。
3. 前端默认 persona 改为环境变量可配，默认 `phainon`。

关键文件：
- `server/app/services/dialogue/persona_loader.py`
- `server/app/services/dialogue/gptsapi_anthropic_client.py`
- `web/src/components/InputDock.tsx`
- `configs/persona/phainon.persona.yaml`

### 3.5 GPT-SoVITS 占位路径根因修复（`path/to/ref.wav not exists`）
根因：
- `server/.env` 中 `GPT_SOVITS_DEFAULT_REF_AUDIO_PATH=path/to/ref.wav` 为占位值，被带入 `/tts` 导致 400。

修复：
1. 在后端构建 TTS payload 时过滤占位路径（含引号/斜杠变体）。
2. 在 TTS 客户端增加兜底：`/tts` 因路径问题失败时自动回退 `/tts_to_audio/`。
3. 扩展可配置推理参数：切分、batch、语速、采样参数、并行/分桶、随机种子、副参考音频列表。

关键文件：
- `server/app/services/dialogue/chat_service.py`
- `server/app/services/tts/gpt_sovits_client.py`
- `server/app/core/settings.py`
- `server/.env`
- `server/.env.example`

## 4. 资产与配置治理

### 4.1 参考音频归档（便于维护）
已将三条参考音频从仓库根目录迁移到：
- `assets/audio/references/phainon/happy`

对应文件：
- `assets/audio/references/phainon/happy/【开心_happy】仪式开始前的这段时间尽可自由支配，好好休息吧。我也要花些时间整理思绪，回头见了，朋友们。.wav`
- `assets/audio/references/phainon/happy/【开心_happy】…不过，一直讨论这么苦大仇深的话题也属实扫兴。好像还是我起的头，真难为情。.wav`
- `assets/audio/references/phainon/happy/【开心_happy】趁着天色正好，两位不如多走走看看吧。不打扰你们，回头见了。.wav`

### 4.2 已写入服务端 `.env` 的关键 TTS 参数
- 主参考音频与副参考音频路径已更新为 `assets/audio/references/phainon/happy` 下文件。
- `GPT_SOVITS_TEXT_SPLIT_METHOD=cut1`（“凑四句一切”）。
- `GPT_SOVITS_BATCH_SIZE=20`
- `GPT_SOVITS_FRAGMENT_INTERVAL=0.3`
- `GPT_SOVITS_SPEED_FACTOR=0.85`
- `GPT_SOVITS_TOP_K=5`
- `GPT_SOVITS_TOP_P=1`
- `GPT_SOVITS_TEMPERATURE=1`
- `GPT_SOVITS_REPETITION_PENALTY=1.35`
- `GPT_SOVITS_PARALLEL_INFER=true`
- `GPT_SOVITS_SPLIT_BUCKET=true`
- `GPT_SOVITS_SEED=-1`

## 5. 工具与脚本补充
- 新增权重切换脚本：
  - `scripts/dev/set_gpt_sovits_weights.ps1`
  - 默认切换到：
    - GPT：`GPT_weights_v4/白厄3.3-e15.ckpt`
    - SoVITS：`SoVITS_weights_v4/白厄3.3_e12_s18300_l32.pth`
- 更新本地联调顺序脚本与脚本文档：
  - `scripts/dev/run_local_stack.ps1`
  - `scripts/README.md`

## 6. 验证记录（本轮执行）
- 前端：
  - `npm run typecheck` 通过
  - `npm run lint` 通过
- 后端：
  - `python -m pytest tests/unit -q` 通过（3 passed）
  - `python -m compileall app` 通过
- 配置读取校验：
  - 在显式加载 `.env` 后，TTS 参数已按目标生效（`cut1 / batch=20 / speed=0.85 / aux_ref_audio_paths=2`）。

## 7. 当前状态结论
- 文本对话：可用。
- 语音对话：主链路可跑通，且 TTS 路径异常已有回退与可观测错误。
- 角色扮演：已由“硬编码 system prompt”升级为“可读取角色卡并注入”。
- 资产管理：参考音频已归档，后续迭代可直接基于 `assets/audio/references/phainon/happy` 管理。

## 8. 建议的后续收尾（下一阶段）
1. 增加 `POST /v1/chat/voice` 的集成测试（覆盖 `/tts` 失败回退 `/tts_to_audio/`）。
2. 为 persona loader 增加单测（`id/alias/source_card` 映射与容错）。
3. 在 `docs/runbooks/local/` 补一页“语音链路故障排查速查表”（ASR/LLM/TTS 三段）。

