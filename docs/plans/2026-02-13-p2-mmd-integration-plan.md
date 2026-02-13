# Implementation Plan. Task List and Thought in Chinese — P2：MMD 模型接入与动作状态机

## 0. 定位与边界

### 0.1 P2 做什么
- **MMD 模型加载与渲染**：接入 PMX 模型（白厄），实现基础渲染管线。
- **VMD 动作系统**：加载 VMD 动作文件，实现动作状态机与平滑过渡（crossfade）。
- **口型同步（LipSync）**：将 `lipSyncEnergy` 驱动到 MMD 口型 Morph。
- **动作资产管道化**：基于 `phainon-motion-manifest.yaml` 建立动作加载与管理机制。
- **场景升级**：3D 场景从占位体（SunnyBubble）过渡到真实 MMD 角色。

### 0.2 P2 不做什么（留给 P3/P4）
- 复杂表情系统（表情 Morph 组合）。
- 物理模拟（刚体/布料）的精细调优。
- 触摸互动、换装、相册等沉浸功能。
- 流式对话（Streaming Token/Audio）。
- 性能深度优化与 PWA 离线能力。
- 多角色支持。

### 0.3 关键前置：Web 侧“资源可访问”策略（阻塞项）
Three.js 的 `FileLoader`/`TextureLoader` 在浏览器侧只能通过 **URL** 拉取资源；因此仓库根目录的 `assets/`、`configs/` 并不会自动被 Next.js 对外提供。

**P2 必须明确并落地一种策略（推荐优先级从上到下）：**
- **方案 A（最简单）**：将 P2 需要的 PMX/VMD/贴图/manifest **复制或映射到 `web/public/`**，通过 `/assets/...` 或 `/mmd/...` 访问。
- 方案 B：用 Next.js `route handler` 将文件作为静态资源代理输出（实现复杂度更高）。

**额外注意（真实风险点）**：
- 动作与贴图路径包含日文/中文文件名，URL 侧要确保 `encodeURI`/路径编码一致。
- PMX 内部贴图引用多为相对路径；必须验证 `resourcePath`/贴图查找根目录是否正确（否则“模型加载成功但贴图全丢”）。

---

## 1. 当前状态分析（P1 产物）

### 1.1 已有前端组件
| 组件 | 文件 | 现状 |
|------|------|------|
| Viewport3D | `components/Viewport3D.tsx` | R3F Canvas + SunnyBubble 占位体 + 灯光系统 |
| avatarStore | `lib/store/avatarStore.ts` | 简化版，仅 `sceneStatus` 和 `emotion` |
| pipelineStore | `lib/store/pipelineStore.ts` | 含 `stage`, `lipSyncEnergy`, `avatarAnimation` |

### 1.2 已有资产
- **MMD 模型**：`assets/models/Phainon/星穹铁道—白厄3.pmx` + 完整贴图
- **MMD 动作**：已解压至 `assets/motions/phainon/raw/`，共 5 个 zip 包
- **动作台账**：`docs/assets/mmd-motion-registry.md`（完整资产登记）
- **动作清单**：`configs/motions/phainon-motion-manifest.yaml`（状态映射）

### 1.3 技术栈
- Next.js 15 + React 19 + TypeScript
- React Three Fiber (R3F) 9.x + drei 10.x
- Three.js 0.171
- Zustand（状态管理）

---

## 2. P2 任务拆解

### Phase A：MMD 基础依赖与加载器（预计 1-2 个工作单元）

#### A1. MMD 技术方案确认（重要修正）
**调研结论（以当前仓库 three@0.171.0 源码为准）**：
- Three.js 内置的 `MMDLoader` / `MMDAnimationHelper` 在 r171 已明确 `deprecated`，并在控制台提示 **r172 将移除**。
- 源码提示的迁移目标为 `takahirox/three-mmd-loader`（外部仓库）。

**P2 策略**：先用 `three@0.171.0` 内置实现快速验证“能跑通”，但必须 **锁定 three 版本** 并准备后续 **vendor/fork** 或迁移。

