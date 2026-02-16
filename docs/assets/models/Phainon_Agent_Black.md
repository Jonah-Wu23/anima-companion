# MMD Model Registry (Phainon_Agent_Black)

- model_id: `model.Phainon_Agent_Black`

- 默认用途: 内部验证（internal validation only）
- 校验日期: 2026-02-14
- 规范目录名: `assets/models/Phainon_Agent_Black/`（计划从 `mmd_download/models/白厄_by_随着2时间的推移_5b48c63aa4788ffdbbd5193ffd92fdbe/` 迁移）
- 来源标识: 特工白厄&秘密特工黑厄（用户提供信息）

## 关键文件校验（当前来源：mmd_download）

| 相对路径 | 类型 | SHA256 | 备注 |
|---|---|---|---|
| `mmd_download/models/白厄_by_随着2时间的推移_5b48c63aa4788ffdbbd5193ffd92fdbe/baie/秘密特工黑厄_pmx/黑厄2.pmx` | PMX | `0BC9D7CFC5153C276D3691E2016EEAA408103B93DBD6DE2F00108E36A8098281` | 主模型 |
| `mmd_download/models/白厄_by_随着2时间的推移_5b48c63aa4788ffdbbd5193ffd92fdbe/baie/秘密特工黑厄_pmx/rm.txt` | Text | `3459D135F10832695EBE4ED09107A59AE50C738E5D336BAE41CA5C38248BCFCA` | 许可与标注原文 |

## 许可与使用规约（摘要）

来源: `rm.txt`

- 允许: 优化刚体、权重、物理、骨骼、表情等 bug；适度改色/贴图修改更换；添加 `spa`、`toon`
- 禁止: 二配；商用倒卖；18 禁向作品/极端宗教宣传/血腥恐怖猎奇/人身攻击等；拆分部件改造为其他模型；导入 mod
- 免责声明: 他人使用造成不良后果，与改造者及 miHoYo 无关

## 使用时标注（摘要）

来源: `rm.txt`

- `miHoYo/夙曈/流云景/鬼猫tine/白识/A原子序数/Lancet/mocae/OHAGI糕/离辰亦往`

## 工程使用边界

- 内部验证: 允许（P3 阶段默认）
- 对外发布: 仅在完成署名校对并二次复核许可条款后可进入发布候选
- 可改造范围: 仅限骨骼/权重/物理/贴图优化与性能修复，不得拆件重组到其他角色模型
- 上线前置: 在角色配置中固定 `model_id` 与资源路径映射，并完成许可复核留档

