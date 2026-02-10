# Implementation Plan. Task List and Thought in Chinese — Web/PWA P0 MVP（Subagents 并行不打架）

## 0. 摘要（目标与验收）
目标：在 **Web/PWA** 上跑通 P0 闭环：**文本对话 + 按住说话语音对话（SenseVoice ASR -> Claude Sonnet 4.5 LLM -> GPT-SoVITS TTS）+ 3D 占位互动（状态机 + 说话口型占位）+ 关系值/事件卡 + 可编辑记忆 + 隐私清除**。

验收标准（P0）：
- Web 端可用：文本对话稳定；按住说话能出“转写文本 + 角色回复 + 语音播放”。
- 语音链路可控：错误可见（ASR/LLM/TTS 分段报错），可重试，不死锁。
- 数据可控：一键清除本地与服务端会话数据；默认不保存原始录音（可开关）。
- 3D：先占位（Three.js 场景 + Idle/Listening/Speaking 状态切换 + 播放音频时口型/能量驱动占位）。

## 1. 已锁定技术选型（事实与约束）
- LLM：`https://api.gptsapi.net`，走 **Anthropic Messages** 风格 `POST /v1/messages`。
  - 模型：`claude-sonnet-4-5-20250929`
  - 鉴权：HTTP Header `Authorization: Bearer <API_KEY>`（也兼容 `x-api-key`，但默认用 Authorization）
- ASR：本地 **SenseVoice**（目录 `E:\AI\VTT\SenseVoice`）。
  - 优先作为独立 FastAPI 服务启动，并由本项目服务端转发调用。
  - 核心接口：`POST /api/v1/asr`
- TTS：本地 **GPT-SoVITS api_v2.py**（目录 `E:\AI\GPT-SoVITS-v4-20250422fix`）。
  - 本项目服务端已有 `/v1/tts/synthesize` 代理封装。
- 语音交互：P0 采用 **按住说话**。
- 3D：P0 **占位 3D**（先不强行上线 MMD 真实模型）。

## 2. 关键公共接口（先定契约，避免打架）
服务端（FastAPI）对 Web 暴露以下最小接口（其余后延）：
1. `GET /healthz`：健康检查。
2. `POST /v1/chat/text`：文本对话
   - 请求：`{ session_id, persona_id, user_text }`
   - 响应：`{ session_id, assistant_text, emotion, animation, relationship_delta, memory_writes }`
3. `POST /v1/chat/voice`：语音对话一站式（P0 推荐）
   - 请求：`multipart/form-data`：`audio`(wav) + `session_id` + `persona_id` + `lang`(可选)
   - 响应：`{ transcript_text, assistant_text, tts_media_type, tts_audio_base64, emotion, animation }`
4. `POST /v1/user/clear`：清除会话数据
   - 请求：`{ session_id }`
   - 响应：`{ ok: true }`
5. `POST /v1/tts/synthesize`：保留现有（用于“点一下朗读”等场景）。

说明：
- 语音端点用 **一站式 JSON + base64 音频**，前端实现最省事，P0 成本最低；后续可升级为流式或改为返回音频 URL。
- `emotion/animation` 先用枚举字符串，例如 `neutral|happy|sad|angry|shy` 与 `idle|listen|think|speak|happy|sad|angry`，前端先做状态切换占位。

## 3. 数据与状态（P0 简洁实现）
- 会话：`session_id` 由前端生成并存 `localStorage`。
- 服务端持久化：P0 使用 **SQLite**（文件落 `server/.data/`，并在 `.gitignore` 忽略）。
  - `messages(session_id, role, content, ts)`
  - `memories(session_id, key, value, type, ts)`：永久记忆（偏好/雷点/重要人名）
  - `relationship(session_id, trust, reliance, fatigue, ts)`
- 事件卡：从 `configs/events/` 读取 YAML，P0 至少 20 条。
  - 策略：每 N 轮对话或每天首次会话随机注入 1 条“今日事件”作为上下文附加信息。

