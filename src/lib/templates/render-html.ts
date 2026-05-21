import type {
  EditorBlock,
  TextBlockContent,
  ImageBlockContent,
  ButtonBlockContent,
  DividerBlockContent,
  SpacerBlockContent,
  VideoBlockContent,
  SocialBlockContent,
  HTMLBlockContent,
  ColumnsBlockContent,
  ConditionalBlockContent,
  SarahSignatureBlockContent,
  FileBlockContent,
  TemplateTheme,
} from './editor-types'
import { SOCIAL_PLATFORMS } from './social-icons'

// The Club's brand defaults — warm cream + gold rather than IFG's slate blue.
// Single source of truth; the canvas preview mirrors these values so what
// the user sees in the editor matches what the recipient gets.
export const DEFAULT_THEME: Required<TemplateTheme> = {
  headerBgColor: '#FAFAF7',
  headerTextColor: '#2C2825',
  footerBgColor: '#F3F0EA',
  footerTextColor: '#6B6560',
  footerLinkColor: '#B8975A',
  pageBgColor: '#F7F5F0',
  bodyBgColor: '#FFFFFF',
}

export function resolveTheme(theme?: TemplateTheme | null): Required<TemplateTheme> {
  return { ...DEFAULT_THEME, ...(theme ?? {}) }
}