**技术方案**：
- 短期（P2）：使用 `three@0.171.0` 内置的 `MMDLoader`（`three/examples/jsm/loaders/MMDLoader.js`）与 `MMDAnimationHelper`（`three/examples/jsm/animation/MMDAnimationHelper.js`）。
- 长期（P3+）：将 MMD 相关模块 **vendor 到仓库** 或迁移到 `takahirox/three-mmd-loader`（避免 r172+ 直接不可用）。
- **P2 阶段禁用物理**：`MMDAnimationHelper.add(mesh, { physics: false })`，避免引入/加载 `ammo.js`。

**⚠️ 关键限制**：
- Three.js r172 起已完全移除 MMD 模块
- 当前使用 r171，短期内可用但已标记 deprecated
- 长期方案：P2 完成后需将 MMDLoader 相关代码 fork 到本地

**改动文件（建议写进实施动作）**：
- 建议将 `web/package.json` 中 `three` 从 `^0.171.0` **锁定为 `0.171.0`**（去掉 `^`），避免误升级到 r172+ 导致 MMD 模块直接缺失。

```typescript
// 实际使用方式
import { MMDLoader } from 'three/examples/jsm/loaders/MMDLoader.js';
import { MMDAnimationHelper } from 'three/examples/jsm/animation/MMDAnimationHelper.js';
```

#### A2. MMD 加载器封装
**目标**：创建类型安全的 MMD 加载工具函数，封装 Three.js MMDLoader。

新增文件：`web/src/lib/mmd/mmd-loader.ts`

功能：
- `loadPMX(modelUrl: string)`：加载 PMX，返回 `THREE.SkinnedMesh`。
- `loadVMDAnimation(vmdUrls: string | string[], mesh: THREE.SkinnedMesh)`：加载 VMD 并 **基于 mesh 生成可播放的 `THREE.AnimationClip`**（注意：VMD 动作轨道需要“fit 到模型骨骼”，因此必须传入 mesh）。
- 可选：`loadWithAnimation(modelUrl, vmdUrls)` 用于最小 Demo（一次性拿到 mesh + clip）。
- 统一的错误边界与加载进度回调（ProgressEvent）。
- 资源路径处理：可配置 `resourcePath`（贴图查找根目录），并对包含中文/日文的 URL 做 `encodeURI`（避免 404/解码差异）。

接口设计：
```typescript
interface MMDLoadOptions {
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  resourcePath?: string; // 贴图/外部资源根路径（通常指向 web/public 下的模型目录）
}

export function loadPMX(
  modelUrl: string,
  options?: MMDLoadOptions
): Promise<THREE.SkinnedMesh>;

export function loadVMDAnimation(
  vmdUrls: string | string[],
  mesh: THREE.SkinnedMesh,
  options?: MMDLoadOptions
): Promise<THREE.AnimationClip>;
```

#### A3. MMD 动画管理器
**目标**：管理动作播放、切换与 crossfade，适配 R3F 的 useFrame。

新增文件：`web/src/lib/mmd/mmd-animation.ts`

核心设计：
- `MMDAnimationHelper` 是 Three.js 提供的辅助类，用于播放 MMD 动画（含 IK、Morph）
- **禁用物理**：`helper.add(mesh, { animation: clip, physics: false })`，否则会触发 `Ammo` 相关错误。
- 为了保留 IK/Grant 的正确性，优先让 `MMDAnimationHelper` 持有其内部 `AnimationMixer`；crossfade 通过 `helper.objects.get(mesh).mixer` 拿到 mixer 来做 `clipAction()` 与 `crossFadeFrom()`/`crossFadeTo()`。
- Crossfade 使用标准 Three.js：`next.reset().fadeIn(t); current.crossFadeTo(next, t, false)`（或 `crossFadeFrom`）。

