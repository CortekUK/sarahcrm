// Chat hooks barrel — see each file's header for behaviour.
export { useConversations, useConversation } from './useConversations'
export { useMessages, MESSAGES_PAGE_SIZE } from './useMessages'
export { useSendMessage, type SendInput } from './useSendMessage'
export {
  useUploadAttachment,
  validateAttachment,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
} from './useUploadAttachment'
export { useMarkRead } from './useMarkRead'
export { useTyping } from './useTyping'
export { usePeople } from './usePeople'
export * from './useChatMutations'
