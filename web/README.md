# web

Web/PWA 客户端（MVP 主战场）。

## 技术栈
- Next.js + React + TypeScript
- Three.js（3D 渲染与交互）

## 启动命令
```powershell
cd web
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 环境变量
- `NEXT_PUBLIC_API_BASE_URL`：后端 API 地址，默认 `http://localhost:8000`
- `NEXT_PUBLIC_DEFAULT_PERSONA_ID`：默认角色 ID，默认 `phainon`

## 边界约定
- 只消费 `server` 暴露的 API，不直接调用 GPT-SoVITS。
- 角色人格与事件逻辑优先来自 `configs/`，避免前端硬编码。
