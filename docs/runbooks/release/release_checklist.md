# 发布检查清单

1. 确认接口契约变更已同步客户端。
2. 配置文件通过校验脚本。
3. 关键链路自测通过（文本、语音、3D 口型）。
4. 敏感日志脱敏检查完成。
5. 回滚方案已验证。

## 附录：状态映射表

| 业务态（文档/UI） | PipelineStage（前端） |
| --- | --- |
| Idle | `idle` |
| Listening | `recording` |
| Thinking | `uploading` / `processing` |
| Speaking | `speaking` |
| Error | `error` |
