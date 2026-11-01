# Phase 2 会话与 AI 接口

生成与审核独立配置，当前均使用 DeepSeek，完整字段见 [模型提供商配置](model-providers.md)。

## 目标与范围

真实 NestJS + Supabase 会话、消息，模型适配器当前使用 DeepSeek Chat Completions，并保留独立 OpenAI Responses 和通用兼容适配器。当前回复采用完整 JSON，流式和断线补全在 Phase 3，不用 Mock API 作为正式实现。

## 数据迁移

当前开发项目已依次执行 20261101000100_sdk_foundation、20261101000200_chat、20261101000300_provider_usage，三份版本与 checksum 均通过只读核对。新环境按相同顺序应用；交付用的聊天与用量迁移同内容合并文本为 /workspace/scratch/deepseek-chat-migrations.txt。聊天迁移新增会话、生成轮次、独立 AI 尝试记录和消息表、受限函数以及角色私有 system_prompt；用量迁移记录每次输入审核、生成、输出审核的供应商、模型和用量。角色公共 API 不返回 system_prompt。不会删除旧用户/角色/探针表。

数据库版本就绪检查要求最新迁移。SQL Editor 显示 pg_advisory_xact_lock 列是锁语句正常输出，不等于错误；最终以迁移账本校验和及真实接口测试判断完成。

## 配置

- SUPABASE_URL / SUPABASE_SECRET_KEY：已存在，无需重新提供。
- AI_PROVIDER=deepseek，DEEPSEEK_API_KEY：DeepSeek 服务端 API Key，通过安全环境设置填写，不发聊天。
- AI_MODEL=deepseek-chat：当前开发账号真实单轮调用通过，模型 ID 后续可调整。没有提供当前价格保证，需按实际模型用量控制。
- MODERATION_PROVIDER=deepseek、MODERATION_MODEL=deepseek-chat：独立的 JSON 内容分类器。它不是专用审核 API，正式安全质量仍需验收。
- AI_MAX_OUTPUT_TOKENS 默认 512、AI_CONTEXT_TURNS 默认 10，可配置；不是最终产品聊天额度或等级阈值。
- 当前云环境需允许 api.deepseek.com，使用继承的 HTTPS 代理与 CA，Node 启动脚本已设置 NODE_USE_ENV_PROXY=1。默认不需要 OpenAI Key。

缺少 Key/模型时发送接口返回 503，不调用模型，不写入新一轮消息。模型调用禁用自动重试，默认 30 秒单次超时；数据库租约为 180 秒，防止断开后无限挂起。多次审核/生成各有单次超时，外部计费不能保证严格一次。

## API

全部需要 Supabase 用户 access token，不能用服务端 Secret key 代替用户 token。

- POST /v1/conversations，body 为 {"characterId":"UUID"}，同用户同角色幂等返回同会话。
- GET /v1/conversations，只返回本人会话，当前最多 50 条。
- GET /v1/conversations/:id/messages?limit=25&before=SEQUENCE，按序返回消息，nextBefore 用于更早分页。
- POST /v1/conversations/:id/messages，body 为 {"requestKey":"UUID","text":"Hello"}。requestKey 由客户端为一次发送生成，重试必须复用同键同文本。完成后返回两条持久化消息。

他人资源返回 404，非法参数返回 400，同键不同内容/并发生成返回 409，审核拒绝返回 422，缺配置或上游失败返回脱敏 503。历史消息附带轮次状态和请求键，便于后续失败重试 UI。

## 一致性

begin RPC 锁定会话并保存用户消息；同轮次不重复追加。complete RPC 在事务中追加助手消息、保存模型/Token 使用量。失败和拒绝独立持久化，过期租约可重新获取，新 generation ID 阻止旧请求覆盖结果。并发唯一索引和复合外键约束限制状态和跨会话引用。

近期上下文只选择已成功完成轮次，不把失败/被拒绝的内容自动混入后续对话。输入、输出分别调用真实审核服务。模型只生成文字，没有钱包、进度或图片权限操作接口。

尚未实现摘要、Token 价格折算、额度计费、等级或照片发放。每次 generation 有独立尝试记录，重试不会覆盖已有消耗；过期请求的迟到用量只写入对应尝试，不影响新请求状态。Token 可能因上游故障不可知，用 NULL 表示，不伪造为 0。删除消息相关接口留待后续阶段。

## 检查与当前限制

pnpm check、pnpm test:schema。SQL 测试验证重复迁移、权限/所有权、请求去重、失败回滚、过期租约、旧工作者隔离、跨会话引用约束，以及两个真实并发数据库会话只产生一轮。

pnpm test:integration 在正式迁移后运行。测试替身用于模拟模型失败/重试异常，不代表真实模型已通过。实际 AI 需要对应 Key、网络策略和一个可用模型后再验收。

移动端仍是基础连接检查页；Apple 原生登录、公开 publishable key 和真机配置尚未接入，不宣称完整 Phase 2 已完成。

## 本轮实际结果

- pnpm check 通过：34 项 Jest 测试、4 项配置测试、lint/格式/类型、三个 SQL artifact 校验和后端构建。
- pnpm test:schema 通过：三个迁移完整执行与重复执行、所有权/权限、幂等、失败及负 Token 回滚、过期租约、旧工作者隔离、独立尝试用量留存、三个阶段的计量及两个真实并发数据库会话检查。
- 2026-11-01 正式开发库三份迁移与 checksum 均匹配；DeepSeek Key、模型字段及域名已生效。
- pnpm test:integration 退出码 0，8 项真实 API/数据库集成全部通过；其中两项明确使用模型测试替身检查异常/重试。
- pnpm test:ai-live 退出码 0，1 项真实 DeepSeek 单轮测试通过。良性输入检查、生成、输出检查成功，真实回复保存、同键结果重放和三个阶段的 Token 记录均通过断言；临时身份/角色/会话清理成功。未独立核对供应商账单或验证分类器完整安全质量。

当前不需要重新填写 Supabase Key 或重新执行已完成迁移。现有移动端仍需完成登录、角色与聊天界面，并在真实设备上验收。

真实 API 集成中的 live 和 ready 均为 200，未认证访问仍被拒绝。此前迁移缺失导致的 ready 503 阻塞已解除。
