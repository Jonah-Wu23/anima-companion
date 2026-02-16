# MMD Model Registry (Phainon_ANAN_Magazine)

- model_id: `model.Phainon_ANAN_Magazine`

- 默认用途: 内部验证（internal validation only）
- 校验日期: 2026-02-14
- 规范目录名: `assets/models/Phainon_ANAN_Magazine/`（计划从 `mmd_download/models/白厄anan杂志_by_林槿_19950a785e6ca4ce6af60ddc007d863b/` 迁移）
- 来源标识: 白厄anan杂志（用户提供信息）

## 关键文件校验（当前来源：mmd_download）

| 相对路径 | 类型 | SHA256 | 备注 |
|---|---|---|---|
| `mmd_download/models/白厄anan杂志_by_林槿_19950a785e6ca4ce6af60ddc007d863b/白厄anan杂志/白厄anan杂志.pmx` | PMX | `DD6B432E1F46F610ECA3AD56C668E611A820FCA54EC49E6BBFAF70D4CF57BB48` | 主模型 |
| `mmd_download/models/白厄anan杂志_by_林槿_19950a785e6ca4ce6af60ddc007d863b/白厄anan杂志/rm.txt` | Text | `BD9FB64F366B1BE13833AC43ABD32365AA87ACD64721B3600C96C6C89E80381D` | 许可与标注原文 |

## 许可与使用规约（摘要）

来源: `rm.txt`

- 允许: 优化刚体、权重、物理、骨骼、表情等 bug；适度改色/贴图修改更换；添加 `spa`、`toon`
- 禁止: 二配；商用倒卖；18 禁向作品/极端宗教宣传/血腥恐怖猎奇/人身攻击等；拆分部件改造为其他模型；导入 mod
- 免责声明: 他人使用造成不良后果，与改造者及 miHoYo 无关

## 使用时标注（摘要）

来源: `rm.txt`

- `miHoYo/林槿/流云景`

## 工程使用边界

- 内部验证: 允许（P3 阶段默认）
- 对外发布: 仅在完成署名校对并二次复核许可条款后可进入发布候选
- 可改造范围: 仅限骨骼/权重/物理/贴图优化与性能修复，不得拆件重组到其他角色模型
- 上线前置: 在角色配置中固定 `model_id` 与资源路径映射，并完成许可复核留档

