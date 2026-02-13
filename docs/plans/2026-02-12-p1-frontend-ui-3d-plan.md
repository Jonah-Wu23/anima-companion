# Implementation Plan. Task List and Thought in Chinese — P1：前端 UI 设计 + 3D 界面初步搭建

## 0. 定位与边界

### 0.1 P1 做什么
- **前端 UI 视觉重设计**：将 P0 的功能性 UI 升级为高美观度、情感一致的完整界面。
- **3D 场景框架搭建**：建立基础 3D 场景环境（灯光、背景、相机、氛围），保留占位体并升级其视觉表现，为 P2 加载 MMD 角色做好场景侧准备。
- **纯前端**：不改动 `server/`，不新增后端接口，所有改动限于 `web/` 和 `docs/`。

### 0.2 P1 不做什么（留给 P2）
- 3D 完整环境（房间、家具、光影氛围、天气系统）。
- MMD 模型（PMX）加载与渲染。
- VMD 动作加载与 crossfade 动作状态机。
- lipSyncEnergy 驱动 MMD 口型 morph。
- 复杂表情系统与高阶口型 viseme。
- 触摸互动、换装、相册等沉浸功能。
- 流式对话（Streaming Token/Audio）。
- 性能深度优化与 PWA 离线能力。

---

## 1. 当前状态分析（P0 产物）

### 1.1 已有前端组件
| 组件 | 文件 | 现状 |
|------|------|------|
| ChatShell | `components/ChatShell.tsx` | 最小容器，仅 `div` + 全屏布局 |
| TopBar | 内联在 `page.tsx` | 硬编码名称 + 版本号，无角色头像、无连接状态细节 |
| Viewport3D | `components/Viewport3D.tsx` | R3F Canvas + 占位球体，颜色/缩放按 stage 变化 |
| MessagePanel | `components/MessagePanel.tsx` | 基础气泡，无头像、无时间戳、无情绪标签 |
| InputDock | `components/InputDock.tsx` | 功能完整（文本+录音+TTS播放+口型能量），UI 朴素 |
| SettingsSheet | `components/SettingsSheet.tsx` | 功能可用，视觉一般 |
| Button/Input | `components/ui/` | 最小 UI 原子组件 |

### 1.2 已有状态管理
- `sessionStore`：会话 ID、消息列表、关系值（persist）
- `pipelineStore`：stage / error / lipSyncEnergy / avatarAnimation
- `settingsStore`：autoPlayVoice / reducedMotion

### 1.3 已有资产
- MMD 动作资产已解压至 `assets/motions/phainon/raw/`
- 动作台账：`docs/assets/mmd-motion-registry.md`
- 动作状态映射清单：`configs/motions/phainon-motion-manifest.yaml`
- 设计 Token 雏形：`globals.css` 中 `@theme` 块

### 1.4 技术栈
- Next.js (App Router) + React + TypeScript
- Tailwind CSS v4
- Zustand（状态管理）
- React Three Fiber + drei（3D）
- lucide-react（图标）

---

## 2. P1 任务拆解

### Phase A：设计系统与视觉基建（预计 1-2 个工作单元）

#### A1. 设计 Token 体系完善
**目标**：建立完整、可主题化的设计变量系统。

改动文件：`web/src/styles/globals.css`

内容：
- 扩展色板：primary / secondary / accent / neutral / success / warning / danger / surface 全系列（含 50-950 色阶）
- 定义角色主题色（白厄：晴空蓝 + 麦田金 + 奶油白 + 少量薄荷绿），确保与“青春男大/田园骑士/小太阳”的气质一致
- 间距系统：`--spacing-xs/sm/md/lg/xl/2xl`
- 圆角系统：统一 `--radius-sm/md/lg/xl/full`
- 阴影系统：`--shadow-sm/md/lg/glow`（含角色主题色发光阴影）
- 字体系统：`--font-sans/display`，字号 `--text-xs ~ 2xl`
- 过渡与缓动：`--ease-default/bounce/spring`，`--duration-fast/normal/slow`
- 毛玻璃参数：`--glass-blur/opacity`

#### A2. 全局样式与动画库
**目标**：建立可复用的动画与效果类。

改动文件：`web/src/styles/globals.css`

内容：
- 完善 `glass-panel` 类（分级：轻/中/重毛玻璃）
- 消息进入动画（fade-in + slide-up，区分左右方向）
- 状态切换微动效（scale-in、pulse-glow、shake-error）
- `prefers-reduced-motion` 媒体查询全局降级
- 安全区域适配（`safe-area-inset-*`）

