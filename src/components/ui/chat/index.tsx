// Chat UI kit — hand-authored after shadcn's June-2026 chat primitives
// (MessageScroller / Message / Bubble / Attachment / Marker + an Input Group
// composer). This repo has no components.json, so `shadcn add` has nowhere to
// write and would clash with the kit's theming; these are styled to the
// gold/ivory palette + DM Sans via the semantic tokens, so the admin's
// night theme re-maps them automatically.
//
// Back-compat: MessageScroller `pin`, Message `side`, Bubble `side` + `footer`
// keep the original WhatsApp-inbox API and look.

export { MessageScroller, type MessageScrollerProps } from './MessageScroller'
export {
  Message,
  MessageGroup,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageFooter,
  useMessageAlign,
  type ChatAlign,
  type ChatSide,
} from './Message'
export {
  Bubble,
  BubbleContent,
  BubbleGroup,
  Linkified,
  type BubbleVariant,
  type BubblePosition,
} from './Bubble'
export {
  AttachmentGrid,
  AttachmentImage,
  AttachmentFile,
  AttachmentLightbox,
  isImage,
  type AttachmentItem,
} from './Attachment'
export { Marker, MarkerIcon, MarkerContent, DateMarker } from './Marker'
export { Composer, type ComposerSubmit } from './Composer'
export {
  ConversationList,
  ConversationListItem,
  ConversationListSkeleton,
  ConversationAvatar,
  type ConversationListKind,
} from './ConversationList'
export { UnreadBadge } from './UnreadBadge'
export { ChatAvatar } from './ChatAvatar'
export { TypingIndicator } from './TypingIndicator'
export { ChatNavIcon } from './ChatNavIcon'
export { clockTime, relativeTime, dayLabel, sameDay, formatBytes } from './format'
