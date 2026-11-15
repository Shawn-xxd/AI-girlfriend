# Tempta 内容工作台

独立 Next.js 管理网站，静态导出部署；所有业务操作通过现有 NestJS `/v1/admin` API，浏览器仅持有公开配置和管理员会话，不持有服务端数据库密钥。

## 已实现

- Supabase 邮箱/密码登录，无公开注册入口；会话仅保存在当前页面内存，刷新需重新登录。
- 服务端实时验证身份，拒绝匿名用户；角色来自服务器管理的 `app_metadata.companion_admin_role`，忽略 `user_metadata`。
- `viewer` 只读；`editor` 保存草稿与上传；`admin` 可审核发布与修改等级规则。
- 角色、人设提示词、封面、上架下架；私有照片上传、审核、等级/钻石解锁配置；成长门槛；操作记录。
- 保存使用版本检查；业务内容与审计记录通过受限 RPC 同事务提交。照片已有权限保护继续沿用旧迁移。
- 手机 Discover/Match 接入角色封面的签名地址。照片正文仍通过原有鉴权和永久授权接口访问。

## 启动和构建

复制 `.env.example` 为 `.env.local` 并提供实际公开配置，不把服务端密钥放入 `NEXT_PUBLIC_*`。仓库根运行 `pnpm dev:admin` 或 `pnpm build:admin`。导出目录为 `apps/admin/out`。

后台页面已完成不等于线上 API 已部署。接入顺序、迁移、管理员授权和验收见 [后台运行手册](../../docs/runbooks/admin-content.md)。
