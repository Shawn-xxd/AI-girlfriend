# 模型提供商配置

当前生成默认 DeepSeek，业务使用 ChatProvider 接口；审核使用独立 ContentModerator 接口。更换生成模型不会修改会话、消息、幂等和权限代码。

## 当前 DeepSeek

安全环境变量：

```text
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat
DEEPSEEK_API_KEY=<在安全设置填写，不发聊天>
MODERATION_PROVIDER=deepseek
MODERATION_MODEL=deepseek-chat
```

API Key 从 https://platform.deepseek.com/ 获取。当前生成模型和分类模型均配置为 deepseek-chat，已在当前开发账号通过真实单轮测试；不宣称该 ID 永久有效或价格已确认。更换生成模型只修改 AI_MODEL；分类模型单独选择支持 JSON 输出的模型，不应盲目改成推理模型。

默认情况下不需要 OpenAI Key。旧的 AI_PROVIDER_API_KEY 是 OpenAI 专用字段，已不用于 DeepSeek；用户可在环境设置删除该旧需求。工具的追加更新不会替用户删除已有绑定，不能靠填假值消除未配置状态。

DeepSeek 使用固定 https://api.deepseek.com 的 Chat Completions 接口，AI_BASE_URL 不改变它的 Key 目的地。环境需允许 api.deepseek.com，保存发布后检查运行状态；仅保存草稿不等于已应用。文档 api-docs.deepseek.com 同时加入草稿以便核对接口。生成/审核均禁止 SDK 自动重试，当前单次超时 30 秒。

## 通用兼容供应商

```text
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://你的供应商域名/v1
AI_COMPATIBLE_API_KEY=<安全填写>
AI_MODEL=<该供应商支持的模型 ID>
```

仅适用于兼容 Chat Completions 的接口，Base URL 必须是没有用户名、密码、query 或 fragment 的 HTTPS 地址，并通过云端域名规则允许。不会把 DeepSeek/OpenAI Key 自动发给新地址。非兼容 API 需要新增适配器，不能承诺任何模型都只改一个名字。

审核仍独立配置，当前可继续使用 DeepSeek 分类器；切换不同数据接收供应商前必须同步隐私披露和安全评估。没有自动跨供应商回退。

## 可选 OpenAI

AI_PROVIDER=openai，使用 AI_PROVIDER_API_KEY 和 AI_MODEL，通过单独的 Responses 适配器。MODERATION_PROVIDER=openai 时使用独立 MODERATION_API_KEY，MODERATION_MODEL 为支持的专用审核模型。选择 OpenAI 时需明确允许 api.openai.com；DeepSeek 默认路线不会调用它。

代码保留 openai npm 包是为了协议兼容客户端，不意味着选 DeepSeek 后请求仍发给 OpenAI。传输合同测试明确验证实际 URL、请求字段和 Key 隔离。

## 审核边界与计量

DeepSeek 默认审核是本应用编写的 JSON 分类器，不是冒称官方 moderation API。输入和输出分别分类，要求严格的 allowed 布尔 JSON；解析失败、截断、超时、上游异常均拒绝继续生成或返回内容。分类器不能保证识别全部风险，尚未完成正式安全评估或 App Store 内容审核验收。

一次正常回复包含输入分类、生成、输出分类，三个调用可能分别收费。每个 phase 记录 provider/model/response ID 和已知 Token，不能把不同模型的 Token 当成同一价格。若上游没有返回用量，保留 NULL，不假装为零；具体货币费用由后续价格配置计算。

每个 generation/phase 的计量 RPC 幂等，冲突数据不覆盖旧记录，不允许普通用户直接调用。计量写入响应丢失时只重试幂等写入，不重做付费生成。供应商特定 reasoning_content 不返回客户端、不保存为聊天正文。

## 迁移与验收

先执行 20261101000200_chat.sql，再执行 20261101000300_provider_usage.sql。二者同内容交付副本合并为 deepseek-chat-migrations.txt，可在开发项目 SQL Editor 一次运行；旧基础迁移不用重跑。第二版若已执行，可重复执行同一份版本，再继续第三版；不修改旧迁移。

pnpm check 校验代码、类型、适配器与权限边界。pnpm test:schema 校验三个版本完整/重复执行、计量幂等/所有权/级联清理以及既有聊天并发、回滚、租约隔离。

迁移应用后 pnpm test:integration 验证真实 Supabase API；其中模型替身仅用于异常测试。Key/模型/网络配置准备后 pnpm test:ai-live 使用当前所选真实供应商执行一次正常回复（最多三个有费用调用），验证持久化、三阶段计量与同键重放，并清理测试身份/角色/会话。失败时检查安全错误码，不反复盲目触发付费请求。

2026-11-01 当前开发项目三份迁移及 checksum 全部匹配，DeepSeek 配置与域名已在运行环境生效。pnpm test:integration 的 8 项真实 API/数据库测试通过（其中两项使用明确的模型替身验证异常流程）；pnpm test:ai-live 的 1 项真实 DeepSeek 单轮测试通过，覆盖良性输入/输出分类、真实回复持久化、同键结果重放和三个阶段的用量记录，fixture 清理成功。没有核对供应商账单，不把数据库计量去重当作独立的零重复扣费证明。

上述成功不等于分类质量全面验收；移动端 Apple 登录/界面及流式仍未完成，完整 Phase 2 尚未交付。
