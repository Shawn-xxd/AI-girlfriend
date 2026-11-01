# ADR 0006：DeepSeek 优先、模型提供商可替换

状态：用户授权先接 DeepSeek，后续模型/供应商可能继续更换。

生成与内容审核分成两条独立接口。当前生成默认 DeepSeek，通过其 OpenAI-compatible Chat Completions API；保留 OpenAI Responses，并提供受信任服务端配置的通用 OpenAI-compatible 适配器。不同提供商使用独立 Key，不自动跨提供商重试或回退。模型 ID 为服务端配置，客户端不能指定 Key、Base URL 或任意模型。

DeepSeek 使用固定官方地址，不因通用 Base URL 配置而向别处发送 Key。通用兼容端点只接受无用户信息/query/fragment 的 HTTPS URL，另需环境网络白名单授权。兼容协议不意味着所有供应商特性相同，接入后仍须真实 smoke。

审核独立配置。为避免强制依赖 OpenAI，当前提供 DeepSeek JSON 分类器，并保留可选 OpenAI 专用审核适配器。分类器无法给出严格有效 JSON、审核超时或异常时均拒绝继续生成/返回内容；不以关闭审核解决配置问题。LLM 分类器不是 DeepSeek 官方专用 moderation API，不承诺等同专用审核或已满足 App Store 发布验收，后续必须做安全评估和产品审核。

每轮最多三个有费用的调用：输入审核、生成、输出审核。分别记录 phase、provider、model、响应 ID 与已知 Token；不能把不同模型的 Token 混成同一模型费用。缺失用量保留 NULL，不虚构为零，货币价格另由运营配置。通过新版本 SQL 添加 usage events，不修改已交付旧迁移。

聊天、消息、请求幂等、数据库 lease/RPC 和用户权限保留。现阶段仍为完整 JSON 回复；真实流式在 Phase 3。尚无 DeepSeek Key，所以接入代码和测试不能被描述为真实 DeepSeek 已验证。

参考：DeepSeek 官方 DeepSeek-V3 README 的 API Platform 章节确认提供 OpenAI-compatible API。api-docs.deepseek.com 当前 HTTP 策略返回 403，已准备按配置工作流添加文档/API 域名；具体账户模型可用性和接口特性需在真实凭证验证时确认。
