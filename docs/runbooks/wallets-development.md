# 钱包与 Diamond Photos 开发

本轮范围见 ADR 0014；全程免注册、免登录界面。价格仅由运营数据配置，无初始赠钻和正式商品价。退款回收发放的全部钻石，保留照片；不足部分用未来到账补足。

## 运行与迁移

1. 在现有开发 Supabase SQL Editor **新建查询**，完整运行 `supabase/migrations/20261111000100_diamonds_wallet.sql`。当前开发项目已完成六份迁移并核对校验和，无需重复执行。前五份保持不变；脚本包含事务、版本检查和 checksum，可安全重复运行同一文件。对已有未配置价格的 Diamond 照片下架，不能凭空定价。本次只读核对开发库该数量为 0。
2. `pnpm dev:api`；移动端沿用公开 API/Supabase 配置，`pnpm dev:mobile`。现有服务端配置足够，不需要新增支付密钥才能测试钱包。
3. 真实模式 `/v1/me` 建立用户映射，`GET /v1/wallet` 创建并读取真实零余额。未知显示 —，不会把加载失败写成 0。Gallery 使用新 `/v1/conversations/:id/gallery`，旧 `/photos` 仅 Level 契约保留。
4. 新解锁 `POST /v1/conversations/:id/photos/:photo/unlock`，body 只有 requestKey(UUID)、expectedPrice(正整数)。JWT actor 自动取得。402 余额不足、409 请求或价格冲突、404 资源不可用；响应含 photoId/chargedDiamonds/wallet。成功后 `/access` 签私有图片 60 秒短链，两类照片共用权限检查。

没有客户端发钻 API、正式充值入口或模拟订单。测试发放仅通过明确开发夹具调用受限 RPC `companion_credit_wallet_v1`；`p_reference` 在全局标识唯一发放来源。同键不同数量/用户必须冲突。`companion_reverse_credit_v1` 绑定原始 credit，全额只冲回一次；同 reference 重放返回相同 id，其他 reference 再冲回已退款 credit 返回冲突。未来订单处理必须绑定已验真的 PurchaseRecord，不能把这两个内部 RPC 当作已接入支付。

财务流水不可更新或直接删除，余额由插入流水触发修改；新开钱包必须为零。删除用户前必须先实现财务保留/匿名化流程，目前钱包外键阻止误删。开发测试只能对确切创建的临时身份，依次清理进度/授权、钱包、用户、Auth 身份和对象，不提供面向用户的财务删除 API。

## 验收

```bash
pnpm check
# 先启动本机隔离 Postgres，创建并自动删除临时测试数据库
pnpm test:schema
# 第六份迁移已在指定开发 Supabase 应用；仅使用该开发项目运行
pnpm test:integration
```

- SQL 覆盖零余额、余额不足回滚、Credit/Spend/Refund 幂等、同键不同照片/价格拒绝、退款负额、后续到账优先补欠、原照片永久保留、禁止直接改余额、没有授权的扣费回滚、客户端权限拒绝和测试清理。
- 真实独立数据库连接并发：不同角色共享余额不能超支，同一照片不同请求键只扣一次。
- 浏览器契约用明确 HTTP 替身，393×852 和 320×568：快速双击只提交一次，服务端已提交但响应失败后同键重试，真实响应前不展示照片，余额刷新，改价重新展示后再尝试，余额不足、PRIVATE 分类、刷新后已拥有不再扣费，以及聊天草稿/等级卡片/短链过期回归。不是 App Store 沙盒或真实云端钱包通过。
- 新增 wallet.integration.ts 四项，使用真实匿名 Auth/DB/私有 Storage，无 AI 或支付平台调用；迁移 readiness 在创建临时身份前检查，缺迁移不伪造成功。

## 当前结果与后续

本机 131 项单元/契约测试和隔离 Postgres 验证通过；两个浏览器尺寸通过。2026-11-11 用户执行第六份 SQL 后，只读核对六份迁移/校验和全部匹配。`pnpm test:integration` 四个套件、23 项通过，其中新增钱包四项，覆盖真实匿名身份、数据库与私有图片访问，测试数据清理无错误。聊天、等级照片和摘要记忆的既有用例同时回归通过。

本轮 AI 使用明确测试替身，无真实模型或支付平台调用；退款是钱包底层冲回验证，尚非 Apple 退款回调验收。不重复已有的付费模型验证。最终证据见 `docs/validation/wallet-cloud-2026-11-11.json`；`wallet-cloud-readiness-2026-11-11.json` 保留执行迁移前的历史快照，不代表当前状态。

下一批是 RevenueCat/Apple：先确定匿名用户购买归属与跨设备恢复，再实现 PurchaseRecord、验单入账、webhook 幂等/乱序/退款和订阅权益。需要独立配置 App Store Connect 商品、RevenueCat 项目/Webhook 和 EAS 开发构建；当前没有正式商品 ID、价格、赠钻量或可用凭证。不能把恢复订阅直接承诺为恢复匿名聊天及已消费钻石。完成数据保留/账号删除、审核/举报、管理后台、监控、真机和 TestFlight 后，才能按完整商业产品验收。
