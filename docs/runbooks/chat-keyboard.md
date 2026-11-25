# 聊天输入框与键盘同步

## 当前方案：使用现成聊天组件

用户真机反馈上一版事件补滚动有延迟，要求使用成熟组件。本轮采用 Expo SDK 58 推荐的 react-native-keyboard-controller 1.22.7、react-native-reanimated 4.7.1、react-native-worklets 0.13.0，均精确锁定。babel-preset-expo 自动配置 Worklets 插件，不再手工添加重复 Babel 插件。

根布局加入 KeyboardProvider；聊天列表改为 KeyboardChatScrollView，输入区和错误提示放入 KeyboardStickyView；2026-11-25 起等待提示改为消息列表末尾的三点气泡，见 chat-reply-presentation.md。使用库默认的 always 内容抬升模式。列表与输入区共享安全区 offset，键盘收起保留 Home Indicator 安全区，打开时输入框距键盘 8pt。输入区维持正常文档流，只通过现成组件原生 transform 跟随键盘；列表不会因键盘动画逐帧重新布局。多行输入框仍按原有内容高度增长，视口因此改变时保持底部可见。

移除上一版 keyboardWillShow/DidShow 后补 scrollToEnd、keyboardOpening 标记、键盘事件触发的 React 状态及内置 KeyboardAvoidingView。关闭 ScrollView 的重复自动 inset 调整。聚焦输入框、发送、追加消息和历史分页仍使用组件公开滚动方法；这些是业务滚动，不驱动键盘动画。底部可见状态采用库提供的 onEndVisible，不自行计算键盘期间的滚动范围。取消 flexGrow 填满短消息内容，避免键盘 inset 让短聊天被误当成长内容向上推走。

沿用库支持的默认原生配置。没有启用需要 React Native 源码补丁的实验性提交开关，没有开启触摸命中 swizzling。现成组件降低自建动画复杂度，但实际键盘动画仍需 iPhone 真机确认，不能把类型检查或 IPA 成功当作动画验收。

## 安装与交付

本轮新增原生模块，必须生成新 Preview 包并覆盖安装；不得将新代码强推到旧 d6aa9265759509d167eacda416910cc103330031 或 b4df runtime。保留旧包和既有更新可用。Preview 开启 EAS 远程 build number 自动递增，用实际构建输出标识新包，方便用户区分版本。安装时不要先卸载，保留匿名身份与本机聊天记录。

检查：pnpm check、Expo Web 导出、iOS fingerprint、新 Preview 原生构建与 IPA 中模块及 channel/runtime 核验。没有后端、数据库、图片缓存或支付变更。

真机重点检查：

- 长聊天停在底部，点击输入框时最新消息和输入栏应随键盘上移。
- 首次/再次打开键盘，关闭后再打开，以及中英文/表情键盘高度切换。
- 输入多行、发送后输入栏回缩、等待/错误提示出现时仍看见底部消息。
- 上翻历史后点击输入框回到最新；键盘打开后手动上翻可以继续阅读。
- 未操作输入框时加载更早消息，阅读位置保持；短聊天不会被推出顶部。

依据：[Expo Keyboard Controller](https://docs.expo.dev/versions/latest/sdk/keyboard-controller/)、[KeyboardChatScrollView 1.22](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/1.22.0/api/components/keyboard-chat-scroll-view)、[KeyboardStickyView](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/components/keyboard-sticky-view)、[Expo Reanimated](https://docs.expo.dev/versions/latest/sdk/reanimated/)。
