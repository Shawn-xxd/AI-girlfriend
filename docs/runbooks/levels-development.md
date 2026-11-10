# 有效聊天、等级与照片奖励

用户已确认的规则与事务设计见 [ADR 0012](../decisions/0012-chat-progress-and-level-photos.md)。本阶段不配置正式高级门槛、照片库存或 Diamond 价格。

## 运行和验收

```bash
pnpm check
pnpm test:schema
pnpm test:integration
```

schema 使用隔离 PostgreSQL，在临时数据库执行全部迁移两遍、历史回填和事务断言，之后用两个真实数据库会话验证并发完成。临时数据库自动删除。开发 Supabase 集成另行运行，不能用前者替代后者。

新增 `apps/api/test/levels.integration.ts`：真实匿名 SDK、真实开发库和真实私有 Storage；AI 使用明确替身，不产生模型费用。仅允许指定开发项目，先检查最新迁移；测试临时用户、角色、照片记录和图片对象在结束后清理。缺少私有 companion-photos 桶时创建为 private；已存在公共桶则失败，不自动更改或删除桶。桶保留给后续开发使用。

覆盖首次 Level 1 卡片、保存后一次计数/发奖、同键重放、失败/拒绝、另一个游客拒绝访问、私有图片短链、下架及历史删除后权益保持。正常 push 不触发真实云端或计费验收。

## Supabase 初始化

开发项目先在 SQL Editor 执行 `supabase/migrations/20261108000100_level_photos.sql`。它依赖现有三份迁移，只新增本阶段结构/函数/触发器，不修改 Auth 或 Storage，也不预置高级门槛。应用与 SDK 均不执行自动 DDL。已应用文件不可修改，后续修正新增迁移。

当前会话没有 Supabase 管理 MCP 或 Management API 凭据，业务 SDK 不具备创建表能力，所以控制台执行迁移是一次独立操作；HTTPS 业务连接已经可用，不需要修改网络、密码或改成本地开发。

## 配置与素材

Level 1 固定从零次开始。更高级别使用 `companion_set_level_rules_v1(character_id, rules)` 配置完整 JSON 数组，每项为 `level` 与 `requiredCount`，从 Level 1 连续且次数严格递增。RPC 只授予服务端角色，不向 App 提供配置入口。没有确定的正式门槛时只保留 Level 1，不能把测试用的 1/2 次当成正式配置。

在 Supabase Storage 上传预制照片到私有 companion-photos 桶；已审核素材登记到 companion_photos，设置对应 character_id、required_level、object_key、title，确认审核后再发布。路径不得含开头斜杠、上级路径或控制字符。已获权限的照片，其素材身份/等级/角色不能直接改写；改素材需新记录。后台批量上传、审核工作流仍在 Phase 5。

每次首次打开/同步聊天和成功回复都检查当前配置；Gallery 同步也可补发符合当前等级的新照片，返回聊天时仅刷新时间线，不刷新身份或清除草稿。没配置已审核发布照片时不显示假奖励。

## API

- `GET /v1/conversations/:id/timeline`：按 sequence 合并文字和照片，支持 before/limit，含当前进度及下一等级要求。
- `GET /v1/conversations/:id/photos`：本角色的 Level 图库和进度；已获得的审核通过照片下架后仍保留。
- `POST /v1/conversations/:id/photos/:photoId/access`：重新校验身份、会话/角色归属和永久授权，核对桶为 private，签发 60 秒 URL，响应不缓存。

原有文字历史与 SSE 回复结构保持兼容，照片不进入模型上下文。手机端从时间线更新等级标记和奖励卡片；点 OPEN 在原卡片加载图片，失败可重试，签名过期会重新取得权限链接。私有路径/URL 不写进历史或永久客户端存储。

## 当前验证范围

本机 PostgreSQL 迁移/历史回填/回滚与真实并发通过；109 项 Jest 测试及 web 导出通过。明确 HTTP 替身下的浏览器验证通过 393×852、320×568：初始照片、失败不升级、同键重试后升级和单张奖励、原位展开保留草稿、未获照片不请求、过期链接恢复、刷新恢复等级。该测试不证明开发 Supabase 已迁移。

开发 Supabase 最新一次只读 ledger 检查仍有原三份迁移，新迁移等待控制台执行后再运行真实集成；iPhone 真机未验收。实际照片库存、正式门槛、摘要、Diamonds 与支付没有在本轮代为设定。

2026-11-10 恢复任务后复核：SDK HTTPS 连接正常，开发库仍只有原三份迁移，20261108000100 尚未应用。现有本机测试记录不变；真实等级/私有 Storage 集成需待该迁移执行，不能记为通过。
