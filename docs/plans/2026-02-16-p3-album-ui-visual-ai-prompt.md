# 强视觉AI执行提示词（相册 UI/动效）

你是“强视觉AI”，负责 **仅升级相册 UI/动效/可读性**，不要改动已落地的数据层契约。

## 目标
将当前 `/album` 功能验证页升级为高质量“回忆画廊”体验，强调：
1. 画廊式版式（桌面与移动端都好看）
2. 进入/筛选/查看/删除等动效自然，不炫技
3. 信息密度高但可读性强（时间、来源、隐私状态、操作反馈）
4. 与主站风格统一（玻璃感、渐变、细腻光影）

## 严格约束（不可破坏）
1. 不改 API 路径与请求格式：
   - `GET /api/album`
   - `POST /api/album/capture`
   - `PATCH /api/album/privacy`
   - `DELETE /api/album/:id`
2. 不改核心字段语义（可新增前端派生字段）：
   - `AlbumItem`: `id/filename/title/source/mimeType/sizeBytes/capturedAt/createdAt/updatedAt/url`
   - `AlbumEvent`: `id/type/createdAt/itemId/note/payload`
   - `AlbumSettings`: `privacyEnabled/updatedAt`
3. 不改“截图后弹框”行为语义（可以重绘视觉）：
   - 选项 A：前往相册
   - 选项 B：留在当前页
4. 不引入破坏 SSR/构建的大型不必要依赖。

## 你可以做的事
1. 重构 `/album` 的布局和组件层次（如 masonry、time-group、lightbox）。
2. 增加动画：
   - 列表进入（stagger）
   - 卡片 hover/focus
   - 删除离场
   - 详情查看过渡
3. 增强可读性：
   - 时间分组（今天/本周/更早）
   - 来源标签视觉区分（导入/截图）
   - 事件流层级清晰
4. 增加无障碍细节：
   - 键盘可达
   - 焦点态明显
   - 对比度达标

## 当前代码入口
- 页面：`web/src/app/album/page.tsx`
- 首页截图逻辑：`web/src/app/page.tsx`
- 顶栏入口：`web/src/components/TopBar.tsx`
- 截图提示框：`web/src/components/AlbumCapturePromptModal.tsx`
- 客户端 API：`web/src/lib/album/client.ts`

## 交付要求
1. 保持数据逻辑兼容，页面可直接运行。
2. 桌面/移动端都完成适配。
3. 提供一次 `npm run typecheck:web` 的通过结果。
4. PR 描述要写清：
   - 视觉目标
   - 动效策略
   - 可读性优化点
   - 与数据层兼容性说明
