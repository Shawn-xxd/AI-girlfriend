# 开发规则

- 使用当前 checkout；云任务已经隔离，不创建额外 worktree，除非用户要求。
- 最新方案见 ADR 0004：TypeScript、Expo Router、NestJS、Supabase SDK/Auth/PostgreSQL/Storage、pnpm；Railway 后续部署后端。Prisma 已退出正式访问层，旧文件仅归档。
- 当前主开发可在云端进行，Mac 是可选环境。SDK 真实读写和事务探针已通过；正式应用和实验资源必须分开验收。
- 修改前检查相关模块、架构和阶段计划，避免重复实现。只实现当前阶段；未经确定的价格、额度、等级门槛不得固化为正式规则。
- 正式数据库结构唯一来源为 supabase/migrations。已应用 SQL 不得改写；新变更新增版本并更新 manifest。应用不执行任意 SQL 或自动 DDL。
- 服务端 Secret key 不进入移动端、共享包、Git 或日志。EXPO*PUBLIC*\* 为公开配置。不要输出连接串、access token 或密钥。
- Supabase access token 必须在服务端验证；用户归属从验证结果取得，不能相信客户端自报 ID。服务端角色可绕过 RLS，每个接口仍必须检查资源归属。
- 业务表默认启用 RLS，anon/authenticated 无直接读写权限。跨表原子操作使用受限 PostgreSQL RPC；独立 HTTP 请求不是一个事务。
- Admin 通过 NestJS API 执行业务，管理员权限独立校验。shared 只放公开契约，不导出数据库客户端和服务端配置。
- 交付前运行 pnpm check；数据库变更运行 pnpm test:schema。正式迁移在开发 Supabase 执行后运行 pnpm test:integration；缺少迁移要报告阻塞，不把替身或本地 SQL 通过当作真实云端通过。
- 真实集成测试只对指定开发项目运行，临时身份不发送邮件，测试数据必须清理。不可使用生产凭证。
- iOS bundle 导出不等于真机验证；配置草稿保存不等于发布。GitHub 推送、Railway 部署、原生登录、AI 和支付的状态必须如实报告。

- 最新 AI 选型见 ADR 0006：生成默认 DeepSeek，审核独立配置，模型名可变；不强制要求 OpenAI Key、不自动跨供应商回退。Keys 按供应商隔离，兼容协议不代表供应商服务相同。
- 最新移动端流程见 ADR 0007：用户确认全程无需登录页面，后台使用真实 Supabase 匿名会话，不绕过 API 验证。引导偏好与会话凭证分开；不得在旧游客凭证丢失时静默创建替代身份，不宣称游客跨设备自动恢复。Publishable key 才能进入移动端，平台匿名开关与缺失公开配置须如实报告。
