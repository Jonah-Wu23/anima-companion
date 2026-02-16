# 触摸互动交互设计规范

## 1. 设计目标

为3D角色（白厄）创建自然、有反馈的触摸交互体验，让用户在与角色互动时获得情感化的反馈。

## 2. 交互类型定义

### 2.1 点击互动 (Click/Tap)

| 交互区域 | 触发动作 | 视觉反馈 | 音效 | 表情 |
|---------|---------|---------|------|------|
| 头部 | 抚摸/轻拍 | 角色微微闭眼、头部倾斜 | 轻柔的确认音效 | 开心/眯眼笑 |
| 脸颊 | 捏/戳 | 脸颊变形、角色害羞 | 可爱的音效 | 害羞 |
| 肩膀 | 轻拍 | 肩膀下沉、放松 | 温和的音效 | 放松 |
| 手部 | 握手 | 手部回握动作 | 温暖的音效 | 开心 |

### 2.2 拖拽互动 (Drag)

| 交互区域 | 触发动作 | 视觉反馈 | 物理反馈 |
|---------|---------|---------|---------|
| 头部 | 抚摸滑动 | 头部跟随手指方向转动 | 惯性跟随 |
| 身体 | 拖拽移动 | 身体轻微位移 | 弹性回弹 |
| 手臂 | 摆动手臂 | 手臂摆动动画 | 重力感 |

### 2.3 悬停互动 (Hover)

| 交互区域 | 触发动作 | 视觉反馈 | 时机 |
|---------|---------|---------|------|
| 眼睛 | 注视 | 视线跟随鼠标/手指 | 100ms 延迟 |
| 头部 | 微转 | 头部转向光标方向 | 200ms 过渡 |
| 身体 | 呼吸感 | 轻微的缩放起伏 | 持续循环 |

## 3. 手势规范

### 3.1 点击手势

```typescript
interface ClickGesture {
  type: 'click' | 'doubleClick' | 'longPress';
  duration: number;      // 按压持续时间 (ms)
  pressure: number;      // 按压力度 (0-1)
  position: Vector2;     // 点击位置 (归一化 0-1)
  targetZone: HitZone;   // 命中区域
}
```

**触发阈值：**
- 单击：按下 < 300ms
- 双击：两次单击间隔 < 500ms
- 长按：按下 >= 500ms

### 3.2 拖拽手势

```typescript
interface DragGesture {
  type: 'dragStart' | 'dragMove' | 'dragEnd';
  startPosition: Vector2;
  currentPosition: Vector2;
  delta: Vector2;        // 移动差值
  velocity: Vector2;     // 移动速度
  targetZone: HitZone;
}
```

**触发阈值：**
- 开始：移动距离 > 10px
- 移动：持续追踪
- 结束：手指抬起

### 3.3 悬停手势

```typescript
interface HoverGesture {
  type: 'hoverEnter' | 'hoverMove' | 'hoverLeave';
  position: Vector2;
  duration: number;      // 悬停持续时间
  targetZone: HitZone | null;
}
```

**触发阈值：**
- 进入：停留 > 50ms
- 离开：移出 > 100ms

## 4. 命中区域 (Hit Zones)

### 4.1 区域定义

```typescript
interface HitZone {
  id: string;
  name: string;
  // 3D 空间中的简化包围盒
  bounds: {
    center: Vector3;
    size: Vector3;
  };
  // 交互优先级（高优先级区域可覆盖低优先级）
  priority: number;
  // 是否启用
  enabled: boolean;
}
```

### 4.2 角色各区域

| 区域ID | 名称 | 描述 | 优先级 | 交互类型 |
|-------|------|------|-------|---------|
| `head` | 头部 | 包括头发和脸部 | 10 | 点击、拖拽、悬停 |
| `face` | 脸部 | 眼睛、鼻子、嘴 | 9 | 点击、悬停 |
| `eyes` | 眼睛 | 左右眼 | 8 | 悬停 |
| `leftHand` | 左手 | - | 7 | 点击、拖拽 |
| `rightHand` | 右手 | - | 7 | 点击、拖拽 |
| `body` | 身体 | 躯干 | 5 | 点击、拖拽 |
| `shoulders` | 肩膀 | 双肩区域 | 6 | 点击 |

## 5. 反馈设计

### 5.1 视觉反馈

#### 涟漪效果 (Ripple)
- **触发**：点击时
- **样式**：从点击点扩散的圆形波纹
- **参数**：
  - 颜色：半透明白色 (rgba(255,255,255,0.3))
  - 扩散时间：600ms
  - 最大半径：100px
  - 缓动：ease-out

#### 缩放反馈 (Scale)
- **触发**：按下时
- **效果**：元素缩小到 0.95x
- **恢复**：松开时弹性回弹到 1x
- **时间**：按下 100ms，恢复 300ms

