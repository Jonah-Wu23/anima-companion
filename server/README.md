# server

后端服务目录，承载 ASR、LLM 编排、记忆系统与 GPT-SoVITS 调用。

## 结构约定
- `app/api/v1/endpoints`：对外接口层（chat、voice、memory、relationship）
- `app/core`：配置、日志、安全、中间件
- `app/models`：领域对象
- `app/schemas`：请求/响应协议结构
- `app/services`：核心业务编排（asr/dialogue/memory/tts/emotion/avatar）
- `app/repositories`：存储抽象（数据库、向量库、缓存）
- `app/workers`：异步任务
- `tests`：单测、集成、端到端测试
- `deploy/docker`：容器化部署文件

## 维护规则
- 接口层只做协议转换，不写业务逻辑。
- `services` 间交互必须通过清晰接口，不直接跨目录读写实现细节。

## GPT-SoVITS 接入（本地）
1. 启动本地 GPT-SoVITS API：
   `pwsh ..\\scripts\\dev\\start_gpt_sovits_api.ps1`
2. 启动服务端：
   `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
3. 由 Web 客户端调用代理接口：
   `POST /v1/tts/synthesize`（服务端会转发到 GPT-SoVITS `/tts`）。

### TTS 配置说明
- 推荐在 `server/.env` 设置 `GPT_SOVITS_DEFAULT_REF_AUDIO_PATH` 为 GPT-SoVITS 工作目录下可用参考音频（如 `参考音频/xxx.wav`）。
- 多参考音频可通过 `GPT_SOVITS_AUX_REF_AUDIO_PATHS` 配置，使用 `|` 分隔绝对路径。
- “凑四句一切” 对应 `GPT_SOVITS_TEXT_SPLIT_METHOD=cut1`（`cut5` 为按标点切分）。
- 若未配置或参考音频无效，服务端会自动回退尝试 GPT-SoVITS 的 `/tts_to_audio/` 接口。
- `POST /v1/chat/voice` 响应中会包含 `tts_error` 字段，便于定位语音未返回的具体原因。

## P0 后端接口
- `POST /v1/chat/text`：文本对话（含关系值增量与记忆写入）。
- `POST /v1/chat/voice`：`audio + session_id + persona_id + lang` 一站式语音对话，返回 base64 音频。
- `POST /v1/user/clear`：按 `session_id` 清空 `messages/memories/relationship`。
