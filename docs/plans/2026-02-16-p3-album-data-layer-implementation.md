# Implementation Plan. Task List and Thought in Chinese — P3 时间/相册数据层（已落地）

## 1. 目标边界（本次仅实现）
- 时间/相册数据层：事件记录、存储、删除、隐私开关。
- 新增独立网页入口：`/album`（功能验证页，非最终视觉版）。
- 首页新增：
  - 跳转相册入口按钮。
  - “截图”按钮：截图后写入相册，并弹出自定义提示框（非浏览器原生提示）。

## 2. 数据结构
- `AlbumItem`：图片记录（来源、标题、文件名、大小、时间、URL）。
- `AlbumEvent`：事件日志（导入、截图、删除、隐私开关切换）。
- `AlbumSettings`：隐私开关状态（`privacyEnabled`）。

代码定义：`web/src/lib/album/types.ts`

## 3. 持久化与目录
- 图片目录：`assets/photos/`
- 数据文件：`data/album/store.json`
- 存储服务：`web/src/lib/server/album-store.ts`

实现细节：
- 启动读取时自动扫描 `assets/photos`，把未入库图片补齐到 `store.json`。
- 删除接口会同步删除磁盘文件与数据记录。
- 隐私开关开启（保护模式）时，禁止新增截图记录。

## 4. API 契约（Next 内部）
- `GET /api/album`：读取相册快照（items/events/settings）。
- `POST /api/album/capture`：上传截图并入库。
- `PATCH /api/album/privacy`：切换隐私开关。
- `DELETE /api/album/:id`：删除指定相册条目。

代码路径：
- `web/src/app/api/album/route.ts`
- `web/src/app/api/album/capture/route.ts`
- `web/src/app/api/album/privacy/route.ts`
- `web/src/app/api/album/[id]/route.ts`

## 5. 前端接入（功能闭环）
- 客户端 API：`web/src/lib/album/client.ts`
- 首页能力：
  - 顶栏新增相册入口 + 截图按钮。
  - 截图后弹出自定义确认框（去相册 / 留在当前页）。
  - 代码：`web/src/app/page.tsx`、`web/src/components/TopBar.tsx`、`web/src/components/AlbumCapturePromptModal.tsx`
- 相册验证页：
  - `web/src/app/album/page.tsx`
  - 支持查看图片、删除、隐私开关、事件列表。

## 6. 资产重命名（已执行）
- 已将 `assets/photos` 下图片统一重命名为：
  - `album-photo-YYYYMMDD-HHmmss-序号.jpg`
  - `album-shot-YYYYMMDD-HHmmss-序号.png`
- 映射表：`docs/plans/2026-02-16-album-photo-rename-map.csv`

## 7. 验证
- 执行：`npm run typecheck:web`
- 结果：通过（0 错误）。