功能：
- `MMDAnimationManager` 类（建议每个 `MMDCharacter` 实例一个，避免全局单例耦合）。
- `registerClip(name: string, clip: AnimationClip): void`：缓存已加载的 `AnimationClip`。
- `play(name: string, fadeDuration?: number): void`：播放指定动作（自动 crossfade）。
- `stop(name?: string): void`：停止动作
- `update(delta: number): void`：每帧更新（在 useFrame 中调用）
- `setLipSync(energy: number, morphs?: LipSyncMorphs): void`：驱动口型 Morph（内部调用 `LipSyncController`）。
- `dispose(): void`：清理资源

状态机集成：
- 监听 `pipelineStore.stage` 变化，自动切换动作
- 监听 `pipelineStore.lipSyncEnergy`，驱动口型权重

---

### Phase B：MMD 角色组件开发（预计 2-3 个工作单元）

#### B1. MMDCharacter 组件
**目标**：R3F 组件封装 MMD 模型渲染。

新增文件：`web/src/components/MMDCharacter.tsx`

功能：
- 接收 `modelPath` 和 `motionManifest` props
- 内部管理 PMX 加载状态（loading/ready/error）
- 集成 `MMDAnimationManager`
- 响应 `pipelineStore.stage` / `pipelineStore.avatarAnimation` 切换动作（优先以 `stage` 为强制态）
- 响应 `pipelineStore.lipSyncEnergy` 驱动口型

#### B2. 口型同步系统（LipSync）
**目标**：将音频能量映射到 MMD 口型 Morph。

新增文件：`web/src/lib/mmd/lipsync.ts`

功能：
- `LipSyncController` 类
- 定义口型 Morph 映射表（需根据实际模型确认）
- `update(energy: number)`：根据能量值计算口型权重
- 支持口型平滑过渡（线性插值，避免突变）
- `reset(): void`：播放结束后归零

**⚠️ 关键前提**：需先确认白厄 PMX 模型的 Morph 名称
```typescript
// 常见口型 Morph 名称（需实际验证）
const DEFAULT_LIP_MORPHS = {
  a: 'あ',      // 或 'a'
  i: 'い',      // 或 'i'  
  u: 'う',      // 或 'u'
  e: 'え',      // 或 'e'
  o: 'お',      // 或 'o'
};

// 实际方案：能量 -> 单一 a 口型（简化版）
// 如果模型只有简单的口型 Morph，可只用 'あ' 一个
```

口型映射策略（简化版推荐）：
| 能量区间 | 口型权重 | 说明 |
|---------|---------|------|
| 0.0-0.1 | 0.0 | 闭嘴（休息） |
| 0.1-0.3 | 0.3 | 微张 |
| 0.3-0.6 | 0.6 | 半张 |
| 0.6-1.0 | 1.0 | 大张 |

**实现注意**：
- 通过 `mesh.morphTargetDictionary[morphName]` 获取索引，写入 `mesh.morphTargetInfluences[index]` 设置权重
- 需要平滑过渡：`currentWeight = lerp(currentWeight, targetWeight, 0.2)`

#### B3. 动作状态机
**目标**：根据 pipeline stage 自动切换动作。

新增文件：`web/src/lib/mmd/motion-state-machine.ts`

状态映射（基于 `phainon-motion-manifest.yaml`）：
| Pipeline Stage | 动作状态 | 候选动作 |
|---------------|---------|---------|
| idle | Idle | phainon_ot0510_standby_019 (素立ち+まばたき) |
| recording | Listening | phainon_ot0510_standby_007 (両手後ろ+まばたき) |
| uploading | Thinking | phainon_armcross_ia_001 (腕組み) |
| processing | Thinking | phainon_ot0510_standby_017 (猫背+まばたき) |
| speaking | Speaking | phainon_bg_loop_chat_003 (会話モーション) |
| error | Error | phainon_dogeza_002 (土下座) |

功能：
- `MotionStateMachine` 类
- `onStageChange(stage: PipelineStage)`：状态切换回调
- 自动处理动作循环与 crossfade
- 支持动作优先级与 fallback
- 建议明确优先级：`pipelineStore.stage`（录音/说话等强制态） > `pipelineStore.avatarAnimation`（idle/listen/think/speak） > 默认 Idle

