# Implementation Plan. Task List and Thought in Chinese — P3：沉浸升级与交互增强

```
    ╔══════════════════════════════════════════════════════════════════╗
    ║                                                                  ║
    ║   ██████╗ ██████╗  ██████╗      ██╗███╗   ██╗████████╗██╗   ██╗  ║
    ║   ██╔══██╗██╔══██╗██╔═══██╗     ██║████╗  ██║╚══██╔══╝██║   ██║  ║
    ║   ██████╔╝██████╔╝██║   ██║     ██║██╔██╗ ██║   ██║   ██║   ██║  ║
    ║   ██╔═══╝ ██╔══██╗██║   ██║██   ██║██║╚██╗██║   ██║   ██║   ██║  ║
    ║   ██║     ██║  ██║╚██████╔╝╚█████╔╝██║ ╚████║   ██║   ╚██████╔╝  ║
    ║   ╚═╝     ╚═╝  ╚═╝ ╚═════╝  ╚════╝ ╚═╝  ╚═══╝   ╚═╝    ╚═════╝   ║
    ║                                                                  ║
    ║         白厄 陪伴助手 — 沉浸升级阶段 (2026-02-14)                 ║
    ║                                                                  ║
    ╚══════════════════════════════════════════════════════════════════╝
```

## 0. 定位与边界

### 0.1 P3 做什么

P3 是**"沉浸升级"**阶段，核心目标是将"功能可用"升级为"情感沉浸"。

- **VAD 免按键通话**：实现语音活性检测，用户无需按住按钮即可自然对话。
- **触摸互动系统**：点击、拖拽、悬停等交互，角色给予视觉/动作反馈。
- **情绪-动作-语音联动**：LLM 返回的情绪标签驱动表情 Morph 组合与动作强度。
- **复杂表情系统**：从单一口型升级到多 Morph 组合（眉、眼、嘴协同）。
- **换装系统**：服装、配饰、发型切换，支持多套装扮。
- **3D 房间场景**：从纯色背景升级到完整房间环境（家具、光影、氛围）。
- **回忆相册**：记录高光对话时刻，可回溯查看。
- **MMDLoader Fork**：解除 three.js 版本锁定，将 MMD 模块 vendor 到本地。

### 0.2 P3 不做什么（留给 P4）

- 流式对话（Streaming Token/Audio）—— 架构改动较大，需重构对话状态机。
- 多角色支持 —— 当前单角色体验打磨优先。
- 移动端原生封装（React Native / Flutter）—— Web/PWA 优先策略。
- AI 生成动作（Motion Generation）—— 成本与技术复杂度较高。
- 用户自定义模型上传 —— 安全与合规风险高。
- **VIP后端鉴权与充值系统** —— 当前前端门控已满足产品交互需求，P4完善安全与商业化：
  - 充值页面设计与支付流程集成
  - VIP校验下沉到后端鉴权中间件（防止直接调用API绕过前端门控）
  - 用户订阅状态持久化与过期机制

### 0.3 关键前置：P2 验收结论

根据最新P2文档：

**✅ P2 已完成项** (`2026-02-14-p2-mmd-render-fix-closure.md`):
- MMD模型加载与渲染正常
- 动作状态机5个状态（Idle/Listening/Speaking/Thinking/Error）工作正常
- 口型同步响应能量变化，提供`window.__testLipSync()`调试接口
- 头发材质泛白问题修复（MatCap加算改乘算）
- talk8动作与镜头优化完成
- **VIP模式门控系统**：三类语音能力（语音输入、文字转语音回复、完整语音链路）全部纳入VIP门控
- **文字输入语音回复链路**：新增`POST /v1/chat/text-with-voice`接口，打通"文字输入 -> LLM -> 文字回复 + 语音播报"独立路径
- **VIP弹窗UI**：非浏览器原生弹窗，风格与现有界面一致，支持一键开启VIP
- 静态校验通过（`npm run typecheck:web`）

**⚠️ P2 -> P3 遗留/待完善项**:

| 项目 | P2状态 | P3行动 |
|------|--------|--------|
| 首次加载时间实测 | ⬜ 未实测 | P3 Phase B前完成基准测试 |
| 内存占用实测 | ⬜ 未实测 | P3 Phase B前完成基准测试 |
| 帧率实测 | ⬜ 未实测 | P3 Phase B前完成基准测试 |
| Morph名称确认 | ✅ 已确认(`あ`) | 无需行动，P3可直接使用 |
| MMDLoader版本锁定 | ⬜ 待Fork | **P3 Phase A首要任务** |
| 动作与模型匹配验证 | ✅ 已验证 | 换装系统需重新验证新模型 |

