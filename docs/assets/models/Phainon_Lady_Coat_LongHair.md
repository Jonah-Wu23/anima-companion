# MMD Model Registry (Phainon_Lady_Coat_LongHair)

- model_id: `model.Phainon_Lady_Coat_LongHair`

- 默认用途: 内部验证（internal validation only）
- 校验日期: 2026-02-14
- 规范目录名: `assets/models/Phainon_Lady_Coat_LongHair/`（计划从 `mmd_download/models/白厄女士 - 双版本_by_填字小檀桌_eb9ea4feda74659ebdf82bce6e64aafd/` 迁移）
- 来源标识: 白厄女士 - 双版本_by_填字小檀桌（用户提供信息）

## 关键文件校验（当前来源：mmd_download）

| 相对路径 | 类型 | SHA256 | 备注 |
|---|---|---|---|
| `mmd_download/models/白厄女士 - 双版本_by_填字小檀桌_eb9ea4feda74659ebdf82bce6e64aafd/白厄女士 - 双版本/白厄风衣长发.pmx` | PMX | `42B75B28E74ED08C90D590675E9E1DFD830D2D8E9BA77A91E12120E71E175D64` | 版本 2 |

## 许可与标注（待补充）

- 当前目录内未发现独立的 `rm.txt` / `使用规则.txt` / `Credits.txt` 等许可文件。
- 已知信息（用户提供）: “双版本”；合规口径为“未达 NSFW（婚纱级别）”。
- 建议: 后续补充来源帖/作者规约原文（或将规约文本落到同目录后再做 SHA256 登记），避免对外使用时合规不清。

## 工程使用边界

- 内部验证: 允许（P3 阶段默认）
- 对外发布: 禁止（许可文件缺失，待补齐来源规约后再复核）
- 可改造范围: 仅限骨骼/权重/物理/贴图优化与性能修复，不得拆件重组到其他角色模型
- 上线前置: 在角色配置中固定 `model_id` 与资源路径映射，并完成许可复核留档

