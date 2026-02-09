# Web 分层约束

## 目录分层
- `src/app`：路由与页面编排（App Router）
- `src/components`：纯 UI 组件
- `src/lib`：API 客户端、音频工具、3D 工具封装
- `src/styles`：全局样式与主题变量

## 依赖方向
`app -> components -> lib`

## 规则
- 页面层不直接写底层 API 请求细节，统一走 `src/lib`。
- 3D 状态与语音状态通过共享状态层管理，避免散落在多个组件。
- 角色设定、提示词和事件不硬编码在前端，统一从后端/配置读取。