**🔴 P3启动阻塞项**:
1. **MMDLoader Fork** - 必须最先完成，否则无法升级three.js
2. **性能基准测试** - 在添加新功能前记录P2性能基线

---

## 1. 当前状态分析（P2 产物）

### 1.1 已有核心能力

| 组件 | 文件 | P2 状态 |
|------|------|---------|
| MMDLoader 封装 | `lib/mmd/mmd-loader.ts` | ✅ PMX/VMD 加载，贴图解析，进度回调 |
| 动画管理器 | `lib/mmd/mmd-animation.ts` | ✅ Crossfade 过渡，LRU 缓存 |
| 口型同步 | `lib/mmd/lipsync.ts` | ✅ 能量值 -> 单一 Morph |
| 动作状态机 | `lib/mmd/motion-state-machine.ts` | ✅ Pipeline Stage 映射 |
| MMDCharacter | `components/MMDCharacter.tsx` | ✅ R3F 组件封装，头发材质修复 |
| Viewport3D | `components/Viewport3D.tsx` | ✅ MMD/SunnyBubble 条件渲染，相机前移0.95 |
| avatarStore | `lib/store/avatarStore.ts` | ✅ modelStatus, currentMotion |
| pipelineStore | `lib/store/pipelineStore.ts` | ✅ stage, lipSyncEnergy |

### 1.2 P2 技术积累（P3可直接复用）

**头发材质修复方案** (`MMDCharacter.tsx`):
- 问题：头发泛白（MatCap球面贴图加算导致过亮）
- 方案：将`髪/髪2`材质的`matcapCombine`从加算改为乘算，并禁用matcap
- 代码参考：
```typescript
if (material.name === '髪' || material.name === '髪2') {
  material.matcap = null;
  material.matcapCombine = THREE.MultiplyOperation;
  material.needsUpdate = true;
}
```

**相机构图优化** (`Viewport3D.tsx`):
- 相机沿当前朝向前移`0.95`单位，角色更近更饱满

**口型调试入口** (`InputDock.tsx`):
- 全局暴露`window.__testLipSync(energy)`，支持手动测试口型

**talk8动作优化**:
- 保留旋转姿态但取消延迟（`fadeDuration = 0`）
- 镜头前移增强（总增量`+0.5`）

### 1.2 技术栈（P3 新增）

- **VAD**: `vad-web` 或 `@ricky0123/vad` (WebRTC VAD)
- **表情系统**: 扩展 `lipsync.ts` -> `expression.ts`
- **房间场景**: `@react-three/drei` (Stage, Environment) + 自定义 GLTF
- **换装系统**: PMX 材质切换 + Morph 组合
- **状态管理**: Zustand (继续)

### 1.3 资产现状

- **模型**: `assets/models/Phainon/星穹铁道—白厄3.pmx` + 贴图完整
- **动作**: 55 个 VMD 动作已整理（5 个 zip 包）
- **动作清单**: `configs/motions/phainon-motion-manifest.json`
- **缺失**:
  - 房间场景模型（需创建或采购）
  - 服装变体（需寻找或制作）
  - 表情 Morph 映射表（需实测确认）

---

## 2. P3 任务拆解

### Phase A：技术债清偿 — MMDLoader Fork（预计 1-2 工作单元）

#### A0. P2 性能基准测试

**目标**：在添加P3新功能前，建立P2性能基线，便于后续对比。

**测试项**：

| 指标 | 测试方法 | 目标值 | 记录位置 |
|------|---------|--------|---------|
| 首次加载时间 | DevTools Network | < 5s (本地) | `docs/performance/baseline-p2.md` |
| 内存占用 | DevTools Memory | < 200MB | `docs/performance/baseline-p2.md` |
| 桌面帧率 | DevTools Performance | >= 60 FPS | `docs/performance/baseline-p2.md` |
| 移动帧率 | DevTools Performance | >= 30 FPS | `docs/performance/baseline-p2.md` |

**验收标准**：
- [ ] 完成Chrome桌面端测试
- [ ] 完成Chrome移动端模拟测试
- [ ] 数据记录到文档

**阻塞性**：⚠️ 高 - 必须在Phase B开始前完成，否则无法评估P3性能影响

---

#### A1. MMDLoader Vendor 化

**目标**：将 `three@0.171.0` 内置的 MMD 模块 fork 到本地，解除版本锁定。

**背景**：
- Three.js r172 已完全移除 MMD 模块
- 当前锁定 `three@0.171.0`，无法升级获取新特性与安全修复
- 必须将 MMDLoader/MMDAnimationHelper/mmdparser 本地化维护

