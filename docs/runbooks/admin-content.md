# 后台管理与内容配置

## 架构和交付范围

Next.js 管理网站 → NestJS `/v1/admin` → 现有 Supabase Database/Auth/私有 Storage。保留现有 Railway 和 Supabase，不创建第二套业务数据库。手机端继续使用匿名身份，无注册登录页。

管理内容包括角色、人设提示词、封面、照片、审核和发布、等级门槛与照片钻石价格。未接入真实支付，不提供人工充值、改用户余额或覆盖用户等级的入口。未决定的价格与门槛保留空草稿，由管理员明确填写。

## 上线顺序

1. 对现有指定开发 Supabase 应用新迁移 `20261115151143_admin_content.sql`，不重复执行或改写前六份迁移。先备份并确认目标项目；迁移新增角色封面、内容版本、追加式审计及受限写 RPC，不重建现有业务表。
2. 将本轮 API 代码部署到现有 Railway 服务；readiness 会要求第七份迁移。先迁移、后部署，避免新 API 等待未应用的迁移。
3. 在 Railway 现有 `CORS_ALLOWED_ORIGINS` 中追加实际后台 HTTPS origin，保留已有 origin，不使用 `*`。前端与 API 无跨站 cookie，Authorization Bearer 由浏览器明确发送。
4. 在现有 Supabase Auth 中为指定管理员创建邮箱已确认的非匿名账号，使用安全密码。后台无注册按钮；普通 App 游客账号不能升级为管理员。
5. 通过安全环境变量提供 `SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`ADMIN_USER_ID`、`ADMIN_ROLE=admin`，运行 `pnpm admin:grant`。脚本仅更新服务端 app metadata 的角色，保留其他 metadata，并回读确认。不得将凭证写入 Git、聊天、公共变量或日志。
6. 网站构建时提供三项公开值：`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`；只有 publishable key 可进入网站。网站无需服务器 Secret key。
7. 管理员登录网站，完成实际 API/Auth/Storage 验收后，再发布面向手机的内容。不自动发布现有角色、照片，不自动生成运营素材。

## 权限与内容生命周期

`viewer` 可浏览内容和审计；`editor` 可上传并保存草稿；只有 `admin` 可标记审核通过、发布和设置等级门槛。NestJS 每次使用 Auth `getUser(token)` 获取当前身份与 server-owned metadata，拒绝匿名、邮箱未确认、无授权账号，不信任客户端传入的角色或用户 ID。

编辑者保存已发布内容时将其退回草稿，等待管理员重新发布。角色发布要求非空人设提示词。照片发布要求审核通过；钻石照片还需正式价格。等级从 1 连续递增、初始门槛为 0、后续严格递增，无高级默认门槛。

新增内容请求 revision=null；已有内容必须携带读取时的 revision。角色、照片、等级配置更新触发器递增版本。冲突返回 409，不覆盖其他人的更改。保存与审计在同一 PostgreSQL RPC 内原子提交，审计失败会回滚业务写入。

照片上传先由 API 生成一次性 Storage 上传授权，仅支持 JPEG、PNG、WebP，保存时由服务端检查大小、元数据和文件头。素材保存在现有私有 companion-photos bucket，上传不等于审核或发布。已获授权照片不能替换原图、角色、类型或所需等级；新版本应创建新照片，保留旧授权。无永久删除入口；等级规则变化不扣回已得等级或照片。

封面是角色公开展示素材，只有已发布角色通过公开角色 API 获得一小时签名 URL，不输出 object_key、人设提示词或审计记录。私有付费/等级照片不走封面入口。后台预览签名有效期五分钟，失效可重新打开。

## 验收与边界

- 本地 `pnpm check`：格式、类型、权限/契约/业务测试与 API/Admin 构建。
- `pnpm test:schema`：隔离 PostgreSQL 上重复迁移、RLS/权限、编辑冲突、审计失败回滚，以及原有聊天/记忆/钱包真实数据库并发。
- `pnpm test:integration`：仅对指定开发项目，在第七份迁移应用后执行；不可用本地替身代替云端验收。
- 线上必须验证：普通/匿名身份 403，viewer 写入 403，editor 发布 403；管理员保存角色草稿、审核发布、照片上传与授权、等级规则、并发冲突及审计；手机可见性与已获照片保留。
- 当前照片列表展示最新 200 项；角色和审计支持游标分页。大规模素材库的完整分页/筛选后续补齐。
- 目前无管理员忘记密码 UI、多因素认证 UI、审计导出、自动图片内容审核或素材垃圾回收；上传后未保存的对象不自动删除，避免误删已引用素材。
- 网站创建/发布不代表 API 已部署或数据库迁移已应用。GitHub 与 Railway 的外部状态必须单独确认。

## 本轮交付状态

- 网站已私有发布：[Tempta 内容工作台](https://tempta-content-studio.shawn006.chatgpt.site)，当前仅所有者可访问。
- pnpm check 通过：146 项 Jest、23 项脚本检查、全工作区类型检查及 API/Next.js 构建。
- 新旧八份迁移在隔离 PostgreSQL 上重复执行、后台权限/版本/审计回滚，以及原有数据库并发测试通过。
- 已连接现有开发项目并核验前六份 ledger/checksum；第七份迁移已获确认并应用，八份 ledger/checksum 匹配。管理员账号已创建并验证密码登录与管理员角色；网站后台 API 尚待部署。
- 安全顾问报告现有 leaked-password protection 未启用；可在 [Supabase 密码安全设置](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) 配置。业务表 RLS 无客户端策略为现有服务端专用架构的预期行为，不添加客户端业务权限。
- 环境缺少 cua_repl.js，按 Sites 托管预览规则未运行替代浏览器；浏览器交互与视觉验收未执行。无真实模型/支付调用。

## 接通检查

管理员邮箱为用户确认的 `shawn.xiao.66@gmail.com`，密码由安全环境变量提供，未写入任何文件或日志。账号已创建，server-owned role 与公开 publishable 客户端密码登录均已回读验证。

23 项原有真实开发云端集成和 4 项后台 Auth/Storage 集成通过，临时身份及上传对象已清理，无模型/支付调用。后台测试覆盖 live role 获取、普通用户拒绝、viewer 写入拒绝、editor 发布拒绝，以及真实签名上传、文件头校验和拒绝伪 PNG。Storage info 的大小和 MIME 使用当前 SDK 的顶层字段，兼容旧 metadata 字段。

Railway 当前还需将 `https://tempta-content-studio.shawn006.chatgpt.site` 追加至 `CORS_ALLOWED_ORIGINS`；保留其他已有 origin。没有 Railway 管理令牌时不能代填此设置，不能将账号密码验证通过视为浏览器端已接通。

云端 `service_role` 默认权限与本地不同，因此新增第八份迁移 `20261115155359_admin_audit_privileges.sql`：显式撤销审计表所有服务端默认权限，再只授予 SELECT/INSERT；UPDATE、DELETE、TRUNCATE 均不可用。没有改写已应用的第七份 SQL。八份隔离迁移/并发断言通过；第八份已获确认应用。真实云端事务探针验证角色写入、发布权限、版本冲突、等级配置与审计后整体回滚，临时角色剩余为 0。
