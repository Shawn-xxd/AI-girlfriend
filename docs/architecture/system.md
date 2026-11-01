# 系统架构

## 边界

```text
Expo iOS ── Supabase Auth 会话 ── NestJS (Railway) ── Supabase SDK / HTTPS ── PostgreSQL (Supabase)
                             │
                             ├── 可替换 AI 提供商（当前 DeepSeek）：生成、摘要、用量
                             ├── Supabase Storage：私有图片与短期授权 URL
                             └── RevenueCat：购买事件与权益校验
Next.js Admin ── 独立管理员认证/RBAC ── NestJS
```

模块化单体：Auth、Users、Characters、Conversations、AI、Progress、Photos、Wallet、Billing、Moderation、Admin。按阶段增量创建。客户端不能直接访问数据库、模型提供商或 Supabase 服务端密钥。

TanStack Query 管理服务端状态，Zustand 仅保存必要的本地交互状态。共享包提供 Schema 和 DTO，不共享服务端数据库对象。API 前缀 `/v1`，变更契约先更新共享验证。

## 数据设计方向

当前 companion_users.id 对应经服务端校验的 Supabase 用户 UUID；companion_characters 管理可发布角色。正式表结构由 supabase/migrations 管理，不保存无业务必要的身份资料。

后续实体：Character、Conversation、Message、UserCharacterProgress、Photo、PhotoUnlock、Subscription、Wallet、WalletTransaction、PurchaseRecord，以及 WebhookEvent、AIUsage、配置版本、Report 和管理员审计。

- Progress 唯一 `(userId, characterId)`；PhotoUnlock 唯一 `(userId, photoId)`；发奖事件需要稳定唯一业务键。
- Message 保存生成状态、客户端幂等标识、顺序和用量；AI 调用不能放在长数据库事务内。
- 成功回复持久化与进度推进需原子协调；照片卡片使用幂等奖励记录，必要时采用数据库 outbox，避免提交后漏发。
- 钱包整数计量；条件余额扣减、流水与照片授权在同一事务中完成；钱包流水不得随意覆盖。
- Apple 原始交易标识和 Webhook 事件独立去重；事件可重复/乱序，不能以客户端购买成功直接授予余额。
- 消息删除与照片权限解耦；账号删除单独处理用户数据和依法需要保留的交易数据。

具体 SQL 约束、外键删除策略和索引随对应模块设计、迁移和集成测试落地。

## 安全与运维

- Supabase access token 验签与用户归属校验在服务端；管理员角色不能由普通客户端设置。
- Level/付费照片均先验权再签发短时 URL；原图 bucket 不公开，URL 不写入长期记录。
- 输入/输出审核、举报、年龄确认和 AI 披露；App Store 内容与订阅规则在集成和发布时核对。
- 限流、聊天额度、Token 上限和成本告警；日志不记录 token、密钥和默认完整聊天正文。
- Development、Staging、Production 使用独立数据库、bucket、Supabase 项目和支付配置。
- Railway 与 Supabase 选择接近区域；SDK 数据访问使用 HTTPS；迁移执行与运行角色分开管理。
- Supabase 备份/PITR 以实际套餐为准；正式上线前必须完成独立备份和恢复演练，不能把平台名称当成备份保证。
- 长任务出现明确需要后再接入 Trigger.dev；不提前引入 Redis 或额外服务。

## Supabase 集成边界

- 移动端仅使用 publishable key 访问 Auth；向 NestJS 发送 access token，服务端验证签名/issuer/audience/有效期后用 sub 关联 User.supabaseUserId，不能接受客户端自报用户 ID。
- 业务 User 与 auth.users 分离，业务迁移不管理 Supabase 的 auth/storage schema；不通过跨 schema 外键或触发器把平台内部结构绑定进业务迁移。账号删除在后续阶段通过可重试流程协调 Auth、业务数据和图片。
- public.User 已启用 RLS，且不添加客户端策略；后续业务表同样默认拒绝 Data API 访问。私有 bucket 也不配置客户端任意读取策略。
- SDK 服务端角色具备业务访问能力；RLS 不替代 NestJS 对用户归属的校验。迁移权限独立于运行权限，客户端不能持有服务端 Key。
- 图片由 NestJS 校验 PhotoUnlock 后通过服务端 Storage API 生成短期签名 URL；publishable key 不能用来绕过照片权限。
- Supabase Dashboard 供开发管理数据，Next.js 后台仍负责运营工作流；不在客户端调用 Edge Functions 实现钱包等第二套业务逻辑。

## 模型可替换性

AI_PROVIDER/AI_MODEL 选择生成适配器；审核独立配置。DeepSeek 默认不要求 OpenAI 服务。协议、凭证和用量记录按供应商隔离，详见 ADR 0006；不使用模型生成结果驱动余额/等级/照片权限。