---

### Phase C：Viewport3D 集成与场景升级（预计 1-2 个工作单元）

#### C1. Viewport3D 重构
**目标**：将 SunnyBubble 替换为 MMDCharacter，保留降级能力。

改动文件：`web/src/components/Viewport3D.tsx`

改动内容：
- 条件渲染：MMD 加载成功显示角色，失败/加载中显示 SunnyBubble
- 集成 `MMDCharacter` 组件
- 传递 `modelPath` 和 `motionManifest`
- 添加模型加载进度指示

#### C2. 场景灯光优化
**目标**：为 MMD 角色材质优化灯光。

改动文件：`web/src/components/Viewport3D.tsx`

优化点：
- 主光强度/角度调整（适配 MMD 材质）
- 添加轮廓光（Rim Light）突出角色边缘
- 环境光强度微调
- 可选：添加柔和阴影

#### C3. avatarStore 扩展
**目标**：扩展 avatarStore 支持 MMD 相关状态。

改动文件：`web/src/lib/store/avatarStore.ts`

新增状态：
- `modelStatus: 'loading' | 'ready' | 'error'`
- `currentMotion: string`（当前播放的动作 ID）
- `modelProgress: number`（加载进度 0-100）
- `setModelStatus`, `setCurrentMotion`, `setModelProgress`

---

### Phase D：动作资产管道化（预计 1 个工作单元）

#### D1. 动作路径解析器
**目标**：根据 manifest 解析动作文件路径。

新增文件：`web/src/lib/mmd/motion-manifest.ts`

功能：
- `MotionManifestLoader` 类
- 加载 `configs/motions/phainon-motion-manifest.yaml`（注意：浏览器侧需要能通过 URL 访问；推荐将该文件复制到 `web/public/` 下）
- 根据状态获取候选动作列表
- 按优先级排序，返回最佳候选
- 处理 fallback 逻辑

**实现方式（P2 推荐）**：
- 为避免引入复杂构建链，P2 可选其一：
  - 方案 A：前端引入轻量 YAML 解析依赖（例如 `yaml`），`fetch('/.../phainon-motion-manifest.yaml')` 后解析。
  - 方案 B：将 manifest 转为等价 JSON（由脚本/手工生成），前端直接 `fetch` JSON（依赖更少，但要防止与 YAML 漂移）。

#### D2. 动作预加载策略
**目标**：优化动作加载性能。

新增文件：`web/src/lib/mmd/motion-cache.ts`

功能：
- `MotionCache` 类
- 预加载常用动作（Idle/Speaking/Listening）
- LRU 缓存策略
- 内存管理（限制缓存数量）

---

### Phase E：测试与验收（预计 1 个工作单元）

#### E1. 功能测试
- PMX 模型正常加载与显示
- VMD 动作正常播放
- 动作切换 crossfade 平滑
- 口型同步响应 lipSyncEnergy
- 状态机根据 pipeline stage 正确切换动作

#### E2. 性能测试
- 目标帧率：桌面 >= 60 FPS，移动端 >= 30 FPS
- 内存占用监控
- 加载时间：首次模型加载 <= 5s（本地）

#### E3. 降级测试
- 模型加载失败时显示 SunnyBubble
- 动作加载失败时使用 fallback
- 低性能设备禁用复杂效果

---

## 3. 文件改动清单（预估）

### 新增文件
| 文件路径 | 说明 |
|---------|------|
| `web/src/lib/mmd/mmd-loader.ts` | PMX/VMD 加载器封装 |
| `web/src/lib/mmd/mmd-animation.ts` | MMD 动画管理器 |
| `web/src/lib/mmd/lipsync.ts` | 口型同步控制器 |
| `web/src/lib/mmd/motion-state-machine.ts` | 动作状态机 |
| `web/src/lib/mmd/motion-manifest.ts` | 动作清单解析器 |
| `web/src/lib/mmd/motion-cache.ts` | 动作缓存管理 |
| `web/src/components/MMDCharacter.tsx` | MMD 角色 R3F 组件 |
| `web/src/components/ModelLoadingIndicator.tsx` | 模型加载进度指示器 |

