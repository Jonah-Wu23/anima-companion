# 强逻辑AI - 换装加载/卸载/重绑定实现提示词

## 任务目标
实现MMD模型的**完整换装系统**，包括：
1. **模型dispose** - 清理当前模型资源
2. **贴图缓存管理** - 避免重复加载
3. **动画重绑定** - 新模型继承当前动画状态
4. **内存监控** - 防止换装导致的内存泄漏

---

## 前置条件

### 当前架构理解
- **MMDLoader**: `web/src/lib/vendor/mmd/MMDLoader.js` (已Fork)
- **动画管理**: `web/src/lib/mmd/mmd-animation.ts`
- **角色组件**: `web/src/components/MMDCharacter.tsx`
- **换装Store**: `web/src/lib/store/wardrobeStore.ts`
- **模型配置**: `web/src/lib/wardrobe/model-registry.ts`

### 模型资产位置 (已迁移完成)
```
assets/models/
├── Phainon/                          # 基础白厄
├── Phainon_Khaslana_normal/          # 卡厄斯兰那(法线版)
├── Phainon_Khaslana/                 # 卡厄斯兰那(完整)
├── Phainon_Demiurge/                 # 德谬歌-白厄
├── Phainon_IronTomb_White/           # 铁墓白
├── Phainon_Agent_White/              # 特工白厄
├── Phainon_Agent_Black/              # 秘密特工黑厄
├── Phainon_CaptainUniform/           # 机长制服
├── Phainon_LuckinCollab/             # 瑞幸联动
├── Phainon_ANAN_Magazine/            # ANAN杂志
├── Phainon_Goddess/                  # 白厄女神(娘化)
├── Phainon_Lady/                     # 白厄女士
```

---

## 核心任务分解

### 1. 模型加载器增强

**文件**: `web/src/lib/mmd/mmd-loader.ts`

需要增强的功能：

```typescript
interface ModelLoadOptions {
  modelId: string;
  pmxPath: string;
  onProgress?: (progress: number) => void;
  useTextureCache?: boolean;
}

interface TextureCache {
  get(key: string): THREE.Texture | undefined;
  set(key: string, texture: THREE.Texture): void;
  clear(): void;
  size: number;
}

class EnhancedMMDLoader {
  // 贴图缓存实例
  private textureCache: TextureCache;
  
  // 当前加载的模型引用
  private currentModel: THREE.SkinnedMesh | null;
  
  // 加载新模型
  async loadModel(options: ModelLoadOptions): Promise<THREE.SkinnedMesh>;
  
  // 安全dispose当前模型
  disposeCurrentModel(): void;
  
  // 获取当前模型状态
  getCurrentModel(): THREE.SkinnedMesh | null;
}
```

**关键点**:
- 使用THREE.Cache或自定义Map缓存贴图
- dispose时调用texture.dispose()释放GPU内存
- 记录加载的texture引用，避免重复释放

### 2. 动画状态快照与恢复

**文件**: `web/src/lib/mmd/mmd-animation.ts`

```typescript
interface AnimationSnapshot {
  // 当前播放的动作名称
  currentMotion: string;
  
  // 当前播放时间位置
  currentTime: number;
  
  // 循环状态
  isLooping: boolean;
  
  // 权重状态(用于crossfade)
  weights: Record<string, number>;
  
  // Morph状态
  morphs: Record<string, number>;
}

class MMDAnimationManager {
  // 在切换模型前捕获状态
  captureSnapshot(): AnimationSnapshot;
  
  // 在新模型上恢复状态
  restoreSnapshot(snapshot: AnimationSnapshot, targetMesh: THREE.SkinnedMesh): void;
  
  // 转移动画绑定到新mesh
  transferAnimations(fromMesh: THREE.SkinnedMesh, toMesh: THREE.SkinnedMesh): void;
}
```

**关键点**:
- 骨骼名称映射检查(不同模型可能骨骼命名不同)
- Morph名称验证(P2已确认使用`あ`作为口型Morph)
- 保持动画播放的连续性

### 3. MMDCharacter组件改造

**文件**: `web/src/components/MMDCharacter.tsx`

需要实现的功能：

```typescript
interface MMDCharacterProps {
  // 新增: 模型切换控制
  modelId?: string;
  onModelLoadStart?: () => void;
  onModelLoadProgress?: (progress: number) => void;
  onModelLoadComplete?: () => void;
  onModelLoadError?: (error: Error) => void;
}

// 组件内部状态扩展
interface CharacterState {
  // 当前加载的模型ID
  loadedModelId: string | null;
  
  // 切换状态
  isSwitching: boolean;
  
  // 错误状态
  error: Error | null;
}
```

**渲染流程**:
1. 监听`modelId` prop变化
2. 触发卸载流程(dispose旧模型)
3. 加载新模型(带进度回调)
4. 恢复动画状态
5. 通知完成

### 4. 内存监控与保护

```typescript
// web/src/lib/mmd/memory-monitor.ts

interface MemoryStats {
  // THREE.js渲染器信息
  rendererInfo: THREE.WebGLRendererInfo;
  
  // 贴图数量
  textureCount: number;
  
  // 几何体数量
  geometryCount: number;
  
  // 材质数量
  materialCount: number;
}

class MemoryMonitor {
  // 获取当前内存统计
  getStats(): MemoryStats;
  
  // 检查是否需要强制GC提示
  shouldForceCleanup(): boolean;
  
  // 打印内存报告
  logMemoryReport(): void;
  
  // 切换模型前后的对比
  compareBeforeAfter(before: MemoryStats, after: MemoryStats): MemoryDelta;
}
```

