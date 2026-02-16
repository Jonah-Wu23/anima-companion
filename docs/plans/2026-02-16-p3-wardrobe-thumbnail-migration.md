# 2026-02-16 P3 换装间缩略图迁移记录

## 1. 变更背景

换装间 UI 原先使用“首字占位”显示模型卡片与右侧大预览。  
本次将占位图统一替换为真实图片资源，来源目录为：`assets/model_photos/`。

目标：
- 提升换装浏览与选择效率（视觉辨识度更高）。
- 与现有模型注册表保持一一对应，避免图片错配。

## 2. 变更范围

涉及文件：
- `web/src/lib/wardrobe/model-registry.ts`
- `web/src/components/wardrobe/ModelCard.tsx`
- `web/src/components/wardrobe/ModelPreview.tsx`

不涉及：
- 模型加载逻辑（PMX 路径与换装切换逻辑保持不变）。
- 服务端数据结构与数据库。

## 3. 图片映射关系（最终落地）

| 图片编号 | 图片文件 | 对应模型 |
|---|---|---|
| 001 | `assets/model_photos/001.jpg` | 铁墓白 |
| 002 | `assets/model_photos/002.jpg` | 卡厄斯兰那（总裁版） |
| 003 | `assets/model_photos/003.jpg` | 特工白厄、秘密特工黑厄（共用） |
| 004 | `assets/model_photos/004.jpg` | 德谬歌-白厄 |
| 005 | `assets/model_photos/005.jpg` | 瑞幸联动 |
| 006 | `assets/model_photos/006.png` | 卡厄斯兰那（完整版） |
| 007 | `assets/model_photos/007.png` | 白厄 |
| 008 | `assets/model_photos/008.png` | 机长制服 |
| 009 | `assets/model_photos/009.png` | ANAN杂志 |
| 010 | `assets/model_photos/010.png` | 白厄女士(风衣) |
| 011 | `assets/model_photos/011.png` | 白厄女士(短裙) |
| 012 | `assets/model_photos/012.png` | 白厄女神(带翼) |
| 013 | `assets/model_photos/013.png` | 白厄女神(无翼) |

## 4. 实现说明

### 4.1 注册表扩展

在 `ModelInfo` 既有 `thumbnail?: string` 字段基础上，为所有可用模型补齐 `thumbnail` 路径。

### 4.2 本地文件 URL 统一解析

在 `model-registry.ts` 中新增缩略图解析函数：
- `resolveModelThumbnailPath(model)`

并复用统一路径处理逻辑，输出 `/api/local-files/...` URL，保证与 PMX、贴图加载机制一致。

### 4.3 UI 渲染改造

- `ModelCard.tsx`：卡片缩略图由占位字改为真实图片（无图时回退占位字）。
- `ModelPreview.tsx`：右侧大圆形预览由占位字改为真实图片（无图时回退占位字）。
- 图片组件使用 `next/image`（`unoptimized`），与当前本地 API 文件分发方式兼容。

## 5. 验证结果

已执行：
- `npm --workspace web exec tsc --noEmit`：通过。

已知问题（与本次改动无关）：
- `npm run build:web` 在当前分支仍失败，报错为 `/api/album/privacy` 页面数据收集失败（`Cannot find module for page: /api/album/privacy`）。

## 6. 风险与回滚

风险：
- 不同比例图片在圆形预览中可能存在主体裁切偏差（当前使用 `object-cover`）。

快速回滚：
- 删除或置空各模型 `thumbnail` 字段后，UI 将自动回退到原占位字显示。

## 7. 后续建议

如需进一步提升观感，可逐个模型增加裁切焦点配置（例如 `object-position` 或额外的 focal point 字段），避免关键主体被裁切。