#### 高亮反馈 (Highlight)
- **触发**：悬停时
- **效果**：边缘发光或亮度提升
- **参数**：
  - 发光颜色：主题色 (sky-400)
  - 发光强度：0.5
  - 过渡时间：200ms

### 5.2 动画反馈

#### 表情动画

```typescript
interface ExpressionFeedback {
  emotion: EmotionType;
  intensity: number;     // 0-1
  duration: number;      // ms
  blendTime: number;     // 淡入淡出时间
}
```

**常用表情映射：**
- 点击头部：happy (0.7, 1000ms)
- 点击脸颊：embarrassed (0.8, 1500ms)
- 拖拽抚摸：relaxed (0.6, 持续)
- 快速点击：surprised (0.9, 500ms)

#### 动作动画

```typescript
interface MotionFeedback {
  motionType: string;    // 动作名称
  targetBone: string;    // 目标骨骼
  intensity: number;     // 动作强度 0-1
  speed: number;         // 播放速度
}
```

**常用动作：**
- 头部抚摸：`head_tilt` 轻微倾斜
- 身体拖拽：`body_shift` 位移
- 快速滑动：`shake_head` 摇头

## 6. 状态管理

### 6.1 交互状态

```typescript
interface TouchInteractionState {
  // 当前激活的手势
  activeGesture: Gesture | null;
  
  // 当前命中的区域
  currentHitZone: HitZone | null;
  
  // 交互历史（用于双击检测等）
  gestureHistory: Gesture[];
  
  // 冷却时间（防止过度触发）
  cooldowns: Record<string, number>;
  
  // 当前表情状态
  currentExpression: ExpressionFeedback | null;
}
```

### 6.2 状态流转

```
Idle -> HoverEnter -> HoverMove -> HoverLeave -> Idle
                  |
                  v
            ClickStart -> ClickEnd -> ExpressionFeedback
                  |
                  v (长按)
            LongPress -> ExpressionFeedback

Idle -> DragStart -> DragMove -> DragEnd -> SpringBack
```

## 7. 性能考虑

### 7.1 Raycast 优化
- 使用分层检测：先检测包围盒，再精确检测
- 节流：每 16ms (60fps) 最多一次检测
- 缓存：命中结果缓存一帧

### 7.2 动画优化
- 使用 morph target 而非骨骼动画（脸部表情）
- 动画混合：平滑过渡，避免突变
- LOD：远距离时简化交互

### 7.3 触摸优化
- 事件节流：touchmove 事件节流至 60fps
- 被动监听：使用 { passive: true }
- 防抖：resize/orientation 事件防抖

## 8. 可访问性

### 8.1 减少动画
- 检测 `prefers-reduced-motion`
- 简化或禁用非必要动画

### 8.2 替代交互
- 键盘导航支持
- 屏幕阅读器支持
- 触觉反馈替代

## 9. 实现参考

### 9.1 核心接口

```typescript
// 触摸交互上下文
interface TouchInteractionContext {
  // 注册命中区域
  registerHitZone(zone: HitZone): void;
  unregisterHitZone(zoneId: string): void;
  
  // 触发反馈
  triggerFeedback(feedback: FeedbackOptions): void;
  
  // 当前状态
  state: TouchInteractionState;
}

// 反馈选项
interface FeedbackOptions {
  type: 'ripple' | 'scale' | 'highlight' | 'expression' | 'motion';
  target: string;
  params: Record<string, unknown>;
}
```

### 9.2 使用示例

```tsx
// 在 MMDCharacter 中使用
function MMDCharacter() {
  const { registerHitZone, triggerFeedback } = useTouchInteraction();
  
  useEffect(() => {
    // 注册头部交互区
    registerHitZone({
      id: 'head',
      name: '头部',
      bounds: { center: [0, 1.6, 0], size: [0.3, 0.35, 0.3] },
      priority: 10,
      enabled: true,
    });
  }, []);
  
  const handleHeadClick = () => {
    triggerFeedback({
      type: 'expression',
      target: 'head',
      params: { emotion: 'happy', intensity: 0.8 }
    });
  };
  
  // ...
}
```

## 10. 视觉规范

### 10.1 颜色

| 用途 | 颜色值 | 透明度 |
|------|-------|-------|
| 命中区域高亮 | `#38bdf8` (sky-400) | 30% |
| 涟漪扩散 | `#ffffff` | 30% -> 0% |
| 按下反馈 | `#0ea5e9` (sky-500) | 20% |
| 悬停光晕 | `#7dd3fc` (sky-300) | 50% |

### 10.2 动画时间

| 交互类型 | 时长 | 缓动 |
|---------|------|------|
| 涟漪扩散 | 600ms | ease-out |
| 缩放反馈 | 100ms / 300ms | ease-in / spring |
| 高亮过渡 | 200ms | ease |
| 表情混合 | 300ms | ease-in-out |
| 视线跟随 | 150ms | ease-out |

---

**文档版本**: v1.0  
**更新日期**: 2026-02-15  
**作者**: 强视觉AI
