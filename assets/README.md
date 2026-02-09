# assets

静态资源目录，统一管理模型与媒体文件。

## 子目录说明
- `models/`：3D 模型（如 PMX/FBX/VRM）
- `motions/`：动作文件（Idle/Speak/情绪动作）
- `textures/`：贴图与材质资源
- `audio/`：语音样本、占位音频
- `icons/`：App 图标与 UI 图标

## 约定
- 大文件建议使用 Git LFS。
- 文件命名统一小写下划线，例如 `idle_loop_01.vmd`。
- 禁止提交无版权来源的素材。