---

## 详细实现要求

### Dispose流程 (关键!)

当卸载模型时，必须按顺序释放资源：

```typescript
function disposeMMDModel(mesh: THREE.SkinnedMesh): void {
  // 1. 停止动画
  animationHelper.remove(mesh);
  
  // 2. 遍历材质
  mesh.material.forEach((material: THREE.Material) => {
    // 释放贴图
    Object.entries(material).forEach(([key, value]) => {
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    });
    
    // 释放材质
    material.dispose();
  });
  
  // 3. 释放几何体
  mesh.geometry.dispose();
  
  // 4. 清除引用
  mesh.clear();
}
```

### 贴图缓存策略

```typescript
class TextureCache {
  private cache = new Map<string, THREE.Texture>();
  private maxSize = 50; // 最大缓存数量
  
  get(key: string): THREE.Texture | undefined {
    const texture = this.cache.get(key);
    if (texture) {
      // 更新使用顺序(LRU)
      this.cache.delete(key);
      this.cache.set(key, texture);
    }
    return texture;
  }
  
  set(key: string, texture: THREE.Texture): void {
    // LRU淘汰
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      const oldTexture = this.cache.get(firstKey);
      oldTexture?.dispose();
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, texture);
  }
  
  // 切换模型时不清空，保持跨模型缓存
  clear(): void {
    this.cache.forEach((texture) => texture.dispose());
    this.cache.clear();
  }
}
```

### 动画重绑定

不同模型的骨骼结构可能略有差异，需要：

```typescript
function transferAnimations(
  sourceMesh: THREE.SkinnedMesh,
  targetMesh: THREE.SkinnedMesh,
  snapshot: AnimationSnapshot
): void {
  // 1. 验证骨骼兼容性
  const sourceBones = sourceMesh.skeleton.bones.map(b => b.name);
  const targetBones = targetMesh.skeleton.bones.map(b => b.name);
  
  const missingBones = sourceBones.filter(b => !targetBones.includes(b));
  if (missingBones.length > 0) {
    console.warn(`目标模型缺少骨骼: ${missingBones.join(', ')}`);
  }
  
  // 2. 重建动画绑定
  // ... 具体实现参考 mmd-animation.ts
  
  // 3. 恢复时间位置
  // ...
}
```

---

## 与强视觉AI的协作边界

### 强视觉AI已完成的职责
1. ✅ 模型资产登记与迁移
2. ✅ 换装UI界面 (`/wardrobe`)
3. ✅ 模型选择交互
4. ✅ 加载状态UI
5. ✅ 预览/确认流程

### 强逻辑AI的职责
1. 🔄 模型加载器的dispose逻辑
2. 🔄 贴图缓存系统
3. 🔄 动画状态保存/恢复
4. 🔄 内存监控
5. 🔄 错误处理与降级

### 协作接口

```typescript
// WardrobeStore提供的接口 (强视觉AI)
interface WardrobeActions {
  switchModel(modelId: string): Promise<void>;
  setLoadingProgress(progress: number): void;
  setStatus(status: WardrobeStatus): void;
  setErrorMessage(message: string | null): void;
}

// 需要强逻辑AI实现的回调
interface ModelLoaderCallbacks {
  onProgress: (progress: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}
```

---

## 验收标准

### 功能验收
- [ ] 切换模型时旧模型资源完全释放(dispose)
- [ ] 贴图缓存正常工作，相同贴图不重复加载
- [ ] 动画状态在切换后保持连续性
- [ ] 加载进度准确反馈到UI
- [ ] 错误时优雅降级，不崩溃

### 性能验收
- [ ] 切换模型时间 < 3秒 (不包含下载)
- [ ] 内存占用不持续增长
- [ ] 连续切换10次无明显卡顿
- [ ] GPU内存释放验证(通过chrome devtools)

### 质量门禁
- [ ] `npm run typecheck:web` 通过
- [ ] 无内存泄漏告警
- [ ] 错误边界处理完善

---

## 技术风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 骨骼不兼容导致动画异常 | 高 | 切换前验证骨骼映射，缺失时fallback到idle |
| dispose不彻底导致内存泄漏 | 高 | 内存监控对比测试，严格dispose检查 |
| 贴图缓存过大 | 中 | LRU策略限制缓存数量，提供手动清理 |
| 大模型加载阻塞UI | 中 | 使用requestIdleCallback分帧加载 |

---

## 参考文件

- `docs/assets/models/*.md` - 模型登记文档
- `web/src/lib/wardrobe/model-registry.ts` - 模型配置
- `web/src/lib/store/wardrobeStore.ts` - 换装状态
- `web/src/components/MMDCharacter.tsx` - 角色组件
- `web/src/lib/mmd/mmd-loader.ts` - 加载器
- `web/src/lib/mmd/mmd-animation.ts` - 动画管理

---

**提示词版本**: v1.0
**创建日期**: 2026-02-16
**执行者**: 强逻辑AI