### 改动文件
| 文件路径 | 改动范围 |
|---------|---------|
| `web/package.json` | 无需改动（MMD 依赖已内置在 three@0.171） |
| `web/src/components/Viewport3D.tsx` | 集成 MMDCharacter，条件渲染 |
| `web/src/lib/store/avatarStore.ts` | 扩展 MMD 相关状态 |
| `web/src/lib/api/types.ts` | 添加 MMD 相关类型定义 |

---

## 4. 执行顺序建议

```
Phase A（基础依赖）─────────────────────────────────────┐
  ├─ A1 技术方案确认（已完成调研）                        │
  ├─ A2 MMD 加载器封装                                   │
  └─ A3 MMD 动画管理器                                   │
                                                        │
Phase B（角色组件）─────────────────────────────────────┤
  ├─ B1 MMDCharacter 组件                                │
  ├─ B2 口型同步系统                                     │  可并行
  └─ B3 动作状态机                                       │
                                                        │
Phase C（集成升级）─────────────────────────────────────┤
  ├─ C1 Viewport3D 重构                                  │
  ├─ C2 场景灯光优化                                     │
  └─ C3 avatarStore 扩展                                 │
                                                        │
Phase D（资产管道）─────────────────────────────────────┤
  ├─ D1 动作路径解析器                                   │
  └─ D2 动作预加载策略（可选，P2 MVP 可延后）             │
                                                        │
Phase E（测试验收）─────────────────────────────────────┘
  ├─ E1 功能测试
  ├─ E2 性能测试
  └─ E3 降级测试
```

**⚠️ 关键路径说明**：
- A2 → B1 → C1 是主路径，必须按序执行
- B2 口型同步可以延后（仅影响说话时的嘴型，不影响动作）
- D2 缓存策略属于优化项，P2 MVP 可先使用实时加载，后续迭代优化

整体工作量预估：6-8 个工作单元。

---

## 5. 关键设计决策

### 5.1 物理模拟策略
**决策**：P2 阶段禁用物理模拟（刚体/布料）。

理由：
- 物理模拟复杂度高，需要 Ammo.js 等 wasm 库
- 移动端性能压力大
- 白厄模型服装简单，静态渲染效果可接受
- P3 再评估是否启用物理

### 5.2 动作循环策略
**决策**：循环动作使用 `LoopRepeat`，非循环动作播放一次后自动回到 Idle。

实现：
- Idle/Listening/Speaking 等持续状态使用循环动作
- Error 等非持续状态播放一次后自动过渡回 Idle

### 5.3 口型驱动策略
**决策**：基于 `lipSyncEnergy` 直接驱动 Morph 权重，不解析音素。

理由：
- 当前后端只返回能量值，无音素信息
- 简化实现，降低复杂度
- 效果可接受（能量高 = 口型张得大）

### 5.4 降级策略
**决策**：三层降级机制。

```
Level 1: MMD 模型 + VMD 动作（完整体验）
    ↓ 模型加载失败
Level 2: SunnyBubble + 颜色/动画（基础体验）
    ↓ 3D 完全失败
Level 3: 2D 角色立绘/静态图（保底体验）
```

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|-----|-----|-----|---------|
| MMDLoader 被标记 deprecated，r172 起移除 | 高 | 高 | P2 完成后将 MMDLoader fork 到本地；锁定 three@0.171 不升级 |
| PMX 模型加载性能差 | 中 | 高 | 预加载、LOD、贴图压缩、WebP 转换 |
| VMD 动作与模型骨骼不匹配 | 中 | 高 | 使用标准骨骼动作（ot0510 系列）；测试验证每个动作；准备 fallback |
| 移动端性能不达标 | 高 | 高 | 禁用物理、降低渲染质量、启用降级到 SunnyBubble |
| 口型同步效果差（找不到 morph） | 中 | 中 | 提前用 MMD4Mecanim/Blender 检查模型 morph；准备只用单一口型的降级方案 |
| 贴图路径解析错误 | 中 | 中 | 确认 PMX 中贴图路径是相对路径；必要时修复 PMX 文件或使用路径映射 |

