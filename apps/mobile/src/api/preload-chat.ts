import { createChatPreloader } from './preload-chat-core';
import { mobileApi } from './client';
export const preloadChat = createChatPreloader(mobileApi);
