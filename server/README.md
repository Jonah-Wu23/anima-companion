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
