# 资源迁移映射表（洛天依 + 白厄）

> 更新时间：2026-02-18  
> 目的：记录本次“移动 + 重命名”后的资源映射，避免后续维护时路径混乱。

## 命名规则

- 角色前缀：`phainon-`、`luotianyi-`
- 相册图片：`{character}-album-photo-YYYYMMDD-序号.ext`
- 相册截图：`{character}-album-shot-YYYYMMDD-HHMMSS-序号或随机.ext`
- 首页背景：`hero-{character}-illustration-序号.ext`
- 聊天头像：`{character}-chat-avatar.ext`

## 路径映射（旧 -> 新）

### 1) 首页 / 头像资源

| 旧路径 | 新路径 |
|---|---|
| `mmd_download/luotianyi/99486679_p0.jpg` | `web/public/images/hero-luotianyi-illustration-01.jpg` |
| `屏幕截图 2026-02-18 190554.png` | `web/public/assets/luotianyi-chat-avatar.png` |
| `assets/model_photos/luotianyi-v4.jpg` | `web/public/assets/luotianyi-profile.jpg` |

### 2) 洛天依模型目录

| 旧路径 | 新路径 |
|---|---|
| `mmd_download/luotianyi/洛天依V4公式服` | `assets/models/LuoTianyi_V4` |
| `mmd_download/luotianyi/TDA洛天依 国风服饰 梨花雪 Ver1.02` | `assets/models/LuoTianyi_LiHuaXue` |
| `mmd_download/luotianyi/TDA 洛天依旗袍 芒种 Ver1.00` | `assets/models/LuoTianyi_MangZhong` |

### 3) 洛天依换装缩略图

| 旧路径 | 新路径 |
|---|---|
| `assets/models/LuoTianyi_LiHuaXue/11.png` | `assets/model_photos/luotianyi-lihuaxue-11.png` |
| `assets/models/LuoTianyi_MangZhong/手办原画.png` | `assets/model_photos/luotianyi-mangzhong-figure.png` |

### 4) 洛天依相册素材（原 hash 文件）

| 旧路径 | 新路径 |
|---|---|
| `mmd_download/luotianyi/ab2b5b594714705f510605d9a1e62abc36081646.jpg` | `assets/photos/luotianyi-album-photo-20260218-001.jpg` |
| `mmd_download/luotianyi/d22ee6518f814363670cf846542a7a8936081646.png` | `assets/photos/luotianyi-album-photo-20260218-002.png` |
| `mmd_download/luotianyi/e063fca6c8a8cfb70d54cb6692fdd21c36081646.jpg` | `assets/photos/luotianyi-album-photo-20260218-003.jpg` |

### 5) 白厄相册素材（批量前缀规范化）

| 旧路径 | 新路径 |
|---|---|
| `assets/photos/album-photo-20250725-184921-001.jpg` | `assets/photos/phainon-album-photo-20250725-184921-001.jpg` |
| `assets/photos/album-photo-20250725-184944-002.jpg` | `assets/photos/phainon-album-photo-20250725-184944-002.jpg` |
| `assets/photos/album-photo-20250725-184947-003.jpg` | `assets/photos/phainon-album-photo-20250725-184947-003.jpg` |
| `assets/photos/album-photo-20250725-184956-004.jpg` | `assets/photos/phainon-album-photo-20250725-184956-004.jpg` |
| `assets/photos/album-photo-20250725-185004-005.jpg` | `assets/photos/phainon-album-photo-20250725-185004-005.jpg` |
| `assets/photos/album-photo-20250725-185028-006.jpg` | `assets/photos/phainon-album-photo-20250725-185028-006.jpg` |
| `assets/photos/album-photo-20250725-185031-007.jpg` | `assets/photos/phainon-album-photo-20250725-185031-007.jpg` |
| `assets/photos/album-photo-20250725-185034-008.jpg` | `assets/photos/phainon-album-photo-20250725-185034-008.jpg` |
| `assets/photos/album-photo-20250725-185037-009.jpg` | `assets/photos/phainon-album-photo-20250725-185037-009.jpg` |
| `assets/photos/album-photo-20250725-185045-010.jpg` | `assets/photos/phainon-album-photo-20250725-185045-010.jpg` |
| `assets/photos/album-photo-20250725-185231-011.jpg` | `assets/photos/phainon-album-photo-20250725-185231-011.jpg` |
| `assets/photos/album-photo-20250725-185234-012.jpg` | `assets/photos/phainon-album-photo-20250725-185234-012.jpg` |
| `assets/photos/album-shot-20250725-185533-013.png` | `assets/photos/phainon-album-shot-20250725-185533-013.png` |
| `assets/photos/album-shot-20250725-185954-014.png` | `assets/photos/phainon-album-shot-20250725-185954-014.png` |
| `assets/photos/album-shot-20250725-190001-015.png` | `assets/photos/phainon-album-shot-20250725-190001-015.png` |
| `assets/photos/album-shot-20250725-190023-016.png` | `assets/photos/phainon-album-shot-20250725-190023-016.png` |
| `assets/photos/album-shot-20250725-190034-017.png` | `assets/photos/phainon-album-shot-20250725-190034-017.png` |
| `assets/photos/album-shot-20250725-190038-018.png` | `assets/photos/phainon-album-shot-20250725-190038-018.png` |
| `assets/photos/album-shot-20250725-190059-019.png` | `assets/photos/phainon-album-shot-20250725-190059-019.png` |
| `assets/photos/album-shot-20260216-132942-c076ebbe.png` | `assets/photos/phainon-album-shot-20260216-132942-c076ebbe.png` |
| `assets/photos/album-shot-20260216-231826-4da48e62.png` | `assets/photos/phainon-album-shot-20260216-231826-4da48e62.png` |

## 备注

- 代码侧已同步到新路径：角色头像、首页 hero、洛天依三套模型 PMX 与缩略图。
- `assets/photos` 的历史文件名变更会由相册 store 同步更新（已实现按文件名重扫与迁移）。

