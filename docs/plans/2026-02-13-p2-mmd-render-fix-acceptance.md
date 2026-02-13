# P2 MMD 头发泛白修复验收记录

**日期**: 2026-02-13  
**关联文件**: `web/src/components/Viewport3D.tsx`, `web/src/components/MMDCharacter.tsx`  
**问题描述**: 角色头发区域发白，视觉上接近“材质丢失”，但无贴图 404/加载报错。

---

## 1. 另一个 AI 的改动记录（按用户提供信息归档）

### 1.1 第一轮渲染改进
- `Viewport3D.tsx`
  - 色调映射: `ACESFilmicToneMapping -> LinearToneMapping`
  - 抗锯齿: `antialias: false -> true`
  - 背景: `#EAF5FF -> #2a2a2a`
  - 光照: 引入 `Environment preset="city"`、高强度环境光、主平行光、轮廓光
  - 地面网格与全局阴影开启
- `MMDCharacter.tsx`
  - 遍历 mesh 设置 `castShadow = true`、`receiveShadow = true`

### 1.2 第二轮“WebGL 错误修复”回退
- `Viewport3D.tsx`
  - 移除 `Environment`
  - 关闭抗锯齿
  - 降低 `dpr: [1, 2] -> [1, 1.5]`
  - 移除阴影
  - 简化光照

### 1.3 第三轮亮度回调
- `Viewport3D.tsx`
  - 背景改回 `#EAF5FF`
  - 添加雾效
  - 降低光照强度（环境光 0.55，主光 1.0）
  - 色调映射改为 `NoToneMapping`
- `MMDCharacter.tsx`
  - `emissiveIntensity = 0`
  - 对过亮颜色做亮度下调

---

## 2. 本次定位结论（不改背景/曝光/布光/阴影）

### 2.1 根因
- 头发材质 `髪/髪2` 在 PMX 中使用了球面贴图加算（`envFlag = 2`）。
- 对应环境贴图 `assets/models/Phainon/1.png` 亮度极高（均值亮度约 `247/255`）。
- `MMDToonShader` 的加算逻辑会直接将该贴图颜色加到最终输出，导致浅色头发被“冲白”。

### 2.2 结论性质
- 不是贴图丢失问题（资源存在且可加载）。
- 是材质混合策略导致的过亮问题，表现上像“材质丢失”。

---

## 3. 本次修复内容（方案 A）

### 3.1 代码修改
- 文件: `web/src/components/MMDCharacter.tsx`
- 变更:
  - 新增头发材质判定（仅 `髪` / `髪2`）。
  - 仅对上述材质将 `matcapCombine` 从加算改为乘算：
    - `THREE.AddOperation -> THREE.MultiplyOperation`
  - 设置 `needsUpdate = true` 触发材质重编译。

### 3.2 约束遵守
- 未修改背景。
- 未修改曝光/色调映射。
- 未修改布光。
- 未修改阴影。

---

## 4. 验证结果

- TypeScript 检查通过：
  - 命令: `npm --workspace web run typecheck`
  - 结果: `tsc --noEmit` 通过

---

## 5. 预期效果

- 头发高光从“泛白溢出”收敛为“受控反射”。
- 保留头发细节与层次，不再接近纯白块。
- 其它材质（如金属护甲）不受本次定向修复影响。

---

## 6. 追加修复（头顶偏红 + 构图微调）

### 6.1 问题
- 在方案 A 生效后，头顶出现轻微偏红条带。

### 6.2 原因
- `髪/髪2` 仍在使用 `matcap`（`1.png`），该纹理存在暖色偏移，导致顶部法线方向出现偏红高光。

### 6.3 修复
- 文件: `web/src/components/MMDCharacter.tsx`
  - 仅对 `髪/髪2` 禁用 `matcap`（`matcap = null`），同时维持 `matcapCombine = THREE.MultiplyOperation`。
- 文件: `web/src/components/Viewport3D.tsx`
  - 相机沿当前朝向前移 `0.95` 单位，使角色更近。

### 6.4 验证
- 命令: `npm --workspace web run typecheck`
- 结果: 通过