## 4. 语音链路（实现细节，避免踩坑）
- Web 录音：实现 **Push-to-talk Recorder**，保证产出 **16k PCM WAV**（推荐前端做 WAV 编码，避免后端依赖 ffmpeg）。
- SenseVoice：服务端将 WAV 以 multipart 转发到 SenseVoice 的 `POST /api/v1/asr`（字段对齐：`files`/`keys`/`lang`）。
- LLM：服务端拼装 system prompt（SillyTavern 卡 + 安全/输出标签约束），调用 `POST https://api.gptsapi.net/v1/messages`。
- TTS：服务端调用现有 `/v1/tts/synthesize` 或直接调 GPT-SoVITS；`ref_audio_path/prompt_text` 从 `configs/persona/` 默认值读取。
- 播放：前端收到 `tts_audio_base64` 后转 `Blob/Audio` 播放；播放期间驱动 3D 口型占位（基于 WebAudio analyser 能量）。

## 5. Subagents 并行拆分（文件所有权，保证不打架）
约束：每个 subagent **只改自己负责目录**，不碰他人文件；跨模块契约只由“协调者”修改 `docs/api/contracts/`。

### 5.1 Subagent-Backend
Owner：
- `server/`
- `scripts/dev/start_sensevoice_api.ps1`（计划新增）
- `docs/api/contracts/`

职责：
- 实现 LLM 客户端（gptsapi `POST /v1/messages` + Bearer）。
- 实现 ASR 代理（SenseVoice base_url 可配）。
- 实现 `/v1/chat/text`、`/v1/chat/voice`、`/v1/user/clear`。
- 实现 SQLite 存储层（messages/memories/relationship）。
- 更新 OpenAPI 契约与最小单测（重点：LLM 响应解析、ASR 代理错误处理、clear 行为）。

### 5.2 Subagent-Frontend
Owner：
- `web/`

职责：
- 实现 UI：聊天窗口 + 输入框 + 按住说话按钮 + 设置面板（隐私/清除）。
- 实现录音（16k wav）与调用 `/v1/chat/voice`。
- 实现音频播放与 3D 占位状态机（Idle/Listening/Speaking）。
- 本地缓存：会话 id、聊天记录（可开关）；录音默认不落盘。

### 5.3 Subagent-Content
Owner：
- `configs/`

职责：
- 固化 persona 配置：从 `Phainon_actor_card.json` 映射出 system prompt 片段与 TTS 默认参考音频信息。
- 补齐 events：至少 20 个日常事件卡（含权重与关系值影响）。
- 补齐 prompts：system prompt 模板（含 emotion/animation 输出标签要求）。

### 5.4 Subagent-Integration
Owner：
- `docs/`
- `.github/`
- `scripts/validation/`

职责：
- 更新运行文档：本地启动顺序（SenseVoice、GPT-SoVITS、server、web）。
- 增补 smoke checklist（手工验收步骤）。
- CI 最小化：配置校验 +（可选）`web` 的 `typecheck`（如不装依赖则跳过）。

### 5.5 协调者（主 agent）职责
- 先把 **接口契约** 写清楚并冻结，再放 subagents 干活。
- 任何跨目录改动（例如根 `README.md`、`AGENTS.md`）只由协调者处理。

## 6. 任务清单（按顺序执行，便于并行）
1. 协调者：冻结 P0 API 契约与字段（第 2 节）。
2. Backend：落地 `/v1/chat/text` 与 LLM 调用（先不带 ASR/TTS）。
3. Frontend：落地文本聊天 UI，对接 `/v1/chat/text`。
4. Backend：落地 SenseVoice 代理 + `/v1/chat/voice`（先只返回 transcript + assistant_text）。
5. Backend：在 `/v1/chat/voice` 内接 GPT-SoVITS，返回 `tts_audio_base64`。
6. Frontend：接语音录制与播放；接 3D 占位状态机与口型占位。
7. Content：补齐 persona + 20 events；Backend 接入“事件注入 + 关系值更新 + 记忆写入策略”。
8. Integration：补齐 docs + 最小 CI/校验脚本；全链路 smoke 跑通。

## 7. 失败模式与降级（P0 必备）
- SenseVoice 不可用：前端提示“ASR 离线”，允许改走文本输入。
- LLM 不可用：返回可读错误与重试；不阻塞 UI。
- GPT-SoVITS 不可用：仍显示 assistant_text；语音播放降级为无声。
- 清除数据：必须同时清除前端 localStorage/IndexedDB + 服务端 SQLite 记录（按 session_id）。

## 8. 假设与默认值（若未另行说明）
- SenseVoice 服务端口默认 `50000`，base_url 通过 `server/.env` 配置。
- GPT-SoVITS 默认 `9880`，已通过 `server/.env` 配置。
- P0 不做流式文本/流式音频；统一“请求-响应”模式先跑通体验。

