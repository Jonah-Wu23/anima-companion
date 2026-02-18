# 洛天依角色接入实施计划（评审稿）

> **文档位置**: `docs/plans/2026-02-18-luotianyi-character-integration-plan.md`  
> **创建日期**: 2026-02-18  
> **状态**: 评审稿 v1.3（仅修订计划，不在本次对话落地代码/资产）  
> **目标版本**: MVP Web/PWA  
> **相关角色**: 白厄(Phainon) 现有, 洛天依(LuoTianyi) 新增

---

## 一、目标与范围

### 1.1 目标（MVP 最小闭环）

- 新增「洛天依」为可选角色，且不破坏白厄现有链路。
- “当前角色”贯穿关键体验并保持一致：
  - Chat 页角色切换入口（头像/名称/选择器）
  - 对话/语音请求的 `persona_id`
  - 3D 默认模型 + 动作清单（manifest）
  - 相册/换装的筛选与文案
- 文字、语音、3D、相册、换装全链路闭环可验收（见任务11）。

### 1.2 非目标（明确不做）

- 账号体系、解锁系统、按用户隔离相册/素材。
- 大规模内容制作（大量动作、表情、语音包定制），仅保证可运行与一致性。
- 大重构“角色=人格=模型=动作”的统一配置平台（避免过度工程化）。

### 1.3 关键约定（命名与标识）

- `character_id`: `phainon` | `luotianyi`（前端角色标识）。
- `persona_id`: 与后端 `configs/persona/*.yaml` 的 `id` 一致，建议与 `character_id` 同名（例如 `luotianyi`）。
- 相册素材文件前缀：`{character_id}-`（例如 `luotianyi-01.jpg`、`phainon-album-photo-...`）。
- 模型归属：`ModelInfo.characterId?: CharacterId`（缺省视为 `phainon`，兼容现有模型列表）。

### 1.4 已确定（你已拍板）

- 相册 schema：允许 `characterId=null` 表示全局/旧数据（减少迁移风险）。
- Qwen 音色：洛天依 `target_model` 与白厄一致，使用 `QWEN_TTS_TARGET_MODEL`（当前示例为 `qwen3-tts-vc-realtime-2026-01-15`）。
- 参考音频：已上传 OSS，可用 `audio_url=https://anima-companion.oss-cn-shanghai.aliyuncs.com/luotianyi.wav`。
- 角色切换入口：Chat 页为主入口；`wardrobe`/`album` 也提供快捷入口。

---

## 二、现状与约束（基于仓库现状）

### 2.1 Persona/角色卡加载机制

- 后端通过 `configs/persona/*.yaml` 的 `source_card` 映射到 JSON 角色卡；对白厄存在 fallback 映射。  
  - 相关代码：`server/app/services/dialogue/persona_loader.py`
- 前端对话请求需要传 `persona_id`：  
  - `web/src/components/MessagePanel.tsx`  
  - `web/src/components/VoiceInputDock.tsx`  
  - `web/src/components/InputDock.tsx`

结论：若要支持 `persona_id=luotianyi`，必须新增 `configs/persona/luotianyi.persona.yaml`，否则会回落/失败。

### 2.2 3D 动作清单（motion manifest）

- 默认 manifest 路径当前是白厄：`/api/local-files/configs/motions/phainon-motion-manifest.json`  
  - 相关代码：`web/src/lib/mmd/motion-manifest.ts`、`web/src/components/Viewport3D.tsx`

结论：要做到角色一致性，manifest 也需要按角色切换，至少新增洛天依的 manifest 文件。

### 2.3 资产入库策略（重要）

- `.gitignore` 已忽略 `assets/models/`（模型目录默认不进 git）。
- `.gitignore` 未忽略 `assets/photos/`、`assets/model_photos/`、`web/public/images/`（这些默认会进 git）。

结论：任何照片/背景图/缩略图/参考音频是否可提交，必须先做授权/合规确认；否则只能走本地私有数据方案或补充 ignore 策略（需评审）。
审查结论：可提交（以你当前选用的素材与许可为准；若后续替换素材需重新复核）。

---

## 三、设计决策（KISS）

### 3.1 单一事实来源：角色注册表

新增 `web/src/lib/characters/registry.ts` 作为角色元数据的唯一来源：

- `id/name/profileImage/heroImage`
- `personaId`（用于 chat/voice 请求）
- `defaultModelId`（用于 3D 默认模型）
- `motionManifestPath`（用于 3D 动作清单）
- `albumPrefix`（用于相册/素材过滤）

### 3.2 角色状态：zustand + localStorage 持久化

新增 `web/src/lib/store/characterStore.ts`：

- `currentCharacterId`
- `setCurrentCharacter`：写入 localStorage，并触发默认模型切换（调用 `useWardrobeStore`）。

### 3.3 相册归属：存储 schema 增强（characterId）