#### A3. UI 原子组件升级
**目标**：丰富 `components/ui/` 基础组件库。

改动/新增文件：
- `components/ui/Button.tsx` — 增加 `ghost-glass`、`icon-circle` 变体，增加尺寸 `xs/sm/md/lg`
- `components/ui/Input.tsx` — 增加 glass 风格、focus 动效
- `components/ui/Badge.tsx`（新增）— 状态标签（在线/离线/情绪标签）
- `components/ui/Avatar.tsx`（新增）— 角色/用户头像组件（圆形 + 光环 + 在线状态点）
- `components/ui/Switch.tsx`（新增）— 从 SettingsSheet 抽取独立并优化
- `components/ui/Sheet.tsx`（新增）— 通用底部弹出面板（动画 + backdrop）

---

### Phase B：核心界面视觉重设计（预计 2-3 个工作单元）

#### B1. 页面布局重构
**目标**：重新设计主页面的空间分配与层次关系。

改动文件：`web/src/app/page.tsx`

布局方案（移动端优先）：
```
┌────────────────────────┐
│     TopBar (glass)     │  h: 56px, 毛玻璃
├────────────────────────┤
│                        │
│    Viewport3D          │  flex: 0 0 35vh ~ 45vh
│    (角色 + 场景)        │  可手势上下调整分界线
│                        │
├── 分界线（可拖拽） ──────┤
│                        │
│    MessagePanel        │  flex: 1, 可滚动
│    (消息流)             │
│                        │
├────────────────────────┤
│    InputDock (glass)   │  h: auto, 毛玻璃, safe-area
└────────────────────────┘
```

桌面端（>= 1024px）备选布局：
```
┌────────────────────────────────────┐
│           TopBar (glass)           │
├──────────────┬─────────────────────┤
│              │                     │
│  Viewport3D  │   MessagePanel      │
│  (左 40%)    │   (右 60%)          │
│              │                     │
│              ├─────────────────────┤
│              │   InputDock         │
└──────────────┴─────────────────────┘
```

#### B2. TopBar 重设计
**目标**：展示角色身份、连接状态、快捷操作。

改动：从 `page.tsx` 内联提取为 `components/TopBar.tsx`

设计要素：
- 左侧：角色迷你头像（32px 圆形）+ 角色名 + 情绪/状态副文本（如"闲聊中"/"思考中"）
- 中间：（移动端隐藏）当前对话主题/会话信息
- 右侧：设置按钮（齿轮图标）
- 背景：毛玻璃 + 底部边框 glow
- 连接状态：头像右下角状态点（绿=在线，黄=处理中，红=错误）

#### B3. MessagePanel 视觉升级
**目标**：将朴素气泡升级为高品质聊天界面。

改动文件：`components/MessagePanel.tsx`

设计要素：
- 用户消息：右对齐，主题渐变背景（晴空蓝 → 麦田金 的轻渐变，或“天蓝底 + 暖金高光”），白色文字，圆角气泡（右下圆角更小）
 - 助手消息：左对齐，毛玻璃白底，深色文字，左侧带角色迷你头像
 - 消息元信息：小字时间戳 + 情绪 Badge（如果后端返回了 emotion）
 - 空状态：居中引导文案 + 角色剪影/轮廓 + 建议话题按钮（"聊聊今天的心情"/"给我讲个故事"）
- Pipeline 状态提示升级：用骨架气泡 + 打字动画（三点跳动），而非简单的 Loader
- 滚动体验：滚动到底部时的渐变遮罩消失

#### B4. InputDock 视觉升级
**目标**：在保持现有功能不变的前提下，提升操作感与美观度。

改动文件：`components/InputDock.tsx`

设计要素：
- 整体：毛玻璃背景 + safe-area-inset-bottom
- 输入框：圆角胶囊形，内发光 focus 动效，placeholder 带角色名
- 发送按钮：主题色渐变圆形，hover 时发光
- 录音按钮：
  - 待机态：圆形浅色底 + 麦克风图标
  - 录音中：放大 + 红色脉冲环 + 波纹扩散动画 + 录音时长显示
  - 上方弹出提示条："松开发送 | 上滑取消"（半透明 pill 形）
- 处理中态：按钮组 disabled + 柔和灰化，不影响消息面板操作

#### B5. SettingsSheet 视觉优化
**目标**：统一设计语言，提升设置面板品质。

