# Android 分层约束

## 依赖方向
`feature -> domain -> data -> core`

## 规则
- `feature` 仅依赖 `domain` 接口，不直接调用网络层。
- `data` 实现仓库接口并对接远端/本地数据源。
- `core` 提供通用能力，不感知具体业务语义。