你已决定改 `web/src/lib/server/album-store.ts` 的存储 schema，因此本计划调整为：

- 存储层写入 `characterId`（或 `personaId`）作为相册条目归属，不再依赖文件名前缀推断。
- 兼容旧数据：对历史条目做一次轻量迁移（或读取时推断），避免相册空白/丢失。
- 截图入口在 Chat 页，因此截图写入时需要把当前 `character_id` 一并传给 `/api/album/capture`。

建议字段（最小集）：

- `AlbumItem.characterId?: 'phainon' | 'luotianyi' | null`

对应改动点（计划级别）：

- `web/src/lib/album/types.ts`：扩展类型
- `web/src/app/api/album/capture/route.ts`：读取 `character_id` formData
- `web/src/lib/server/album-store.ts`：store 版本号 + 迁移/写入逻辑
- `web/src/lib/album/client.ts`：`captureScreenshot` 支持透传 `characterId`

### 3.4 模型归属：新增可选字段，旧模型默认白厄

对 `web/src/lib/wardrobe/model-registry.ts`：

- `ModelInfo` 增加 `characterId?: CharacterId`
- 过滤时使用 `(model.characterId ?? 'phainon') === currentCharacterId`

---

## 四、任务清单

### 任务1: 资产准备与合规（P0）

**目标**：确保引入资产“可用且可提交/可分发”。

- [ ] 阅读每个模型目录的配布说明（`readme.txt`/`读我.txt`）：确认允许范围（尤其二次配布/商用/改造条款）。
- [ ] 输出 Credits 清单（作者、来源、使用规则摘要），并保留许可文件与模型目录一并管理。
- [ ] 明确哪些资产可进 git：  
  - `assets/models/` 默认不进 git（本地存在即可）  
  - `assets/photos/`、`web/public/images/`、`assets/model_photos/` 若不可提交，需改为本地私有方案或补充 ignore

### 任务2: 角色注册表 + 角色状态（P0）

**新增文件**：

- `web/src/lib/characters/registry.ts`
- `web/src/lib/store/characterStore.ts`

**要点**：

- [ ] 注册 `phainon` 与 `luotianyi` 两个角色的元数据（见“三.1”字段列表）。
- [ ] `characterStore` 持久化 `currentCharacterId`（localStorage）。
- [ ] 角色切换时将 `useWardrobeStore` 的当前模型切到该角色 `defaultModelId`（避免 3D 与角色不一致）。

### 任务3: Chat 页接入角色切换（P0）

**修改文件**：`web/src/app/chat/page.tsx`（以及/或 `web/src/components/TopBar.tsx`）

- [ ] 在 Chat 页的 TopBar 区域提供角色切换入口（下拉/弹层均可），数据源为 `AVAILABLE_CHARACTERS`。
- [ ] 切换后立刻生效并持久化：`persona_id`、3D 默认模型、UI 头像/名称、相册/换装筛选。
- [ ] 主页不做角色入口改造（按你的决定），但避免全局文案继续硬编码“白厄”（以免认知割裂）。
- [ ] 在 `wardrobe`/`album` 页面也提供同款“当前角色”快捷切换入口（建议复用同一个 `CharacterSwitcher` 组件，避免多处逻辑分叉）。

### 任务4: Persona 映射 + 角色卡（P0）

**新增文件**：

- `configs/persona/luotianyi.persona.yaml`

**内容**：

- [ ] `configs/persona/luotianyi.persona.yaml`：

```yaml
id: "luotianyi"
aliases:
  - "洛天依"
source_card: "LuoTianyi_actor_card.json"
```

- [ ] `LuoTianyi_actor_card.json`：结构对齐现有 `Phainon_actor_card.json`，保留 `{{user}}`、`{{char}}` 占位符；可选字段（如 `AI_initial_injection`）可留空字符串。

补充说明：

- `LuoTianyi_actor_card.json` 已存在（你已创建），本任务仅要求“能被 persona loader 通过 yaml 映射加载到”。

### 任务5: Qwen 克隆音色（洛天依）与前端绑定（P0）

**目标**：洛天依语音链路先走 Qwen 克隆音色（`qwen_clone_tts`），形成“语音闭环”。

**参考音频（本地）**：

- `assets/audio/references/luotianyi/luotianyi.wav`

**关键约束**：

- 后端 `QwenVoiceEnrollRequest.audio_url` 要求“公网可访问 URL”，本地文件路径不能直接用于 enroll（详见 `server/README.md` 与 `server/app/schemas/tts.py`）。

**任务拆分**：