改动文件：`components/SettingsSheet.tsx`

设计要素：
- 使用新的 `Sheet` 组件作为容器（统一弹出动画 + backdrop）
- 设置项分组用卡片包裹（圆角 + 浅底 + 内间距）
- Switch 使用独立 `ui/Switch.tsx` 组件
- 危险区域视觉加强（红色边框卡片 + 确认弹窗升级）
- 底部版本信息优化

---

### Phase C：3D 场景框架搭建（预计 1-2 个工作单元）

#### C3. 基础 3D 场景搭建（核心任务）
**目标**：建立基础 3D 场景环境，升级占位体视觉表现。

改动文件：`components/Viewport3D.tsx`

场景方案：
- **背景**：渐变色天空球或柔和环境贴图（晴空蓝 + 奶油白 + 暖阳金高光；明确避开“冷蓝紫/霓虹紫”），替换 `Environment preset="city"`
- **地面**：极简圆形平台（半透明 + 柔和边缘消融）
- **灯光**：三点布光（主光/补光/轮廓光），参数为 P2 角色材质预留
- **粒子/氛围（可选）**：低密度漂浮光点，增加空间感
- **占位体视觉升级**：
  - 将当前球体改为更有设计感、但更“少年感/阳光感”的占位体（如“半透明日光泡泡/橘子汽水气泡”风格的光泽球体，或圆润的玻璃胶囊体）
  - 材质建议：奶油白底 + 天空蓝透光 + 暖金边缘高光；避免“多面水晶/神殿能量核心/仪式感几何”
  - 占位体仍响应 pipelineStore.stage（颜色/动画切换保留）
  - 占位体仍响应 lipSyncEnergy（驱动缩放/发光）
- **后处理（可选）**：轻微 Bloom 让占位体发光效果更好

#### C5. avatarStore 建立（简化版）
**目标**：为 3D 场景状态提供专用状态管理。

新增文件：`web/src/lib/store/avatarStore.ts`

状态模型：
```typescript
interface AvatarState {
  sceneStatus: 'loading' | 'ready' | 'error';  // 场景加载状态
  emotion: string;                             // 当前情绪（影响占位体颜色/动画）

  setSceneStatus: (status: SceneStatus) => void;
  setEmotion: (emotion: string) => void;
}
```

说明：
- lipSyncEnergy 保持在 pipelineStore，不迁移
- currentMotion、modelStatus 等 P2 再加

---

### Phase D：交互细节与响应式（预计 1 个工作单元）

#### D1. 响应式布局完善
**目标**：确保移动端 → 平板 → 桌面的流畅体验。

改动文件：`page.tsx`、各组件

断点策略：
- `< 768px`：单列竖排（3D 上方 35vh + 消息下方）
- `768-1023px`：单列，3D 区域可适当增高
- `>= 1024px`：双栏布局（左 3D / 右聊天）

#### D3. 加载与过渡体验（轻量版）
**目标**：补齐首屏加载与状态切换的体验。

内容：
- 首屏 loading：轻量版全屏加载页（角色名 + 淡入过渡到主界面）
- 页面切换/设置面板的过渡动画统一

说明：P1 不需要 3D 模型加载进度条（因为没有重模型），首屏 loading 做轻量版即可

---

## 3. 文件改动清单（预估）

### 新增文件
| 文件路径 | 说明 |
|---------|------|
| `web/src/components/TopBar.tsx` | 顶栏组件 |
| `web/src/components/ui/Badge.tsx` | 状态标签 |
| `web/src/components/ui/Avatar.tsx` | 头像组件 |
| `web/src/components/ui/Switch.tsx` | 开关组件 |
| `web/src/components/ui/Sheet.tsx` | 底部弹出面板 |
| `web/src/components/ui/TypingIndicator.tsx` | 打字中动画 |
| `web/src/components/LoadingScreen.tsx` | 首屏加载页（轻量版） |
| `web/src/lib/store/avatarStore.ts` | 场景状态 store（简化版） |

说明：MMD 相关文件（`MMDCharacter.tsx`、`mmd-loader.ts`、`mmd-animation.ts`）移至 P2 实现

