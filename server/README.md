# server

后端服务目录，承载 ASR、LLM 编排、记忆系统与 TTS 推理。

## 责任边界
- 提供统一 API（文本、语音、记忆、关系值）。
- 管理模型推理链路与低延迟返回策略。
- 负责审计日志、安全策略、敏感信息脱敏。

## 后续建议结构
- `api/`：HTTP/WebSocket/gRPC 接口
- `services/`：ASR、dialogue、memory、tts 子服务
- `domain/`：核心业务模型
- `infra/`：数据库、向量检索、缓存、消息队列
