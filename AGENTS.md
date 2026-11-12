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
- 最新聊天交付见 ADR 0009：供应商流先缓存，完整审核及事务保存后通过 SSE 返回内容；不转发未审核 delta，不用打字动画冒充模型流。待发送键按游客/会话保存，重试和重启恢复同键；租约来自 leaseExpiresAt。Preview 的示例消息/照片只用于设计，正式模式不兜底。运行状态和凭证以当前检查为准，旧启动说明的缺失字段不能当作现状。

- 最新导航见 ADR 0010：Heart 只展示 Match，CHAT NOW 才幂等创建会话；Gallery 为独立路由，挂载不得刷新 viewer 导致后台聊天草稿丢失。价格/等级样例仅供显式 Preview，正式照片 API 未接入时显示空态，不从前端扣钻/发权限。

- 最新闭环验收/部署见 ADR 0011：用户无注册、登录和登录状态提示；真实匿名公开 SDK 验收已通过，不再沿用匿名开关关闭的旧结论。手动 test:guest-live 使用真实供应商并清理临时数据；不得用管理员身份替代匿名。seed:development 只插入指定开发库缺失角色，不覆盖已有数据。Docker 本机通过不等于 Railway 已发布或 iPhone 已验收。

- 等级照片见 ADR 0012：用户已确认成功保存并审核通过的一轮计一次，保存后断网也计；失败/拒绝/重试不多计。进度、计数凭据、授权独立于历史，完成触发器同事务发奖。高级门槛不设正式默认值。/timeline 合并照片和文字，旧 /messages 与 SSE 契约保留。仅鉴权并授权后签发 companion-photos 私有桶短链；不能用客户端模糊代替权限。迁移 20261108000100 本机通过不等于已在 Supabase 应用，当前云端状态须按实际 ledger 验证。

- 2026-11-10 最新验收：开发 Supabase 四份迁移/校验和匹配，15 项真实数据库/私有 Storage 集成（AI 替身）及 1 项真实匿名/DeepSeek/等级照片验收通过。私有桶 companion-photos 保留，测试身份/对象清理；临时角色的 1 次升级规则不能作为正式门槛。该结果不代表已配置运营素材、iPhone 验收或 Railway 上线。

- V1 摘要见 ADR 0013：每个会话一份短摘要加近期完整对话，后台机会式更新，不新增 UI/向量库/队列。当前默认每 10 轮或字符预算达到时更新，摘要上限 2000 字符；仅用完成回合，作为不可信数据加入上下文。租约避免重复生成，失败保留旧摘要，删除文字消息使摘要及旧任务失效，不改变等级。Token 另记 companion_memory_usage。第五份迁移与真实云端验收状态见 memory-development.md，不能把 119 项本机测试当作云端通过。

- 摘要最新验收：2026-11-10 五份开发迁移/校验和匹配，19 项真实云端集成（AI 替身）、1 项真实 DeepSeek 摘要/回忆通过；2026-11-11 归档，不重复付费调用。近期窗口已排除原始姓名/兴趣，模型仍从摘要回忆成功。临时数据清理；测试批次 2/窗口 1 不改正式默认 10/10。无需重复执行第五份 SQL，不宣称原生真机或外部部署完成。

- 钱包见 ADR 0014：用户确认退款追回原发放全部钻石、照片保留；欠额由后续到账先补足。新用户零钻石，不猜价格/赠额；受限 RPC 统一扣款、流水、幂等和永久授权。内部 credit/reversal RPC 没有公开 HTTP 入口，不等于已接入 Apple/RevenueCat。财务表限制误删，账号删除/匿名化仍待 Phase 5。2026-11-11 用户执行第六份迁移后，六份开发迁移/校验和匹配；23 项真实 Supabase/匿名 Auth/私有 Storage 集成（AI 替身，无支付调用）通过，临时数据清理。钱包与 Diamond Photos 云端闭环已验收，不等于 Apple/RevenueCat、跨设备恢复或原生真机通过。UI 不用晚到的消费响应覆盖当前钱包余额，消费后取消旧查询并重新读取。无注册登录 UI 及聊天原位开图约束继续有效。

- 真机通道见 ADR 0015：用户已确认有 Apple Developer 付费账号。采用独立 Preview 签名包、Railway HTTPS、EAS Update/fingerprint；development/preview/production 的 Bundle ID、scheme 和 channel 隔离。公开项目身份来自实际 app.json/EAS 配置，不猜 Bundle ID 或生成假的关联；构建只接受公开 HTTPS API 和 publishable key，正式包不能连接已知开发 Supabase。EAS post-install 必须先构建 shared/dist。导出/原生工程生成/本机容器通过不能写成已生成 IPA、已部署 Railway 或 iPhone 通过。具体平台关联和现状见 iphone-testing.md。