- [x] 已上传参考音频，`audio_url=https://anima-companion.oss-cn-shanghai.aliyuncs.com/luotianyi.wav`。
- [ ] 调用 `POST /v1/tts/qwen/enroll` 创建或复用音色：
  - `prefix`: `luotianyi`（或 `luotianyi_v1`）
  - `target_model`: 与白厄一致（使用 `QWEN_TTS_TARGET_MODEL`，例如 `qwen3-tts-vc-realtime-2026-01-15`）
  - `wait_ready`: `true`（MVP 阶段建议阻塞等待，便于闭环验证）
- [ ] 记录返回的 `voice_id` 与 `target_model`，并把它绑定到“当前角色=洛天依”的前端请求参数：
  - 建议：扩展 `web/src/lib/characters/registry.ts`，新增 `tts` 配置字段（按角色存 `qwen_voice_id`/`qwen_target_model`）
  - 不建议继续只用单个 `NEXT_PUBLIC_QWEN_VOICE_ID` 做全局（会导致白厄与洛天依共用同一音色）

### 任务6: 模型注册与换装筛选（P0）

**修改文件**：`web/src/lib/wardrobe/model-registry.ts`、`web/src/app/wardrobe/page.tsx`

- [ ] `ModelInfo` 增加 `characterId?: CharacterId`。
- [ ] 注册洛天依模型（至少：V4 默认 + 2 套换装）。
- [ ] 换装页按当前角色过滤模型：`(model.characterId ?? 'phainon') === currentCharacterId`。

### 任务7: 相册 schema 变更（characterId）+ 页面筛选闭环（P0）

**修改文件**：

- `web/src/lib/server/album-store.ts`
- `web/src/lib/album/types.ts`
- `web/src/app/api/album/capture/route.ts`
- `web/src/lib/album/client.ts`
- `web/src/app/album/page.tsx`

**存储 schema（建议）**：

- `data/album/store.json` bump `version`：`1 -> 2`
- `items[]` 新增字段：`characterId`（建议可空，兼容旧数据）
- `events[]` 的 `payload` 可补充 `characterId`（便于排查）

**迁移策略（KISS）**：

- 读取 store 时：若 `version===1` 或 item 缺 `characterId`，按规则推断并补齐：
  - 文件名以 `phainon-` 开头 -> `phainon`
  - 文件名以 `luotianyi-` 开头 -> `luotianyi`
  - 否则（例如 `album-shot-...`）-> `null`（表示“全局截图/未归属”）
- 写回 store 时统一写 `version=2`（一次性平滑迁移）。

**截图写入链路补齐**：

- Chat 页截图入口在 `web/src/app/chat/page.tsx`（已存在），调用 `albumApi.captureScreenshot` 时追加 `character_id`。
- `/api/album/capture` 从 formData 读 `character_id` 并传给 `saveAlbumScreenshot`，让条目落盘时就带归属。

**页面筛选**：

- 相册页新增筛选：`全部` / `仅看当前角色` / `仅看未归属`
- “仅看当前角色”按 `item.characterId === currentCharacterId` 过滤；旧数据已迁移则无需前缀过滤兜底。

### 任务8: 相册文案通用化（P1）

**修改文件**：`web/src/app/album/page.tsx`（必要时 `web/src/components/album/FilterBar.tsx`）

- [ ] 将相册页固定文案“白厄”改为当前角色名称（来自 registry）。
- [ ] 补充“未归属”提示文案（当 `characterId=null` 且用户选择“仅看当前角色”时，说明这些是全局截图/旧数据）。

### 任务9: Chat/语音/3D/UI 角色感知（P0）

**修改文件**：

- `web/src/components/MessagePanel.tsx`
- `web/src/components/VoiceInputDock.tsx`
- `web/src/components/InputDock.tsx`
- `web/src/components/TopBar.tsx`
- `web/src/components/Viewport3D.tsx`

**要点**：

- [ ] 文字对话与语音请求的 `persona_id` 改为动态：来自当前角色 `personaId`（env 仅作兜底）。
- [ ] 语音请求的 `qwen_voice_id` / `qwen_target_model` 改为动态：来自当前角色的 `tts` 配置（洛天依绑定克隆音色；白厄可用默认或另配）。
- [ ] `TopBar`、`MessagePanel` 的 assistant 头像/名称改为当前角色（替换硬编码白厄资源）。
- [ ] `Viewport3D` 的 manifest 路径改为当前角色 `motionManifestPath`。

### 任务10: 新增洛天依 motion manifest（P0）

**新增文件**：`configs/motions/luotianyi-motion-manifest.json`

- [ ] 至少覆盖 idle/speaking/listening/thinking/error 的候选动作。
- [ ] 白厄专用 motion id（例如 `TALK8_MOTION_IDS`）不要求在洛天依 manifest 中出现，避免误触发。

### 任务11: 测试与验证（P0）

