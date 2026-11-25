# 原生启动屏与首屏准备

采用 Expo SDK 58 官方 expo-splash-screen 58.0.14 和 config plugin；深色底色与 App 一致，本地 TEMPTA 字标，使用官方 180ms 淡出。不设最短展示时间，不新增自定义原生启动框架。模块作用域 preventAutoHideAsync，React 封面完成布局且本地字标解码完成后隐藏原生启动屏，交接到相同背景和字标的 React 准备封面，资源就绪立即进入。更改原生启动资源需要新的 Preview 包，直接覆盖安装，不先卸载。

字标下方显示 160×3 的细进度条，使用 React Native 内置 Animated 平滑更新宽度，不增加依赖。进度来自偏好恢复、身份恢复、同 owner viewer、有效目录、首图和目标路由的完成情况；并行任务各自推进，全部就绪才完成。不是下载字节百分比或剩余时间，不显示数字/阶段文案，不按固定计时模拟，不为播放完成动画延后进入首页。失败时替换为原有重试/继续操作。原生静态启动资源不变，此改动可通过与 build 3 相同的 runtime 热更新；原生启动屏尚未交接给 JS 时不显示动态进度条。

AppStartup 不阻止 Auth、现有加密历史恢复和导航挂载，避免等待流程自身无法开始。返回用户复用现有 owner 分区的 TanStack Query：/me 与角色目录在身份恢复后并行，角色目录与首页共用进行中请求；首张封面使用现有 public cover/native Image 预载队列。查询成功且首张封面就绪后进入。没有封面的角色/空目录使用现有空态，不无限等图。新用户本机引导状态恢复后直接进入 onboarding，显式设计 Preview 也不等后端身份。

聊天列表在同 owner 的 viewer 可用后并行读取，不阻塞首页；前三个聊天头像在首张封面预载完成后再预取，避免抢占首屏图片下载槽。完整历史、相册、私照、钱包不加入启动屏的阻塞条件。进入页面继续使用同一 QueryClient 和新鲜期，不重复初始化游客或创建替代身份。仅接受当前恢复身份的 viewer；已知权限/异常响应不能因为旧缓存而视为就绪，暂时网络失败仍按既有缓存策略处理。

六秒软截止从本次冷启动的准备组件挂载开始计算。正常情况资源就绪立即进入；失败或超时在准备封面显示简洁的重试/继续页面。重试复用进行中请求，重新尝试首张封面；继续只关闭启动提示，页面自身的身份、权限和错误处理仍生效，可以进入有缓存的其他 Tab。之后后台请求成功也可自动完成。失败不会让准备封面永久阻塞 App。

cover prefetch 只增加成功/失败返回值供启动屏判断，没有改变并发数、缓存窗口或下载逻辑；失败首图不能假装准备完成。准备完成后组件卸载，释放查询观察和计时器。切 Tab、从后台回前台不重新展示；杀掉进程后再启动才重新准备。

验证：就绪条件、首次引导、同 owner 缓存、身份不匹配/已知拒绝、首图失败、截止与重试状态；实际 QueryClient 证明启动和页面请求去重及就绪后复用。pnpm check、Web 导出、Preview fingerprint、EAS 构建、IPA 原生模块/资源/runtime 核验。iPhone 冷启动首帧、真实等待时长、淡出、弱网重试/继续、首次引导和原有键盘交互仍需真机验证，不能以导出或编译代替。

字标为本地透明 PNG，1024×320；使用 Liberation Sans Bold 绘制 TEMPTA，深色背景由插件配置。不是远程图片，不依赖网络加载品牌封面。

参考：[Expo SplashScreen](https://docs.expo.dev/versions/latest/sdk/splash-screen/)、[React Native Animated](https://reactnative.dev/docs/animated)、[Apple Launching](https://developer.apple.com/design/human-interface-guidelines/launching)。本次核对当前安装版 expo-splash-screen 的 API/README 与 React Native 官方 Animated 文档。
