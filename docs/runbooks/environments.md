# 环境配置

最新流程见 sdk-development.md，当前主开发可在云端运行。

- 后端需要 SUPABASE_URL、SUPABASE_SECRET_KEY、可选 PORT；保持 HTTPS TLS 校验。
- 移动端仅保存公开 API URL、Supabase URL 和 publishable key，后台自动建立匿名身份；服务端 Secret key 绝不进入移动端。
- 当前数据库访问已使用 SDK，DATABASE_URL/DIRECT_URL 不再是运行要求。历史绑定可以保留，后续用户在环境设置移除；工具不能代替用户删除已有绑定。
- Development、Staging、Production 分离 Supabase 项目、存储与凭证；不把开发迁移/集成测试指向生产。
- Railway 构建运行配置见 sdk-development.md。数据库迁移先通过受控渠道执行。
- 正式上线前确认套餐备份/恢复窗口，执行独立恢复演练，验证用户、消息和权益一致性。当前未完成灾备验收。

后端 Docker 和 Railway 配置已准备并本机验证；当前尚未外部部署，详见 railway-deployment.md。
