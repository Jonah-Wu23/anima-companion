# Web MVP 本地启动顺序（SenseVoice → GPT-SoVITS → server → web）

## 目标
- 统一本地联调启动顺序，避免端口未就绪导致的假故障。
- 明确每一步的“就绪判定”与常见失败定位。

## 前置条件
- 已安装 `Python`、`Node.js`、`npm`、`PowerShell 7+`。
- `server/` 与 `web/` 依赖可正常安装。
- SenseVoice 服务可在本机启动，并暴露 `POST /api/v1/asr`（默认 `127.0.0.1:50000`）。

## 启动顺序（必须按序）
1. **SenseVoice ASR**
   - 在 SenseVoice 仓库中按其文档启动服务（目标端口 `50000`）。
   - 就绪检查：
     ```powershell
     Test-NetConnection -ComputerName 127.0.0.1 -Port 50000 | Select-Object TcpTestSucceeded
     ```

2. **GPT-SoVITS API**
   - 在本仓库根目录执行：
     ```powershell
     pwsh .\scripts\dev\start_gpt_sovits_api.ps1
     ```
   - 就绪检查：
     ```powershell
     Test-NetConnection -ComputerName 127.0.0.1 -Port 9880 | Select-Object TcpTestSucceeded
     ```

3. **后端 server（FastAPI）**
   - 新开终端，在本仓库根目录执行：
     ```powershell
     pwsh .\scripts\dev\start_server.ps1
     ```
   - 就绪检查：
     ```powershell
     Invoke-WebRequest http://127.0.0.1:8000/healthz | Select-Object -ExpandProperty Content
     ```

4. **前端 web（Next.js）**
   - 新开终端，在本仓库根目录执行：
     ```powershell
     pwsh .\scripts\dev\start_web.ps1
     ```
   - 就绪检查：
     ```powershell
     Invoke-WebRequest http://127.0.0.1:3000 | Select-Object -ExpandProperty StatusCode
     ```

## 推荐联调流程
1. 先跑配置校验：
   ```powershell
   pwsh .\scripts\validation\validate_configs.ps1
   ```
2. 按上述顺序启动四个服务。
3. 参照 `docs/runbooks/release/smoke_checklist.md` 逐项完成 smoke 验证。

## 停止顺序（建议）
- 先停 `web`，再停 `server`，再停 `GPT-SoVITS`，最后停 `SenseVoice`。
- 避免先停 ASR/TTS 导致前端出现连锁报错噪音。