---

## 7. 验收标准

### 7.1 功能验收
- [ ] PMX 模型正常加载并显示在 Viewport3D 中
- [ ] VMD 动作正常播放，无卡顿
- [ ] 动作切换 crossfade 平滑（过渡时间 0.3-0.5s）
- [ ] 口型 Morph 响应 lipSyncEnergy 变化
- [ ] 状态机根据 pipeline stage 自动切换动作
- [ ] 模型加载失败时自动降级到 SunnyBubble

### 7.2 性能验收
- [ ] 桌面端 >= 60 FPS
- [ ] 移动端 >= 30 FPS
- [ ] 首次模型加载 <= 5s（本地）
- [ ] 内存占用 <= 200MB（单角色）

### 7.3 质量门禁
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] 无 console.error 输出（dev 模式 warn 可接受）

---

## 8. 依赖与前置条件

### 8.1 外部依赖
**无需额外安装**，使用 three@0.171 内置模块：
- `three/examples/jsm/loaders/MMDLoader.js`：PMX 模型加载
- `three/examples/jsm/animation/MMDAnimationHelper.js`：MMD 动画辅助
- `three/examples/jsm/libs/mmdparser.module.js`：MMD 数据解析
- `three/examples/jsm/shaders/MMDToonShader.js`：Toon 着色器（可选）

### 8.2 内部依赖
- P1 完成的 Viewport3D 基础场景
- P1 完成的 avatarStore/pipelineStore
- `phainon-motion-manifest.yaml` 动作清单
- `assets/models/Phainon/` PMX 模型与贴图
- `assets/motions/phainon/raw/` VMD 动作文件

### 8.3 技术预研项
**已完成**：
- [x] 通过 three@0.171.0 源码确认：`MMDLoader`/`MMDAnimationHelper` 已 `deprecated`，且提示 r172 移除；P2 必须锁定 three 版本并准备 vendor/fork 或迁移路线。

**P2 启动前必须完成**：
- [ ] 确认白厄 PMX 模型的 Morph 名称（用 Blender/MMD4Mecanim 检查）
- [ ] 验证主模型在 MMDLoader 中能否正常加载（编写最小可复现代码）
- [ ] 验证至少 3 个关键动作（Idle/Speaking/Listening）能否正常播放
- [ ] 测试模型加载时间（本地开发环境）
- [ ] 验证贴图/材质是否完整（含 `.tga` 等格式），并确认 PMX 贴图相对路径在 Web 资源目录下可正确解析

---

## 9. 附录

### 9.1 模型文件清单
```
assets/models/Phainon/
├── 星穹铁道—白厄3.pmx    # 主模型文件
├── 剑.pmx                # 武器模型（可选）
├── 颜.png                # 面部贴图
├── 颜赤.tga              # 面部红晕贴图
├── 髪.png                # 头发贴图
├── 衣.png / 衣2.png / 衣3.png  # 服装贴图
├── 武器.png              # 武器贴图
├── 黑.jpg / 234.jpg      # 其他贴图
├── toon3.png / toon4.png / toon5.png  # Toon 贴图
└── 使用规则.txt          # 使用规约
```

### 9.2 动作状态映射参考
详见 `configs/motions/phainon-motion-manifest.yaml`

### 9.3 口型 Morph 名称参考（需根据实际模型确认）
```typescript
const LIP_SYNC_MORPHS = {
  a: 'あ',  // 张口
  i: 'い',  // 咧嘴
  u: 'う',  // 嘟嘴
  e: 'え',  // 微笑嘴
  o: 'お',  // 圆口
};
```
