# Model Registry Index

本目录用于登记 MMD 模型资产的命名、校验、许可与工程使用边界。

## 命名规范

- 目录命名: `assets/models/<ModelSlug>/`，统一使用英文 `PascalCase` + 下划线连接变体。
- 主角色前缀: 统一以 `Phainon` 开头，变体按 `Phainon_<VariantSlug>`。
- `model_id` 规则: `model.<ModelSlug>`，例如 `model.Phainon_Khaslana`。
- 多 PMX 规则: 同一来源目录存在多个可用 PMX 时，必须拆成多个 registry 文件，或在单文件内给出多个 `model_id`。
- 附件 PMX 规则: 武器等附件允许登记在同文件，但备注为“非角色切换入口”。

## 入库规则

- `assets/models/` 与 `mmd_download/` 均被 `.gitignore` 忽略，仓库仅提交登记文档。
- 每个 registry 至少登记 1 个 PMX 的 SHA256；如有许可文本，也应登记其 SHA256。
- 每个 registry 必须包含“工程使用边界”。

## 覆盖清单（2026-02-15）

| 规范模型名 | Registry 文件 | 来源目录 | 可用 PMX 数 |
|---|---|---|---:|
| `Phainon` | `docs/assets/models/Phainon.md` | `assets/models/Phainon/` | 2 |
| `Phainon_Khaslana_normal` | `docs/assets/models/Phainon_Khaslana_normal.md` | `assets/models/Phainon_Khaslana_normal/` | 2 |
| `Phainon_Khaslana` | `docs/assets/models/Phainon_Khaslana.md` | `mmd_download/models/卡厄斯兰那_1109_by_FixEll_fe82a555dc5f6cda5c26676ae7c905ef/` | 2 |
| `Phainon_Demiurge` | `docs/assets/models/Phainon_Demiurge.md` | `mmd_download/models/白厄 - 粉3_by_苏酥鱼鱼喵_8a3c921bb1aa6bc3dd653945234cfc9e/` | 2 |
| `Phainon_IronTomb_White` | `docs/assets/models/Phainon_IronTomb_White.md` | `mmd_download/models/白厄 - red_by_苏酥鱼鱼喵_046c10a503037a13b255d917abd307d3/` | 2 |
| `Phainon_Agent_White` | `docs/assets/models/Phainon_Agent_White.md` | `mmd_download/models/白厄_by_随着2时间的推移_5b48c63aa4788ffdbbd5193ffd92fdbe/` | 1 |
| `Phainon_Agent_Black` | `docs/assets/models/Phainon_Agent_Black.md` | `mmd_download/models/白厄_by_随着2时间的推移_5b48c63aa4788ffdbbd5193ffd92fdbe/` | 1 |
| `Phainon_CaptainUniform` | `docs/assets/models/Phainon_CaptainUniform.md` | `mmd_download/models/白厄机长制服_by_林槿_5cd991855e14a10cd3b26a719c5f9f4b/` | 1 |
| `Phainon_LuckinCollab` | `docs/assets/models/Phainon_LuckinCollab.md` | `mmd_download/models/白厄瑞幸联动_by_林槿_9adae994970c25717b6a1f9cd6df77de/` | 1 |
| `Phainon_ANAN_Magazine` | `docs/assets/models/Phainon_ANAN_Magazine.md` | `mmd_download/models/白厄anan杂志_by_林槿_19950a785e6ca4ce6af60ddc007d863b/` | 1 |
| `Phainon_Lady_Skirt_LongHair` | `docs/assets/models/Phainon_Lady_Skirt_LongHair.md` | `mmd_download/models/白厄女士 - 双版本_by_填字小檀桌_eb9ea4feda74659ebdf82bce6e64aafd/` | 1 |
| `Phainon_Lady_Coat_LongHair` | `docs/assets/models/Phainon_Lady_Coat_LongHair.md` | `mmd_download/models/白厄女士 - 双版本_by_填字小檀桌_eb9ea4feda74659ebdf82bce6e64aafd/` | 1 |
| `Phainon_Goddess_NoWings_NoHalo` | `docs/assets/models/Phainon_Goddess_NoWings_NoHalo.md` | `mmd_download/models/白厄女神（神厄娘化） - by_填字小檀桌_by_填字小檀桌_9b5ffdd0719344792a1b0bc5d40ad29c/` | 1 |
| `Phainon_Goddess_Wings_Halo` | `docs/assets/models/Phainon_Goddess_Wings_Halo.md` | `mmd_download/models/白厄女神（神厄娘化） - by_填字小檀桌_by_填字小檀桌_9b5ffdd0719344792a1b0bc5d40ad29c/` | 1 |

## 验收对照

- `mmd_download/models/` 下当前 15 个 PMX 均已被 registry 覆盖。
- 每个模型 registry 均已包含 PMX SHA256。
- `.gitignore` 已覆盖 `assets/models/` 与 `mmd_download/`。

