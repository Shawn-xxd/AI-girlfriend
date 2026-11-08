# Railway API 部署准备

## 已验证的产物

仓库根目录 railway.json 指定 apps/api/Dockerfile。Node 24.22.2、pnpm 11.25.0，冻结依赖安装；先复制清单以复用安装缓存，再构建 API 与 shared，独立部署生产依赖。dotenv 已在 API 直接声明，生产镜像不依赖工作区根目录隐含依赖。镜像使用 node 用户运行，不包含 Expo、Jest、TypeScript、.env 或云环境 CA。

Docker build 通过；本机容器以只读文件系统和 UID 1000 实测：存活 200、真实开发 Supabase schema readiness 200、未认证角色接口 401。验收临时变量文件和容器已清理；未调用 AI。构建和运行都没有关闭 TLS 校验。

```bash
docker build -f apps/api/Dockerfile -t companion-api:guest-acceptance .
pnpm test:container
```

Codex 云环境构建需保留 Docker 默认代理，并用 BuildKit secret 临时挂载提供的公共 CA：

```bash
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -f apps/api/Dockerfile -t companion-api:guest-acceptance .
```

CA 只供相应网络步骤使用，不进入镜像。test:container 针对当前 Linux 云环境及指定开发 Supabase，不接收生产目标，也不注入 AI Key；它不是外部部署。

## Railway 操作

1. 创建开发服务，连接 Shawn-xxd/AI-girlfriend 的 main 分支，服务根目录保持仓库根目录。使用仓库 railway.json 的 Dockerfile 配置，不另填 Expo 或移动端启动命令。
2. 在 Railway Variables 设置下表。所有秘密只放平台变量，不写 Git、镜像构建参数或聊天。PORT 由平台提供，应用监听 0.0.0.0。
3. 部署后由 /v1/health/ready 验证正式 schema。应用不会自动 DDL 或重复执行迁移；当前开发项目三份迁移已应用。
4. 生成实际 HTTPS 域名，验证 /v1/health/live 与 /ready 均为 200，缺 bearer token 的 /v1/characters 应为 401。
5. 将实际 HTTPS API 地址填入移动端构建的 EXPO_PUBLIC_API_URL，重新生成相应开发构建。浏览器联调还需服务端设置精确 CORS_ALLOWED_ORIGINS；原生 iOS 不需要 CORS。

| 服务端变量                              | 内容                                               |
| --------------------------------------- | -------------------------------------------------- |
| NODE_ENV                                | production（运行模式；首个服务仍连接开发数据项目） |
| SUPABASE_URL                            | 对应环境的 Supabase 项目 URL                       |
| SUPABASE_SECRET_KEY                     | 对应项目的服务端 Secret key                        |
| AI_PROVIDER / AI_MODEL                  | 当前 deepseek / deepseek-chat，按已验证模型配置    |
| DEEPSEEK_API_KEY                        | 当前供应商服务端 Key                               |
| MODERATION_PROVIDER / MODERATION_MODEL  | 当前 deepseek / deepseek-chat，审核独立配置        |
| AI_MAX_OUTPUT_TOKENS / AI_CONTEXT_TURNS | 可选，默认 512 / 10，不是用户聊天额度              |
| CORS_ALLOWED_ORIGINS                    | 可选浏览器 origin 白名单，不能填通配               |

移动端只接收公开 API URL、Supabase URL 和 publishable key。全程后台自动匿名身份，不加入登录或注册页面。服务端 Secret key / 模型 Key 绝不能进入 EXPO*PUBLIC*\*。

## 环境与验收

Development / Staging / Production 要使用独立数据项目和凭证。当前 seed 只允许开发项目，不能在正式项目自动填示例角色；发布流程不能把设计预览开关带入真实版本。新环境的迁移通过受控渠道按 manifest 顺序应用。

当前没有可访问的 Railway 发布地址，不能把 Docker 构建成功说成已经上线。若需要 Codex 检查生成的新域名，需在云环境允许该实际域名；当前任务没有扩展网络白名单或创建外部计费服务。

原生 iOS 仍需确定最终 Bundle ID、EAS 项目及设备/开发者配置后验证，JavaScript 资源导出不替代真机结果。