**新增目录**：`web/src/lib/vendor/mmd/`

```
web/src/lib/vendor/mmd/
├── MMDLoader.js              # 从 three/examples/jsm/loaders/ 复制
├── MMDAnimationHelper.js     # 从 three/examples/jsm/animation/ 复制
├── mmdparser.module.js       # 从 three/examples/jsm/libs/ 复制
├── MMDToonShader.js          # Toon 着色器（可选）
├── README.md                 # Fork 说明与版本记录
└── patches/                  # 后续自定义补丁
    └── 0001-disable-physics-warning.patch
```

**改动文件**：

| 文件路径 | 改动 |
|---------|------|
| `web/package.json` | 恢复 `three: ^0.173.0`（或其他最新稳定版） |
| `web/src/lib/mmd/mmd-loader.ts` | 修改导入路径：`three/examples/jsm/...` -> `./vendor/mmd/...` |
| `web/src/lib/mmd/mmd-animation.ts` | 同上 |
| `web/tsconfig.json` | 如需要，添加 vendor 目录到编译范围 |

**验收标准**：
- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] MMD 模型加载、动作播放、口型同步功能正常
- [ ] three.js 可升级到最新版本（如 r173+）

---

### Phase B：交互层升级 — VAD 与触摸互动（预计 2-3 工作单元）

#### B1. VAD 免按键通话

**目标**：实现语音活性检测，用户说话时自动开始录音，停止时自动发送。

**技术选型**：`@ricky0123/vad` (WebRTC-based VAD，轻量且成熟)

**新增文件**：

| 文件路径 | 说明 |
|---------|------|
| `web/src/lib/audio/vad-recorder.ts` | VAD 封装，提供开始/停止/回调接口 |
| `web/src/lib/audio/vad-config.ts` | VAD 配置参数（阈值、缓冲时间等） |
| `web/src/components/VoiceInputDock.tsx` | 语音输入 Dock（升级自 InputDock） |

**接口设计**：

```typescript
// vad-recorder.ts
export interface VADRecorderOptions {
  onSpeechStart: () => void;
  onSpeechEnd: (audioBlob: Blob) => void;
  onVADMisfire: () => void;           // 误触发回调
  threshold?: number;                 // 检测阈值 (0-1)
  preSpeechPadFrames?: number;        // 前置缓冲 (帧数)
  redemptionFrames?: number;          // 后置缓冲 (帧数)
}

export class VADRecorder {
  start(): Promise<void>;
  stop(): void;
  isRunning(): boolean;
}
```

**UX 设计**：

```
┌─────────────────────────────────────────────────────────────┐
│  待机态                                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  🤖 白厄正在倾听...                                    │  │
│  │     [波形动画 - 轻微起伏]                               │  │
│  │                                                       │  │
│  │     直接说话，我会自动识别                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  [ 🎤 点击切换为按键模式 ]                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  说话中                                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  🔴 正在聆听...                                        │  │
│  │     [波形动画 - 随音量跳动]                             │  │
│  │                                                       │  │
│  │     [████████░░░░░░░░░░] 00:03                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  [ 说完松开自动发送 | 上滑取消 ]                              │
└─────────────────────────────────────────────────────────────┘
```

**Pipeline Store 扩展**：

```typescript
// lib/store/pipelineStore.ts
interface PipelineState {
  // ... 已有字段
  
  // P3 新增
  inputMode: 'vad' | 'push-to-talk' | 'text';  // 输入模式
  vadStatus: 'idle' | 'listening' | 'speaking' | 'processing';
  
  setInputMode: (mode: 'vad' | 'push-to-talk' | 'text') => void;
  setVADStatus: (status: PipelineState['vadStatus']) => void;
}
```

**风险与缓解**：

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| MMDLoader Fork 后兼容性差 | 中 | 高 | 完整回归测试；保留原方案回滚 |
| VAD 在中文场景效果差 | 中 | 高 | 可调参数 + 按键模式兜底 |
| ~~白厄 Morph 名称不规范~~ | ✅ 已解决 | - | P2已确认`あ`可用 |
| 房间资产找不到合适风格 | 中 | 中 | 程序生成基础房间；后续迭代 |
| 换装模型难以获取 | **高** | 中 | 社区寻找/委托/延期到P4 |
| 换装模型骨骼不兼容 | 中 | 高 | 统一骨骼标准；动作重定向 |
| 换装切换内存泄漏 | 中 | 高 | 严格dispose；内存监控 |
| 性能下降（房间+表情+物理） | 中 | 高 | 性能监控；分层降级 |
| 移动端 VAD 耗电快 | 高 | 中 | 明确提示；提供手动模式切换 |