- [ ] 白厄全链路回归：文字、语音、3D、相册、换装。
- [ ] 洛天依闭环：Chat 切换 -> 文字请求 `persona_id=luotianyi` -> 语音请求走 `qwen_clone_tts` 且使用洛天依 `qwen_voice_id` -> 3D 默认模型 + manifest 切换 -> 截图写入相册带 `characterId=luotianyi` -> 换装/相册筛选一致。
- [ ] 角色切换一致性：UI 头像/名称、`persona_id`、3D manifest 与默认模型保持一致，不混用。

---

## 五、文件变更清单（计划）

### 新增（可能）

```
web/src/lib/characters/registry.ts
web/src/lib/store/characterStore.ts
configs/persona/luotianyi.persona.yaml
configs/motions/luotianyi-motion-manifest.json
```

### 修改（可能）

```
web/src/app/chat/page.tsx
web/src/components/MessagePanel.tsx
web/src/components/VoiceInputDock.tsx
web/src/components/InputDock.tsx
web/src/components/TopBar.tsx
web/src/components/Viewport3D.tsx
web/src/lib/wardrobe/model-registry.ts
web/src/app/wardrobe/page.tsx
web/src/app/album/page.tsx
web/src/lib/server/album-store.ts
web/src/lib/album/types.ts
web/src/app/api/album/capture/route.ts
web/src/lib/album/client.ts
```

### 资产（需要评审是否入库）

```
assets/models/LuoTianyi_V4/                    (默认模型，当前 gitignore)
assets/models/LuoTianyi_LiHuaXue/              (换装模型，当前 gitignore)
assets/models/LuoTianyi_MangZhong/             (换装模型，当前 gitignore)
assets/model_photos/luotianyi-v4.jpg           (缩略图，已存在)
assets/model_photos/luotianyi-lihuaxue.png
assets/model_photos/luotianyi-mangzhong.png
assets/photos/luotianyi-01.jpg
assets/photos/luotianyi-02.png
assets/photos/luotianyi-03.jpg
web/public/images/hero-luotianyi-01.jpg
web/public/assets/luotianyi-profile.jpg
assets/audio/references/luotianyi/luotianyi.wav
```

---

## 六、风险与回滚

### 6.1 主要风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 资产授权不清导致无法提交/发布 | 中 | 高 | 先做许可核验；明确“可入库资产清单”；必要时改为本地私有数据 |
| `persona_id` 未映射导致仍用白厄 | 中 | 高 | 必须新增 `configs/persona/luotianyi.persona.yaml`，并在前端动态传参 |
| Qwen 音色 enroll 失败或不可用（需公网 audio_url/审核/额度/限流） | 中 | 高 | 先打通 `POST /v1/tts/qwen/enroll`；对 `voice_id` 做持久化；必要时降级到 GPT-SoVITS 或纯文本 |
| 3D manifest 仍固定白厄导致动作错配 | 中 | 中 | `Viewport3D` manifest 跟随角色；新增 `luotianyi` manifest |
| 模型路径/贴图缺失导致加载失败 | 中 | 高 | 迁移后做本地加载验证；不随意重命名贴图文件 |
| 相册 schema 变更导致历史数据读写异常 | 中 | 高 | store `version` 管控 + 读取时迁移；迁移前备份 `data/album/store.json` |
| 相册/文案硬编码白厄导致认知割裂 | 中 | 中 | 统一从 registry 驱动头像/名称/文案 |

### 6.2 回滚方案（最小成本）

1. 将前端 `characterStore` 与 registry 的引用回退到仅 `phainon`（或禁用角色选择入口）。
2. 移除或停用 `configs/persona/luotianyi.persona.yaml`（角色卡 `LuoTianyi_actor_card.json` 可保留，不影响白厄）。
3. 相册回滚：保留 `data/album/store.json` 备份，必要时回退到 `version=1` 的旧文件或禁用新筛选项。
4. 清理本地洛天依模型目录（`assets/models/LuoTianyi_*`）与相关素材（按实际入库策略）。

---

## 七、执行顺序建议

```
Phase 1: 合规与资产准备
  - 任务1

Phase 2: 角色系统骨架
  - 任务2、任务3

Phase 3: 对话与3D一致性
  - 任务4、任务5、任务9、任务10、任务6、任务7

Phase 4: 辅助体验
  - 任务8、任务11
```

---

## 八、附录

### 8.1 缩略图状态（已完成）

- 文件：`assets/model_photos/luotianyi-v4.jpg`（已存在）

### 8.2 相册命名规范（建议）

```
{character-prefix}-album-{type}-{timestamp}-{random}.{ext}

character-prefix: 'phainon-' | 'luotianyi-'
type: 'photo' | 'shot'
timestamp: YYYYMMDD-HHMMSS
random: 8位随机字符
ext: 'jpg' | 'png' | 'webp'
```

### 8.3 Credits 记录模板（建议）

- 模型名：
- 作者：
- 来源链接：
- 许可要点：
- 是否允许二次配布/商用：
- 是否需要署名展示位置：
