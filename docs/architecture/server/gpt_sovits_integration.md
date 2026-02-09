# GPT-SoVITS 本地接入方案（MVP）

## 1. 接入方式
当前采用“服务端代理”模式：
- GPT-SoVITS 本地运行在 `http://127.0.0.1:9880`（`api_v2.py`）
- 本项目服务端提供统一入口 `POST /v1/tts/synthesize`
- 安卓端只访问本项目服务端，不直接依赖 GPT-SoVITS 细节

这样做的好处是：后续替换 TTS 引擎时，客户端协议不需要改。

## 2. 启动流程
1. 启动 GPT-SoVITS API：
   `pwsh ./scripts/dev/start_gpt_sovits_api.ps1`
2. 启动服务端：
   `cd server`
   `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

## 3. 服务端请求示例
接口：`POST http://127.0.0.1:8000/v1/tts/synthesize`

```json
{
  "text": "你好，今天也辛苦了。",
  "text_lang": "zh",
  "ref_audio_path": "参考音频/xxx.wav",
  "prompt_lang": "zh",
  "prompt_text": "你好，今天也辛苦了。",
  "text_split_method": "cut5",
  "media_type": "wav",
  "streaming_mode": false
}
```

成功返回 `audio/wav` 二进制流。

## 4. 配置位置
- 服务端环境变量：`server/.env.example`
- 开发默认值：`configs/environments/dev.yaml`

## 5. 注意事项
- `ref_audio_path` 为 GPT-SoVITS 根目录的相对路径。
- 先保证 GPT-SoVITS 单独可用，再联调服务端代理。
- 若后续要多角色并发，建议“一个角色一个 GPT-SoVITS 实例 + 独立端口”。