### 改动文件
| 文件路径 | 改动范围 |
|---------|---------|
| `web/src/styles/globals.css` | 设计 Token 扩展 + 动画库 |
| `web/src/app/page.tsx` | 布局重构 + TopBar 抽取 |
| `web/src/components/Viewport3D.tsx` | 场景环境升级 + 占位体视觉升级（不涉及 MMD） |
| `web/src/components/MessagePanel.tsx` | 视觉重设计 |
| `web/src/components/InputDock.tsx` | 视觉升级（不改功能逻辑） |
| `web/src/components/SettingsSheet.tsx` | 视觉优化 + 使用新 UI 组件 |
| `web/src/components/ChatShell.tsx` | 可能增加布局逻辑 |
| `web/src/components/ui/Button.tsx` | 增加变体 |
| `web/src/components/ui/Input.tsx` | 视觉增强 |

---

## 4. 执行顺序建议

```
Phase A（设计基建）── 必须先完成
  ├─ A1 Token 体系
  ├─ A2 动画库
  └─ A3 UI 原子组件

Phase B（UI 重设计）与 Phase C（3D 场景）可并行
  ├─ Phase B                    ├─ Phase C
  │  B1 布局重构                │  C5 avatarStore（简化版）
  │  B2 TopBar                  │  C3 场景 + 占位体升级
  │  B3 MessagePanel            │
  │  B4 InputDock               │
  │  B5 SettingsSheet           │
  └──────────────┬──────────────┘
                 │
           Phase D（收尾）
             D1 响应式布局
             D3 加载体验（轻量版）
```

整体工作量从原草案的 6-9 个工作单元降至约 4-6 个工作单元，主要节省在 3D 模型加载管线上。

## 5. 关键设计决策（需确认）

### 5.1 视觉风格方向
推荐：**阳光通透毛玻璃 + 柔和渐变 + 晴空蓝/麦田金/奶油白主色**
- 与“3.4 之前的白厄（萨摩耶/邻家大男孩/小太阳）”气质匹配：干净、好脾气、带泥土与阳光的味道
- 玻璃与渐变只做“通透空气感”，避免“神性/仪式感/赛博霓虹”
- 暗色/亮色模式：P1 仅做亮色模式（正午阳光感），暗色模式留 P2

反面清单（严禁做的）：
- 冷调蓝紫主色、蓝紫渐变、电紫/霓虹紫点缀（会把气质拉向神秘与神性，偏离“青春男大”）
- 赛博霓虹、金属冷硬、宗教仪式感符号（光柱/圣像/祭坛式构图）
- 3D 环境 `Environment preset="city"` 的夜景都市氛围（偏冷硬与机械感）
- 占位体做成“多面水晶/能量核心/神殿神器”的观感

### 5.2 3D 模型来源
> 已确认 PMX 模型在 assets/models/Phainon/星穹铁道—白厄3.pmx，含完整贴图。P1 不加载该模型，P2 接入。

### 5.3 性能边界
- 移动端 3D 帧率目标：>= 30 FPS
- 模型面数上限建议：< 50k（移动端友好）
- 如果 MMD 模型性能不达标，降级策略：关闭物理 → 降低面数 → 回退球体

## 6. 验收标准

### 6.1 视觉验收
- [ ] 设计 Token 全量定义，所有组件使用变量而非硬编码颜色
- [ ] 消息气泡视觉品质对标主流 IM 应用（微信/Telegram 级别）
- [x] 毛玻璃效果在 TopBar 和 InputDock 正常渲染
- [x] 动画统一、流畅，遵守 `prefers-reduced-motion`

### 6.2 3D 验收
- [x] 3D 场景环境（灯光/背景/平台）视觉氛围到位，与 UI 设计语言统一
- [x] 占位体视觉升级完成，不再是"工程球体"观感
- [x] 5 种 stage 状态仍有对应视觉表现（颜色/动画切换）
- [x] lipSyncEnergy 仍驱动占位体变化（缩放/发光）
- [x] 场景结构为 P2 加载 MMD 模型预留了清晰的接入点

### 6.3 响应式验收
- [ ] 移动端竖屏（360-414px 宽）单手可操作
- [ ] 平板横竖屏不破版
- [ ] 桌面端 >= 1024px 布局合理（双栏或扩展单栏）

### 6.4 质量门禁
- [x] `npm run typecheck` 通过
- [x] `npm run lint` 通过
- [ ] 无 console.error 输出（dev 模式 warn 可接受）
- [ ] 首屏 LCP <= 3s（含 3D 场景初始化与占位体渲染；P1 不包含 PMX 模型加载）

## 7. 收尾归档（2026-02-12）
- 收尾文档：`docs/plans/2026-02-12-p1-frontend-ui-3d-closeout.md`
- 当前状态：`Closed`（工程收尾完成，进入 P2）
