# 聊天输入提示与新回复展示

正常待回复的用户气泡只显示用户原文，移除 Preparing a reply…；取消输入栏上方的 Thinking… / Almost ready… 和转圈。失败/拒绝/租约到期仍保留错误与手动重试，不能把失败显示为成功。

等待时在消息列表末尾、对方一侧展示三点气泡，与普通对方气泡一致。参考成熟聊天 UI 的 typing indicator 模式，复用 Expo 推荐且已安装的 Reanimated 4.7.1，以 withDelay/withSequence/withRepeat 驱动三点动画，卸载取消，尊重减少动态效果设置。保留已获用户认可的 KeyboardChatScrollView / KeyboardStickyView，不替换整套聊天框架。

Expo 没有开箱即用的聊天/逐字回复组件。本次仅为当前页刚收到、此前未显示的 completed 回复增加逐字呈现，使用普通 React Native Text；旧历史、轮询恢复、重新进入页面和同请求键重放直接完整显示。后端依然完整审核并事务保存后才交付，客户端不把呈现动画当作供应商 token 流，不显示未审核增量，不增加生成请求。完整回复立即进入现有 QueryClient 和加密历史缓存，展示进度不写入缓存。动画不延迟持久化，也不阻止发送下一条；新一轮开始即结束上一条呈现。

逐字按 Unicode 字素切分：使用成熟纯 JS 库 unicode-segmenter 0.17.3 的 grapheme 入口，不自行实现表情拆分。Hermes 不保证有 Intl.Segmenter，不能依赖浏览器支持推断手机可用。不修改全局 Intl。常规每字约 18ms，长回复整体最多约 2.2 秒；后台或页面卸载时停止计时，减少动态效果开启时直接显示全文。无逐字符读屏播报，完整内容保留可访问标签。

等待生成和本机待发送事务保持原幂等流程。收到并验证 completed 后立即停止输入提示，存储清理期间不重新闪现三点；失败或断网有明确错误和重试。

验证：中文/组合表情/换行完整性、长文上限、取消清理、零/单字符；原 SSE 的身份、请求键、截断、拒绝与取消测试；pnpm check。发布前核对当前 Preview iOS fingerprint，仍匹配 build 3 才发布对应热更新。iPhone 键盘、逐字速度与滚动效果由真机确认。

参考：[Expo Animation](https://docs.expo.dev/develop/user-interface/animation/)、[Reanimated withRepeat](https://docs.swmansion.com/react-native-reanimated/docs/animations/withRepeat/)、[Gifted Chat TypingIndicator](https://github.com/FaridSafi/react-native-gifted-chat/blob/master/src/TypingIndicator/index.tsx)、[unicode-segmenter](https://github.com/cometkim/unicode-segmenter)。仅参考成熟交互，未引入 Gifted Chat 整套依赖或替换已验证的键盘组件。