---

## 8. 验收标准

### 8.1 功能验收

- [ ] **A1**: three.js 升级到 r173+，MMD 功能正常
- [ ] **B1**: VAD 触发准确率 > 90%，支持 VAD/按键/文本三模切换
- [ ] **B2**: 触摸交互响应延迟 < 100ms，点击头部/身体有反馈
- [ ] **C1**: 支持 5+ 种基础表情（眉/眼/嘴协同），眨眼动画自然
- [ ] **C2**: LLM 返回情绪标签，驱动表情/动作/TTS 联动
- [ ] **D1**: 房间场景渲染正常，角色与家具无穿插
- [ ] **D2**: 时间系统根据真实时间切换光照（4 个时段）
- [ ] **D3**: 可记录对话高光时刻，支持查看与删除
- [ ] **E1**: 支持至少 2 套完整模型切换（加载/卸载/重绑定动画）
- [ ] **E1-1**: 换装过程有加载指示，不卡顿
- [ ] **E1-2**: 换装后动作系统正常工作
- [ ] **E1-3**: 无内存泄漏（切换10次内存增长<50MB）

### 8.2 性能验收

- [ ] 桌面端 >= 60 FPS（房间场景 + MMD）
- [ ] 移动端 >= 30 FPS
- [ ] 内存占用 <= 300MB（含房间场景）
- [ ] VAD 启动延迟 <= 500ms
- [ ] 表情切换延迟 <= 50ms

### 8.3 质量门禁

- [ ] `npm run typecheck` 通过（0 error）
- [ ] `npm run lint` 通过（0 error / 0 warning）
- [ ] `npm run build` 通过
- [ ] P0/P1/P2 功能回归通过
- [ ] 降级机制验证通过

### 8.4 兼容性验收

- [ ] Chrome / Edge / Firefox / Safari 最新版
- [ ] iOS Safari (iPhone 12+)
- [ ] Android Chrome (Android 12+)
- [ ] 不支持 VAD 的浏览器降级到按键模式

---

## 9. 依赖与前置条件

### 9.1 外部依赖

```json
{
  "@ricky0123/vad": "^0.0.20",
  "three": "^0.173.0"
}
```

### 9.2 内部依赖

- P2 完成的 MMD 基础能力
- P1 完成的 UI 体系
- P0 完成的语音链路

### 9.3 预研项

| 预研项 | 截止时间 | 负责人 | 状态 |
|--------|---------|--------|------|
| ~~白厄 PMX Morph 清单~~ | ~~Phase C 开始前~~ | ~~开发~~ | ✅ P2已完成（`あ`已确认） |
| P2性能基准测试（加载/内存/帧率） | Phase A 结束前 | 开发 | ⬜ 待执行 |
| VAD 库技术验证 | Phase B1 开始前 | 开发 | ⬜ 待执行 |
| 房间资产采购/制作 | Phase D1 开始前 | 美术/策划 | ⬜ 待执行 |
| 换装模型资产寻找 | Phase E1 开始前 | 美术/策划 | ⬜ 待执行 |
| three.js r173 升级影响评估 | Phase A1 开始前 | 开发 | ⬜ 待执行 |

---

## 10. 工作量预估

| 阶段 | 预估工作单元 | 说明 |
|------|-------------|------|
| Phase A (技术债) | 1-2 | P2基准测试 + MMDLoader Fork |
| Phase B (交互层) | 2-3 | VAD + 触摸互动 |
| Phase C (表现层) | 2-3 | 表情系统 + 情绪联动 |
| Phase D (空间层) | 2-3 | 房间 + 时间 + 相册 |
| Phase E (换装) | 1-2 | 依赖资产 |
| Phase F (测试) | 1 | 功能 + 回归 |
| **总计** | **10-14** | ~2.5-3.5 周（单人）|

---

## 11. 附录

### 11.1 情绪标签定义

```typescript
type EmotionType = 
  | 'neutral'      // 平静
  | 'happy'        // 开心
  | 'sad'          // 悲伤
  | 'angry'        // 生气
  | 'surprised'    // 惊讶
  | 'embarrassed'  // 害羞
  | 'excited'      // 兴奋
  | 'worried';     // 担心
```

### 11.2 LLM Prompt 示例（情绪识别）