export function renderBlocksToHTML(
  blocks: EditorBlock[],
  theme?: TemplateTheme | null,
): string {
  const t = resolveTheme(theme)

  const header = `
    <div style="background-color: ${t.headerBgColor}; padding: 28px 20px 20px 20px; text-align: center; border-bottom: 1px solid #E5E0D8;">
      <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 600; color: ${t.headerTextColor}; letter-spacing: 0.5px;">
        The Club
      </div>
      <div style="font-family: 'Montserrat', Arial, sans-serif; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.25em; color: #6B6560; margin-top: 4px;">
        by Sarah Restrick
      </div>
    </div>
  `

  const body = blocks.map((block) => renderBlock(block)).join('')

  const footer = `
    <div style="background-color: ${t.footerBgColor}; padding: 24px 20px; text-align: center; font-size: 12px; color: ${t.footerTextColor};">
      <p style="margin: 0 0 6px 0; font-family: 'Playfair Display', Georgia, serif; font-size: 14px; color: ${t.footerTextColor};">The Club by Sarah Restrick</p>
      <p style="margin: 0 0 10px 0; font-family: 'DM Sans', Arial, sans-serif;">A private membership community</p>
      <p style="margin: 0; font-family: 'DM Sans', Arial, sans-serif;"><a href="{{unsubscribe_url}}" style="color: ${t.footerLinkColor};">Unsubscribe</a></p>
    </div>
  `

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{{subject}}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
  <style type="text/css">
    img { max-width: 100% !important; height: auto !important; }
    table { border-collapse: collapse; }
    @media only screen and (max-width: 600px) {
      .club-shell { width: 100% !important; max-width: 100% !important; }
      .club-content-cell { padding: 18px !important; }
      .club-social a { margin: 0 3px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'DM Sans', Arial, Helvetica, sans-serif; background-color: ${t.pageBgColor};">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${t.pageBgColor};">
    <tr>
      <td align="center">
        <!--[if mso]>
        <table cellpadding="0" cellspacing="0" border="0" width="600" align="center" style="background-color: ${t.bodyBgColor};">
          <tr><td>
        <![endif]-->
        <table class="club-shell" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: ${t.bodyBgColor};">
          <tr>
            <td>${header}</td>
          </tr>
          <tr>
            <td class="club-content-cell" style="padding: 28px 24px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td>${footer}</td>
          </tr>
        </table>
        <!--[if mso]>
          </td></tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

function renderBlock(block: EditorBlock): string {
  switch (block.type) {
    case 'text':
      return renderTextBlock(block.content as TextBlockContent)
    case 'image':
      return renderImageBlock(block.content as ImageBlockContent)
    case 'button':
      return renderButtonBlock(block.content as ButtonBlockContent)
    case 'divider':
      return renderDividerBlock(block.content as DividerBlockContent)
    case 'spacer':
      return renderSpacerBlock(block.content as SpacerBlockContent)
    case 'video':
      return renderVideoBlock(block.content as VideoBlockContent)
    case 'social':
      return renderSocialBlock(block.content as SocialBlockContent)
    case 'html':
      return renderHTMLBlock(block.content as HTMLBlockContent)
    case 'columns':
      return renderColumnsBlock(block.content as ColumnsBlockContent)
    case 'conditional':
      return renderConditionalBlock(block.content as ConditionalBlockContent)
    case 'sarah_signature':
      return renderSarahSignatureBlock(block.content as SarahSignatureBlockContent)
    case 'file':
      return renderFileBlock(block.content as FileBlockContent)
    default:
      return ''
  }
}

function renderTextBlock(content: TextBlockContent): string {
  const fontSize =
    content.fontSize === 'small' ? '14px'
    : content.fontSize === 'large' ? '18px'
    : content.fontSize === 'xlarge' ? '24px'
    : '16px'
  const bgStyle = content.backgroundColor ? `background-color: ${content.backgroundColor};` : ''
  return `
    <div style="text-align: ${content.alignment}; padding-top: ${content.paddingTop}px; padding-bottom: ${content.paddingBottom}px; font-size: ${fontSize}; line-height: 1.6; color: #2C2825; ${bgStyle}">
      ${content.html}
    </div>
  `
}

function renderImageBlock(content: ImageBlockContent): string {
  if (!content.src) {
    return `
      <div style="text-align: ${content.alignment}; padding: 10px 0;">
        <div style="background-color: #F7F5F0; border: 2px dashed #E5E0D8; padding: 40px; text-align: center; color: #A09A93;">
          Image placeholder
        </div>
      </div>
    `
  }
  const widthStyle = content.width === 'auto' ? '' : `width: ${content.width}%; max-width: 100%;`
  const img = `<img src="${resolveAssetUrl(content.src)}" alt="${content.alt}" style="${widthStyle} height: auto; display: block;" />`
  const imageContent = content.linkUrl ? `<a href="${content.linkUrl}" target="_blank">${img}</a>` : img
  return `
    <div style="text-align: ${content.alignment}; padding: 10px 0;">${imageContent}</div>
  `
}

function renderButtonBlock(content: ButtonBlockContent): string {
  const widthStyle = content.width === 'full' ? 'display: block; width: 100%; text-align: center;' : 'display: inline-block;'
  return `
    <div style="text-align: ${content.alignment}; padding-top: ${content.paddingTop}px; padding-bottom: ${content.paddingBottom}px;">
      <a href="${content.url}" target="_blank" style="${widthStyle} background-color: ${content.backgroundColor}; color: ${content.textColor}; padding: ${content.paddingY || 12}px ${content.paddingX || 24}px; text-decoration: none; border-radius: ${content.borderRadius}px; font-family: 'DM Sans', Arial, sans-serif; font-weight: 500; font-size: 14px; letter-spacing: 0.3px;">
        ${content.text}
      </a>
    </div>
  `
}

function renderDividerBlock(content: DividerBlockContent): string {
  return `
    <div style="padding-top: ${content.paddingTop}px; padding-bottom: ${content.paddingBottom}px;">
      <hr style="border: none; border-top: ${content.thickness}px ${content.style} ${content.color}; margin: 0;" />
    </div>
  `
}

function renderSpacerBlock(content: SpacerBlockContent): string {
  return `<div style="height: ${content.height}px;"></div>`
}

function renderVideoBlock(content: VideoBlockContent): string {
  if (!content.url) {
    return `
      <div style="text-align: ${content.alignment}; padding: 10px 0;">
        <div style="background-color: #2C2825; padding: 60px 40px; text-align: center; color: white;">
          <span style="font-size: 48px;">▶</span>
          <p style="margin: 10px 0 0 0;">Video placeholder</p>
        </div>
      </div>
    `
  }
  const thumbnailUrl = content.thumbnailUrl || getVideoThumbnail(content.url)
  const videoWidth = content.width === 'full' ? '100%' : `${content.width}px`
  return `
    <div style="text-align: ${content.alignment}; padding: 10px 0;">
      <a href="${content.url}" target="_blank" style="text-decoration: none;">
        <table cellpadding="0" cellspacing="0" border="0" width="${videoWidth}" style="max-width: ${videoWidth}; background-image: url('${thumbnailUrl}'); background-size: cover; background-position: center;">
          <tr>
            <td align="center" valign="middle" style="padding: 60px 0; text-align: center;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" valign="middle" width="60" height="60" style="width: 60px; height: 60px; background-color: #2C2825; border-radius: 50%; text-align: center; vertical-align: middle; font-size: 24px; color: #ffffff; opacity: 0.85;">
                    &#9654;
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </a>
    </div>
  `
}

function getVideoThumbnail(url: string): string {
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (youtubeMatch) return `https://img.youtube.com/vi/${youtubeMatch[1]}/maxresdefault.jpg`
  return 'https://via.placeholder.com/600x340/2C2825/ffffff?text=Video'
}

function renderSocialBlock(content: SocialBlockContent): string {
  const enabled = SOCIAL_PLATFORMS.filter((p) => content.platforms[p.key]?.enabled)
  if (enabled.length === 0) return ''
  const iconElements = enabled
    .map((p) => {
      const url = content.platforms[p.key]?.url || '#'
      const iconColor = (content.style === 'coloured' ? p.brandColor : '#6B6560').replace('#', '')
      const slug = p.cdnSlug ?? p.key
      const iconUrl = `https://cdn.simpleicons.org/${slug}/${iconColor}`
      return `
        <a href="${url}" target="_blank" style="display: inline-block; margin: 0 8px; text-decoration: none; line-height: 0;">
          <img src="${iconUrl}" width="22" height="22" alt="${p.label}" style="border: 0; display: inline-block; vertical-align: middle;" />
        </a>
      `
    })
    .join('')
  return `
    <div class="club-social" style="text-align: ${content.alignment}; padding: 15px 0;">${iconElements}</div>
  `
}

function renderHTMLBlock(content: HTMLBlockContent): string {
  return content.code || ''
}

function renderColumnsBlock(content: ColumnsBlockContent): string {
  const gap = content.gap || 20
  const halfGap = Math.floor(gap / 2)
  const widths = content.columnWidths || (content.columns === 3 ? [33, 33, 34] : [50, 50])
  const renderColumnBlocks = (blocks: EditorBlock[]): string => {
    if (!blocks || blocks.length === 0) {
      return '<p style="margin: 0; color: #A09A93; font-size: 14px;">Empty column</p>'
    }
    return blocks.map((block) => renderBlock(block)).join('')
  }
  const leftTd = `<td style="width: ${widths[0]}%; vertical-align: top; padding-right: ${halfGap}px;">${renderColumnBlocks(content.leftBlocks)}</td>`
  let centerTd = ''
  if (content.columns === 3 && content.centerBlocks) {
    centerTd = `<td style="width: ${widths[1]}%; vertical-align: top; padding-left: ${halfGap}px; padding-right: ${halfGap}px;">${renderColumnBlocks(content.centerBlocks)}</td>`
  }
  const rightTd = `<td style="width: ${widths[content.columns === 3 ? 2 : 1]}%; vertical-align: top; padding-left: ${halfGap}px;">${renderColumnBlocks(content.rightBlocks)}</td>`
  return `
    <div style="padding-top: ${content.paddingTop || 0}px; padding-bottom: ${content.paddingBottom || 0}px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="table-layout: fixed;">
        <tr>${leftTd}${centerTd}${rightTd}</tr>
      </table>
    </div>
  `
}

function renderConditionalBlock(content: ConditionalBlockContent): string {
  if (!content.children || content.children.length === 0) return ''
  const childrenHtml = content.children.map((block) => renderBlock(block)).join('')
  return `
    <div style="padding-top: ${content.paddingTop || 0}px; padding-bottom: ${content.paddingBottom || 0}px;">
      {{#if ${content.conditionField} ${content.conditionOperator} "${content.conditionValue}"}}${childrenHtml}{{/if}}
    </div>
  `
}

function resolveAssetUrl(src: string): string {
  if (!src) return ''
  if (/^(https?:|data:|cid:)/i.test(src)) return src
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${src.startsWith('/') ? src : '/' + src}`
  }
  return `${process.env.NEXT_PUBLIC_APP_URL || ''}${src.startsWith('/') ? src : '/' + src}`
}

// Sarah Restrick signature — variable sender details on top, baked-in
// brand line + confidentiality below. The brand text always renders so
// every email carries The Club's identity; the variable bits can be
// toggled.
function renderSarahSignatureBlock(content: SarahSignatureBlockContent): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const c = content.textColor
  const companyColor = content.companyTextColor || '#6B6560'
  const disclaimerColor = content.confidentialityColor || '#A09A93'

  const signOffHtml =
    content.showSignOff !== false
      ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: ${c || '#374151'};">${escape(content.signOff || 'Warm regards,')}</p>`
      : ''

  const FALLBACK_NAME = 'Sarah Restrick'
  const FALLBACK_TITLE = 'Founder, The Club'
  const FALLBACK_EMAIL = 'sarah@theclub.example.com'
  const FALLBACK_PHONE = ''
  const FALLBACK_WEBSITE = 'theclub.example.com'

  const nameHtml = content.showName
    ? `<p style="margin: 0 0 2px 0; font-family: 'Playfair Display', Georgia, serif; font-weight: 600; font-size: 17px; color: ${c || '#2C2825'};">{{sender_name|${FALLBACK_NAME}}}</p>`
    : ''
  const titleHtml = content.showTitle
    ? `<p style="margin: 0 0 2px 0; font-size: 13px; color: ${c || '#6B6560'};">{{sender_title|${FALLBACK_TITLE}}}</p>`
    : ''
  const emailHtml = content.showEmail
    ? `<p style="margin: 0 0 2px 0; font-size: 13px;"><a href="mailto:{{sender_email|${FALLBACK_EMAIL}}}" style="color: ${c || '#B8975A'}; text-decoration: none;">{{sender_email|${FALLBACK_EMAIL}}}</a></p>`
    : ''
  const phoneHtml = content.showPhone
    ? `<p style="margin: 0 0 2px 0; font-size: 13px; color: ${c || '#374151'};">{{sender_phone|${FALLBACK_PHONE}}}</p>`
    : ''
  const websiteHtml = content.showWebsite
    ? `<p style="margin: 4px 0 0 0; font-size: 13px;"><a href="https://${FALLBACK_WEBSITE}" target="_blank" style="color: ${c || '#B8975A'}; text-decoration: none;">${FALLBACK_WEBSITE}</a></p>`
    : ''

  const detailsHtml = `${signOffHtml}${nameHtml}${titleHtml}${emailHtml}${phoneHtml}${websiteHtml}`

  // Always-rendered brand block + confidentiality. Sarah's branding ships
  // with every email — same posture as IFG's company footer.
  const brandHtml = `
    <p style="margin: 18px 0 0 0; font-family: 'Playfair Display', Georgia, serif; font-size: 14px; color: ${companyColor};">The Club <span style="font-family: 'Montserrat', Arial, sans-serif; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.2em; color: ${companyColor};"> · by Sarah Restrick</span></p>
    <p style="margin: 6px 0 0 0; font-size: 11px; line-height: 1.5; color: ${disclaimerColor};">
      <strong>Confidentiality:</strong> This email and any attachments are confidential and intended solely for the addressee. If you have received this message in error, please notify the sender and delete it from your records. The Club is a private membership community curated by Sarah Restrick.
    </p>
  `

  return `
    <div style="text-align: ${content.alignment}; padding-top: ${content.paddingTop}px; padding-bottom: ${content.paddingBottom}px;">
      ${detailsHtml}
      ${brandHtml}
    </div>
  `
}

function renderFileBlock(content: FileBlockContent): string {
  if (!content.fileUrl) return ''
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  const formattedSize = formatFileSize(content.fileSize || 0)
  return `
    <div style="text-align: ${content.alignment || 'left'}; padding-top: ${content.paddingTop || 10}px; padding-bottom: ${content.paddingBottom || 10}px;">
      <a href="${content.fileUrl}" target="_blank" style="display: inline-block; padding: 12px 16px; background: #F7F5F0; border: 1px solid #E5E0D8; border-radius: 8px; text-decoration: none; color: #2C2825; font-family: 'DM Sans', Arial, sans-serif;">
        &#128206; <strong>${content.fileName || 'Attachment'}</strong>
        <span style="color: #A09A93; font-size: 12px; margin-left: 4px;">(${formattedSize})</span>
      </a>
    </div>
  `
}

export function replaceVariables(
  html: string,
  data: {
    first_name?: string
    last_name?: string
    email?: string
    event_name?: string
    sender_name?: string
    sender_email?: string
    unsubscribe_url?: string
    subject?: string
  }
): string {
  return html
    .replace(/\{\{first_name\}\}/g, data.first_name || '')
    .replace(/\{\{last_name\}\}/g, data.last_name || '')
    .replace(/\{\{email\}\}/g, data.email || '')
    .replace(/\{\{event_name\}\}/g, data.event_name || '')
    .replace(/\{\{sender_name\}\}/g, data.sender_name || '')
    .replace(/\{\{sender_email\}\}/g, data.sender_email || '')
    .replace(/\{\{unsubscribe_url\}\}/g, data.unsubscribe_url || '#')
    .replace(/\{\{subject\}\}/g, data.subject || '')
}
