# MMD Model Registry (Phainon)

- model_id: `model.Phainon`

- 默认用途: 内部验证（internal validation only）
- 校验日期: 2026-02-14
- 规范目录名: `assets/models/Phainon/`

## 关键文件校验

| 相对路径 | 类型 | SHA256 | 备注 |
|---|---|---|---|
| `assets/models/Phainon/星穹铁道—白厄3.pmx` | PMX | `4CAB67AD332002AA75F980336B831B87E6BC88EBCFAD907739E3F7D85624914F` | 主模型 |
| `assets/models/Phainon/剑.pmx` | PMX | `9063E70DC76EE4760FBAD72A856048E2E8EA534D141D9BCF9367EAC7151E946E` | 武器附件（非角色切换入口） |
| `assets/models/Phainon/使用规则.txt` | Text | `4AE157D033F677B97AC131D4A1DC078B92578A01C81A51DE85B1E536F6B1FEEE` | 许可与使用规约原文 |

## 许可与使用规约（摘要）

来源: `assets/models/Phainon/使用规则.txt`

- 允许: 改造、优化骨骼和刚体、重制 UV
- 禁止: 二次配布
- 禁止: 用于 18 禁作品、极端宗教宣传、血腥恐怖猎奇作品、人身攻击等
- 禁止: 商业用途
- 免责声明: 他人使用造成不良后果，与改造者及 miHoYo 无关
- 标注: 模型编辑为“流云景”，模型版权所属“miHoYo”

## 工程使用边界

- 内部验证: 允许（P3 阶段默认）
- 对外发布: 仅在完成署名校对并二次复核许可条款后可进入发布候选
- 可改造范围: 仅限骨骼/权重/物理/贴图优化与性能修复，不得拆件重组到其他角色模型
- 上线前置: 在角色配置中固定 `model_id` 与资源路径映射，并完成许可复核留档