```markdown
## 情绪识别指令

在回复用户时，请分析当前对话情绪，并在返回中包含 emotion 字段。

可选情绪：neutral, happy, sad, angry, surprised, embarrassed, excited, worried

返回格式：
{
  "text": "你的回复文本",
  "emotion": "happy",
  "emotion_intensity": 0.8  // 0-1，情绪的强烈程度
}

注意：
- 情绪应与对话内容匹配
- 白厄的性格是阳光、邻家大男孩，通常保持 happy 或 neutral
- 只有在用户表达负面情绪时，白厄才会表现出 sad/worried
```

### 11.3 参考文档

- [P2 验收报告](./2026-02-13-p2-mmd-integration-acceptance.md)
- [P2 实施计划](./2026-02-13-p2-mmd-integration-plan.md)
- [P1 收尾纪要](./2026-02-12-p1-frontend-ui-3d-closeout.md)
- [实施路线图](./2026-02-09-implementation-roadmap.md)

---

## 12. P4 展望：VIP商业化与后端安全加固

基于P2已完成的VIP前端门控系统，P4将聚焦于**商业化落地**与**安全防护**两大方向：

### 12.1 P4 核心目标

| 模块 | 当前状态（P2完成） | P4目标 | 优先级 |
|------|-------------------|--------|--------|
| **前端VIP门控** | ✅ 三类语音能力已纳入门控<br>✅ 弹窗UI风格统一<br>✅ 一键开启VIP（本地状态） | 保持现状 | P3 |
| **后端鉴权中间件** | ⬜ 仅前端校验，存在API绕过风险 | 实现VIP状态后端校验，拦截未授权请求 | P4-高 |
| **充值页面** | ⬜ 弹窗仅支持"一键开启"（本地模拟） | 独立充值页面，展示套餐与支付流程 | P4-高 |
| **订阅管理** | ⬜ 无过期机制 | 用户订阅状态持久化，支持续费与过期提醒 | P4-中 |
| **支付集成** | ⬜ 未接入 | 接入微信支付/支付宝 | P4-中 |

### 12.2 P4 技术要点

**后端鉴权中间件设计**：
```python
# server/app/middleware/vip_auth.py
async def vip_required(feature: str):
    """
    装饰器：校验用户VIP状态与功能权限
    feature: 'voice_input' | 'text_to_voice' | 'voice_pipeline'
    """
    # 1. 从请求头/Token解析用户ID
    # 2. 查询用户VIP状态（缓存+DB）
    # 3. 校验功能是否在订阅范围内
    # 4. 未授权返回 403 + 具体缺失的权限
```

**受影响的后端接口**：
- `POST /v1/asr/transcribe` → 需要 `voice_input` 权限
- `POST /v1/chat/text-with-voice` → 需要 `text_to_voice` 权限  
- `POST /v1/voice/chat`（完整语音链路）→ 需要 `voice_pipeline` 权限

**充值页面路由规划**：
```
/web/src/app/vip/
├── page.tsx              # 充值主页面
├── components/
│   ├── PricingCard.tsx   # 套餐卡片
│   ├── FeatureList.tsx   # VIP特权列表
│   └── PaymentModal.tsx  # 支付弹窗
└── lib/
    └── payment.ts        # 支付SDK封装
```

### 12.3 P4 与P2/P3的衔接说明

- **P2已完成的前端门控**将继续使用，P4在其基础上增加后端兜底校验
- **P3新增的语音能力**（如VAD）也将继承VIP门控逻辑
- **用户体验保持连贯**：前端弹窗引导 -> 充值页面 -> 后端权限校验

---

**计划制定**: AI Assistant (开发编排经理)  
**制定日期**: 2026-02-14  
**版本**: P3-Plan-v1.2  
**状态**: Draft (待审核)

---

## 文档变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2026-02-14 | 初始版本 | AI Assistant |
| v1.1 | 2026-02-14 | 根据P2收尾文档更新：<br>• 换装系统改为"总体模型切换"方案<br>• 添加A0 P2性能基准测试<br>• 更新P2已完成项与遗留项<br>• 添加P2技术积累（头发修复/相机优化/口型调试）<br>• 确认Morph名称已验证（`あ`）<br>• 更新风险矩阵与验收标准 | AI Assistant |
| v1.2 | 2026-02-14 | 补充VIP相关内容：<br>• P2验收结论增加VIP模式门控与文字转语音链路<br>• P3不做什么明确P4工作范围（充值页、后端鉴权）<br>• 新增第12章P4展望，详细说明商业化与安全加固规划 | AI Assistant |

```
                              ╔═══════════════════╗
                              ║   END OF PLAN     ║
                              ╚═══════════════════╝
```
