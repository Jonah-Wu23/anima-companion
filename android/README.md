# android

安卓客户端工程目录，负责 UI、3D 互动、语音采集播放与本地状态管理。

## 结构约定
- `app/src/main/java/com/anima/companion/app`：应用启动与 DI 装配
- `app/src/main/java/com/anima/companion/core`：基础能力（网络、存储、音频、渲染）
- `app/src/main/java/com/anima/companion/data`：远端/本地数据源与 DTO
- `app/src/main/java/com/anima/companion/domain`：业务模型、仓库接口、用例
- `app/src/main/java/com/anima/companion/feature`：业务功能模块（chat/voice/avatar/memory/relationship/settings）
- `app/src/main/java/com/anima/companion/navigation`：导航与页面路由
- `app/src/main/res`：资源文件（layout、drawable、values、raw）

## 维护规则
- `feature` 不得直接依赖 `data` 的具体实现，只通过 `domain` 接口访问。
- 与服务端的契约必须先更新 `docs/api/contracts/`。
