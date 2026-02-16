# MMD Vendor Fork

此目录用于本地维护 three.js 已移除的 MMD 相关模块，解除 `three` 版本锁定。

## 来源
- 基线版本：`three@0.171.0`
- 来源文件：`node_modules/three/examples/jsm/*`
- 同步日期：`2026-02-15`

## 包含模块
- `MMDLoader.js`
- `MMDAnimationHelper.js`
- `CCDIKSolver.js`
- `MMDPhysics.js`
- `mmdparser.module.js`
- `MMDToonShader.js`

## 本地改动
- `MMDLoader.js`：改为引用本目录下的 `MMDToonShader` 和 `mmdparser`。
- `MMDAnimationHelper.js`：改为引用本目录下的 `CCDIKSolver` 和 `MMDPhysics`。
- `MMDAnimationHelper.js` / `MMDPhysics.js`：移除 deprecate `console.warn`，避免控制台噪声。

## 升级流程
1. 从目标 three 版本提取上述文件到临时目录。
2. 对比并合并上面的本地改动。
3. 更新 `patches/` 记录。
4. 运行 `npm run typecheck:web` 与 `npm run build:web` 回归。
