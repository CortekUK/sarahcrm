// Schema bridge between OpenAI structured-output and the editor's EditorBlock.
//
// The full EditorBlock shape is too detailed to ask GPT to fill out reliably —
// every block has 8+ styling props. So we give the model a *simplified*
// "AiBlock" schema: just the semantic fields (text, url, alignment, etc.) and
// let the server expand each AiBlock into a full EditorBlock with
// defaultBlockContent merged in.

import { z } from 'zod'
import type {
  EditorBlock,
  TextBlockContent,
  ButtonBlockContent,
  DividerBlockContent,
  SpacerBlockContent,
  ImageBlockContent,
  SarahSignatureBlockContent,
  HTMLBlockContent,
  VideoBlockContent,
  SocialBlockContent,
  ColumnsBlockContent,
} from './editor-types'
import { defaultBlockContent } from './editor-types'

const alignmentSchema = z.enum(['left', 'center', 'right'])
const fontSizeSchema = z.enum(['small', 'normal', 'large', 'xlarge'])
const dividerStyleSchema = z.enum(['solid', 'dashed', 'dotted'])
const imageWidthSchema = z.enum(['full', 'large', 'medium', 'small'])
const headingLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

const paddingTop = z.number().int().min(0).max(80).nullish()
const paddingBottom = z.number().int().min(0).max(80).nullish()

const textBlockSchema = z.object({
  type: z.literal('text'),
  html: z.string().describe(
    'Paragraph content as simple HTML. Allowed tags: p, br, strong, em, u, a (href), ul, ol, li, span. Use {{first_name|there}} merge tags freely.',
  ),
  alignment: alignmentSchema.nullish(),
  size: fontSizeSchema.nullish(),
  color: z.string().nullish().describe('Optional hex colour for the whole block.'),
  background: z.string().nullish(),
  paddingTop,
  paddingBottom,
})

const headingBlockSchema = z.object({
  type: z.literal('heading'),
  text: z.string(),
  level: headingLevelSchema.nullish(),
  alignment: alignmentSchema.nullish(),
  color: z.string().nullish(),
  background: z.string().nullish(),
  paddingTop,
  paddingBottom,
})

const buttonBlockSchema = z.object({
  type: z.literal('button'),
  text: z.string(),
  url: z.string(),
  color: z.string().nullish().describe('Hex bg colour. Defaults to brand gold (#B8975A).'),
  textColor: z.string().nullish(),
  alignment: alignmentSchema.nullish(),
  borderRadius: z.number().int().min(0).max(9999).nullish(),
  width: z.enum(['auto', '50', '75', 'full']).nullish(),
  paddingTop,
  paddingBottom,
})

const dividerBlockSchema = z.object({
  type: z.literal('divider'),
  style: dividerStyleSchema.nullish(),
  color: z.string().nullish(),
  thickness: z.number().int().min(1).max(8).nullish(),
  width: z.enum(['25', '50', '75', '100']).nullish(),
  paddingTop,
  paddingBottom,
})

const spacerBlockSchema = z.object({
  type: z.literal('spacer'),
  height: z.number().int().min(8).max(80).nullish(),
})

const imageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.string(),
  alt: z.string().nullish(),
  alignment: alignmentSchema.nullish(),
  width: imageWidthSchema.nullish(),
  linkUrl: z.string().nullish(),
  paddingTop,
  paddingBottom,
})

// The Club's Sarah-branded signature.
const signatureBlockSchema = z.object({
  type: z.literal('sarah_signature'),
  showName: z.boolean().nullish(),
  showTitle: z.boolean().nullish(),
  showEmail: z.boolean().nullish(),
  showPhone: z.boolean().nullish(),
  showWebsite: z.boolean().nullish(),
  showSignOff: z.boolean().nullish(),
  signOff: z.string().nullish().describe('Sign-off line e.g. "Warm regards,"'),
  alignment: alignmentSchema.nullish(),
  textColor: z.string().nullish().describe('Hex colour for variable details only.'),
  companyTextColor: z.string().nullish().describe('Hex colour for "The Club by Sarah Restrick" line.'),
  confidentialityColor: z.string().nullish().describe('Hex colour for the disclaimer paragraph.'),
  paddingTop,
  paddingBottom,
})

const htmlBlockSchema = z.object({
  type: z.literal('html'),
  code: z.string(),
})

const videoBlockSchema = z.object({
  type: z.literal('video'),
  url: z.string(),
  thumbnailUrl: z.string().nullish(),
  alignment: alignmentSchema.nullish(),
  width: z.union([z.literal('full'), z.number().int().min(120).max(800)]).nullish(),
})

const socialPlatformsSchema = z.object({
  facebook: z.object({ enabled: z.boolean(), url: z.string().nullish() }).nullish(),
  twitter: z.object({ enabled: z.boolean(), url: z.string().nullish() }).nullish(),
  instagram: z.object({ enabled: z.boolean(), url: z.string().nullish() }).nullish(),
  linkedin: z.object({ enabled: z.boolean(), url: z.string().nullish() }).nullish(),
  youtube: z.object({ enabled: z.boolean(), url: z.string().nullish() }).nullish(),
})

const socialBlockSchema = z.object({
  type: z.literal('social'),
  platforms: socialPlatformsSchema,
  style: z.enum(['coloured', 'monochrome']).nullish(),
  alignment: alignmentSchema.nullish(),
})

const basicAiBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  headingBlockSchema,
  buttonBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema,
  imageBlockSchema,
])
export type BasicAiBlock = z.infer<typeof basicAiBlockSchema>

const columnsBlockSchema = z.object({
  type: z.literal('columns'),
  columns: z.union([z.literal(2), z.literal(3)]),
  leftBlocks: z.array(basicAiBlockSchema),
  rightBlocks: z.array(basicAiBlockSchema),
  centerBlocks: z.array(basicAiBlockSchema).nullish(),
})

export const aiBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  headingBlockSchema,
  buttonBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema,
  imageBlockSchema,
  signatureBlockSchema,
  htmlBlockSchema,
  videoBlockSchema,
  socialBlockSchema,
  columnsBlockSchema,
])
export type AiBlock = z.infer<typeof aiBlockSchema>

export const aiTemplateResponseSchema = z.object({
  intent: z.enum(['answer', 'create', 'enhance']),
  reply: z.string().min(1).max(4000),
  name: z.string().max(80),
  subject: z.string().max(200),
  preheader: z.string().max(200).nullish(),
  blocks: z.array(aiBlockSchema).max(40),
  theme: z
    .object({
      headerBgColor: z.string().nullish(),
      headerTextColor: z.string().nullish(),
      footerBgColor: z.string().nullish(),
      footerTextColor: z.string().nullish(),
      footerLinkColor: z.string().nullish(),
      pageBgColor: z.string().nullish(),
      bodyBgColor: z.string().nullish(),
    })
    .nullish(),
})
export type AiTemplateResponse = z.infer<typeof aiTemplateResponseSchema>

// ---------------------------------------------------------------------------
// JSON Schema for OpenAI structured outputs (strict-mode)
// ---------------------------------------------------------------------------

const nullableEnum = (values: readonly (string | number)[]) => ({
  anyOf: [
    { type: typeof values[0] === 'number' ? 'integer' : 'string', enum: [...values] },
    { type: 'null' },
  ],
})
const nullableString = () => ({ anyOf: [{ type: 'string' }, { type: 'null' }] })
const nullableInteger = () => ({ anyOf: [{ type: 'integer' }, { type: 'null' }] })
const nullableBoolean = () => ({ anyOf: [{ type: 'boolean' }, { type: 'null' }] })

const textBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'html', 'alignment', 'size', 'color', 'background', 'paddingTop', 'paddingBottom'],
  properties: {
    type: { type: 'string', enum: ['text'] },
    html: { type: 'string' },
    alignment: nullableEnum(['left', 'center', 'right']),
    size: nullableEnum(['small', 'normal', 'large', 'xlarge']),
    color: nullableString(),
    background: nullableString(),
    paddingTop: nullableInteger(),
    paddingBottom: nullableInteger(),
  },
}
const headingBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'text', 'level', 'alignment', 'color', 'background', 'paddingTop', 'paddingBottom'],
  properties: {
    type: { type: 'string', enum: ['heading'] },
    text: { type: 'string' },
    level: nullableEnum([1, 2, 3]),
    alignment: nullableEnum(['left', 'center', 'right']),
    color: nullableString(),
    background: nullableString(),
    paddingTop: nullableInteger(),
    paddingBottom: nullableInteger(),
  },
}
const buttonBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'text', 'url', 'color', 'textColor', 'alignment', 'borderRadius', 'width', 'paddingTop', 'paddingBottom'],
  properties: {
    type: { type: 'string', enum: ['button'] },
    text: { type: 'string' },
    url: { type: 'string' },
    color: nullableString(),
    textColor: nullableString(),
    alignment: nullableEnum(['left', 'center', 'right']),
    borderRadius: nullableInteger(),
    width: nullableEnum(['auto', '50', '75', 'full']),
    paddingTop: nullableInteger(),
    paddingBottom: nullableInteger(),
  },
}
const dividerBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'style', 'color', 'thickness', 'width', 'paddingTop', 'paddingBottom'],
  properties: {
    type: { type: 'string', enum: ['divider'] },
    style: nullableEnum(['solid', 'dashed', 'dotted']),
    color: nullableString(),
    thickness: nullableInteger(),
    width: nullableEnum(['25', '50', '75', '100']),
    paddingTop: nullableInteger(),
    paddingBottom: nullableInteger(),
  },
}
const spacerBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'height'],
  properties: {
    type: { type: 'string', enum: ['spacer'] },
    height: nullableInteger(),
  },
}
const imageBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'url', 'alt', 'alignment', 'width', 'linkUrl', 'paddingTop', 'paddingBottom'],
  properties: {
    type: { type: 'string', enum: ['image'] },
    url: { type: 'string' },
    alt: nullableString(),
    alignment: nullableEnum(['left', 'center', 'right']),
    width: nullableEnum(['full', 'large', 'medium', 'small']),
    linkUrl: nullableString(),
    paddingTop: nullableInteger(),
    paddingBottom: nullableInteger(),
  },
}
const signatureBranch = {
  type: 'object',
  additionalProperties: false,
  required: [
    'type', 'showName', 'showTitle', 'showEmail', 'showPhone', 'showWebsite',
    'showSignOff', 'signOff', 'alignment',
    'textColor', 'companyTextColor', 'confidentialityColor',
    'paddingTop', 'paddingBottom',
  ],
  properties: {
    type: { type: 'string', enum: ['sarah_signature'] },
    showName: nullableBoolean(),
    showTitle: nullableBoolean(),
    showEmail: nullableBoolean(),
    showPhone: nullableBoolean(),
    showWebsite: nullableBoolean(),
    showSignOff: nullableBoolean(),
    signOff: nullableString(),
    alignment: nullableEnum(['left', 'center', 'right']),
    textColor: nullableString(),
    companyTextColor: nullableString(),
    confidentialityColor: nullableString(),
    paddingTop: nullableInteger(),
    paddingBottom: nullableInteger(),
  },
}
const htmlBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'code'],
  properties: {
    type: { type: 'string', enum: ['html'] },
    code: { type: 'string' },
  },
}
const videoBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'url', 'thumbnailUrl', 'alignment', 'width'],
  properties: {
    type: { type: 'string', enum: ['video'] },
    url: { type: 'string' },
    thumbnailUrl: nullableString(),
    alignment: nullableEnum(['left', 'center', 'right']),
    width: nullableEnum(['full']),
  },
}

function socialPlatformObjectSchema() {
  return {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['enabled', 'url'],
        properties: {
          enabled: { type: 'boolean' },
          url: nullableString(),
        },
      },
      { type: 'null' },
    ],
  }
}

const socialBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'platforms', 'style', 'alignment'],
  properties: {
    type: { type: 'string', enum: ['social'] },
    platforms: {
      type: 'object',
      additionalProperties: false,
      required: ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'],
      properties: {
        facebook: socialPlatformObjectSchema(),
        twitter: socialPlatformObjectSchema(),
        instagram: socialPlatformObjectSchema(),
        linkedin: socialPlatformObjectSchema(),
        youtube: socialPlatformObjectSchema(),
      },
    },
    style: nullableEnum(['coloured', 'monochrome']),
    alignment: nullableEnum(['left', 'center', 'right']),
  },
}

const basicBlockBranches = [textBranch, headingBranch, buttonBranch, dividerBranch, spacerBranch, imageBranch]

const columnsBranch = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'columns', 'leftBlocks', 'rightBlocks', 'centerBlocks'],
  properties: {
    type: { type: 'string', enum: ['columns'] },
    columns: { type: 'integer', enum: [2, 3] },
    leftBlocks: { type: 'array', items: { anyOf: basicBlockBranches } },
    rightBlocks: { type: 'array', items: { anyOf: basicBlockBranches } },
    centerBlocks: {
      anyOf: [
        { type: 'array', items: { anyOf: basicBlockBranches } },
        { type: 'null' },
      ],
    },
  },
}

export const openAiJsonSchema = {
  name: 'EmailTemplate',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'reply', 'name', 'subject', 'preheader', 'blocks', 'theme'],
    properties: {
      intent: { type: 'string', enum: ['answer', 'create', 'enhance'] },
      reply: { type: 'string' },
      name: { type: 'string' },
      subject: { type: 'string' },
      preheader: nullableString(),
      blocks: {
        type: 'array',
        items: {
          anyOf: [
            textBranch, headingBranch, buttonBranch, dividerBranch, spacerBranch,
            imageBranch, signatureBranch, htmlBranch, videoBranch, socialBranch, columnsBranch,
          ],
        },
      },
      theme: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: [
              'headerBgColor', 'headerTextColor', 'footerBgColor', 'footerTextColor',
              'footerLinkColor', 'pageBgColor', 'bodyBgColor',
            ],
            properties: {
              headerBgColor: nullableString(),
              headerTextColor: nullableString(),
              footerBgColor: nullableString(),
              footerTextColor: nullableString(),
              footerLinkColor: nullableString(),
              pageBgColor: nullableString(),
              bodyBgColor: nullableString(),
            },
          },
          { type: 'null' },
        ],
      },
    },
  },
} as const

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

const DANGEROUS_TAG = /<\s*(script|iframe|style|object|embed|form|input|button|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi
const DANGEROUS_SELF_CLOSING = /<\s*(script|iframe|style|object|embed|form|input|button|link|meta|base)\b[^>]*\/?\s*>/gi
const ON_HANDLERS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_URL = /\b(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi
const DATA_URL_BLACKLIST = /\b(href|src)\s*=\s*("data:[^"]*"|'data:[^']*')/gi

function sanitizeHtml(input: string): string {
  if (!input) return ''
  return input
    .replace(DANGEROUS_TAG, '')
    .replace(DANGEROUS_SELF_CLOSING, '')
    .replace(ON_HANDLERS, '')
    .replace(JS_URL, '$1=""')
    .replace(DATA_URL_BLACKLIST, '$1=""')
}

const NAMED_COLOURS = new Set([
  'red', 'green', 'blue', 'black', 'white', 'gray', 'grey',
  'yellow', 'orange', 'purple', 'pink', 'brown', 'navy', 'teal',
  'cyan', 'magenta', 'lime', 'olive', 'maroon', 'silver', 'gold',
  'transparent', 'inherit', 'currentcolor',
])
function sanitiseColour(input: string): string {
  const v = String(input ?? '').trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(v)) return v
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{8}$/.test(v)) return v
  if (NAMED_COLOURS.has(v)) return v
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/.test(v)) return v
  return ''
}

function wrapWithColor(html: string, color: string): string {
  const safe = sanitiseColour(color)
  if (!safe) return html
  return `<span style="color:${safe}">${html}</span>`
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'block-' + Math.random().toString(36).slice(2)
}

const SIZE_BY_HEADING_LEVEL: Record<1 | 2 | 3, TextBlockContent['fontSize']> = {
  1: 'xlarge',
  2: 'large',
  3: 'normal',
}
const IMAGE_WIDTH_MAP: Record<'full' | 'large' | 'medium' | 'small', string> = {
  full: '100', large: '75', medium: '50', small: '25',
}

export function expandAiBlock(ai: AiBlock): EditorBlock {
  switch (ai.type) {
    case 'text': {
      const sanitised = sanitizeHtml(ai.html)
      const html = ai.color ? wrapWithColor(sanitised, ai.color) : sanitised
      const base = defaultBlockContent.text as TextBlockContent
      const content: TextBlockContent = {
        ...base,
        html,
        alignment: ai.alignment ?? 'left',
        fontSize: ai.size ?? 'normal',
        paddingTop: ai.paddingTop ?? base.paddingTop,
        paddingBottom: ai.paddingBottom ?? base.paddingBottom,
        ...(ai.background ? { backgroundColor: sanitiseColour(ai.background) } : {}),
      }
      return { id: newId(), type: 'text', content }
    }
    case 'heading': {
      const level = (ai.level ?? 2) as 1 | 2 | 3
      const safeText = sanitizeHtml(ai.text)
      const colour = ai.color ? sanitiseColour(ai.color) : null
      const inner = colour
        ? `<span style="color:${colour}"><strong>${safeText}</strong></span>`
        : `<strong>${safeText}</strong>`
      const base = defaultBlockContent.text as TextBlockContent
      const content: TextBlockContent = {
        ...base,
        html: `<p>${inner}</p>`,
        alignment: ai.alignment ?? 'left',
        fontSize: SIZE_BY_HEADING_LEVEL[level],
        paddingTop: ai.paddingTop ?? 14,
        paddingBottom: ai.paddingBottom ?? 6,
        ...(ai.background ? { backgroundColor: sanitiseColour(ai.background) } : {}),
      }
      return { id: newId(), type: 'text', content }
    }
    case 'button': {
      const base = defaultBlockContent.button as ButtonBlockContent
      const content: ButtonBlockContent = {
        ...base,
        text: ai.text,
        url: ai.url,
        backgroundColor: ai.color ? sanitiseColour(ai.color) || base.backgroundColor : base.backgroundColor,
        textColor: ai.textColor ? sanitiseColour(ai.textColor) || base.textColor : base.textColor,
        alignment: ai.alignment ?? 'center',
        borderRadius: ai.borderRadius ?? base.borderRadius,
        width: ai.width ?? base.width,
        paddingTop: ai.paddingTop ?? base.paddingTop,
        paddingBottom: ai.paddingBottom ?? base.paddingBottom,
      }
      return { id: newId(), type: 'button', content }
    }
    case 'divider': {
      const base = defaultBlockContent.divider as DividerBlockContent
      const content: DividerBlockContent = {
        ...base,
        style: ai.style ?? base.style,
        color: ai.color ? sanitiseColour(ai.color) || base.color : base.color,
        thickness: ai.thickness ?? base.thickness,
        width: ai.width ?? base.width,
        paddingTop: ai.paddingTop ?? base.paddingTop,
        paddingBottom: ai.paddingBottom ?? base.paddingBottom,
      }
      return { id: newId(), type: 'divider', content }
    }
    case 'spacer': {
      const content: SpacerBlockContent = {
        ...(defaultBlockContent.spacer as SpacerBlockContent),
        height: ai.height ?? 20,
      }
      return { id: newId(), type: 'spacer', content }
    }
    case 'image': {
      const base = defaultBlockContent.image as ImageBlockContent
      const content: ImageBlockContent = {
        ...base,
        src: ai.url,
        alt: ai.alt ?? '',
        alignment: ai.alignment ?? 'center',
        width: IMAGE_WIDTH_MAP[ai.width ?? 'full'],
        linkUrl: ai.linkUrl ?? undefined,
        paddingTop: ai.paddingTop ?? base.paddingTop,
        paddingBottom: ai.paddingBottom ?? base.paddingBottom,
      }
      return { id: newId(), type: 'image', content }
    }
    case 'sarah_signature': {
      const base = defaultBlockContent.sarah_signature as SarahSignatureBlockContent
      const content: SarahSignatureBlockContent = {
        ...base,
        showName: ai.showName ?? base.showName,
        showTitle: ai.showTitle ?? base.showTitle,
        showEmail: ai.showEmail ?? base.showEmail,
        showPhone: ai.showPhone ?? base.showPhone,
        showWebsite: ai.showWebsite ?? base.showWebsite,
        showSignOff: ai.showSignOff ?? base.showSignOff,
        signOff: ai.signOff ?? base.signOff,
        alignment: ai.alignment ?? base.alignment,
        textColor: ai.textColor ? sanitiseColour(ai.textColor) || null : null,
        companyTextColor: ai.companyTextColor ? sanitiseColour(ai.companyTextColor) || null : null,
        confidentialityColor: ai.confidentialityColor ? sanitiseColour(ai.confidentialityColor) || null : null,
        paddingTop: ai.paddingTop ?? base.paddingTop,
        paddingBottom: ai.paddingBottom ?? base.paddingBottom,
      }
      return { id: newId(), type: 'sarah_signature', content }
    }
    case 'html': {
      const content: HTMLBlockContent = {
        ...(defaultBlockContent.html as HTMLBlockContent),
        code: sanitizeHtml(ai.code).slice(0, 5000),
      }
      return { id: newId(), type: 'html', content }
    }
    case 'video': {
      const aiWidth = ai.width
      const width: VideoBlockContent['width'] = typeof aiWidth === 'number' ? aiWidth : 'full'
      const content: VideoBlockContent = {
        ...(defaultBlockContent.video as VideoBlockContent),
        url: ai.url,
        thumbnailUrl: ai.thumbnailUrl ?? undefined,
        alignment: ai.alignment ?? 'center',
        width,
      }
      return { id: newId(), type: 'video', content }
    }
    case 'social': {
      const base = defaultBlockContent.social as SocialBlockContent
      const merged: SocialBlockContent['platforms'] = {
        facebook: { ...base.platforms.facebook, ...mergeSocialPlatform(ai.platforms.facebook) },
        twitter: { ...base.platforms.twitter, ...mergeSocialPlatform(ai.platforms.twitter) },
        instagram: { ...base.platforms.instagram, ...mergeSocialPlatform(ai.platforms.instagram) },
        linkedin: { ...base.platforms.linkedin, ...mergeSocialPlatform(ai.platforms.linkedin) },
        youtube: { ...base.platforms.youtube, ...mergeSocialPlatform(ai.platforms.youtube) },
        tiktok: { ...base.platforms.tiktok },
        threads: { ...base.platforms.threads },
        flickr: { ...base.platforms.flickr },
      }
      const content: SocialBlockContent = {
        ...base,
        platforms: merged,
        style: ai.style ?? base.style,
        alignment: ai.alignment ?? base.alignment,
      }
      return { id: newId(), type: 'social', content }
    }
    case 'columns': {
      const left = (ai.leftBlocks ?? []).map(expandBasicAiBlock)
      const right = (ai.rightBlocks ?? []).map(expandBasicAiBlock)
      const center = (ai.centerBlocks ?? []).map(expandBasicAiBlock)
      const cols = ai.columns
      const widths = cols === 3 ? [33, 33, 34] : [50, 50]
      const content: ColumnsBlockContent = {
        ...(defaultBlockContent.columns as ColumnsBlockContent),
        columns: cols,
        columnWidths: widths,
        leftBlocks: left,
        rightBlocks: right,
        ...(cols === 3 ? { centerBlocks: center } : {}),
      }
      return { id: newId(), type: 'columns', content }
    }
  }
}

function mergeSocialPlatform(
  ai: { enabled: boolean; url?: string | null } | null | undefined,
): { enabled: boolean; url: string } | object {
  if (!ai) return {}
  return { enabled: ai.enabled, url: ai.url ?? '' }
}

function expandBasicAiBlock(ai: BasicAiBlock): EditorBlock {
  return expandAiBlock(ai as AiBlock)
}

export function expandAiBlocks(ai: AiBlock[]): EditorBlock[] {
  return ai.map(expandAiBlock)
}

// ---------------------------------------------------------------------------
// Preservation-aware merge (enhance mode)
// ---------------------------------------------------------------------------

function normaliseHtml(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim().toLowerCase()
}

function compactEqual(a: AiBlock | null, b: AiBlock | null): boolean {
  if (!a || !b) return false
  if (a.type !== b.type) return false
  switch (a.type) {
    case 'text':
      return (
        normaliseHtml(a.html) === normaliseHtml((b as typeof a).html) &&
        (a.alignment ?? null) === ((b as typeof a).alignment ?? null) &&
        (a.size ?? null) === ((b as typeof a).size ?? null) &&
        (a.color ?? null) === ((b as typeof a).color ?? null) &&
        (a.background ?? null) === ((b as typeof a).background ?? null) &&
        (a.paddingTop ?? null) === ((b as typeof a).paddingTop ?? null) &&
        (a.paddingBottom ?? null) === ((b as typeof a).paddingBottom ?? null)
      )
    case 'button':
      return (
        a.text === (b as typeof a).text &&
        a.url === (b as typeof a).url &&
        (a.color ?? null) === ((b as typeof a).color ?? null) &&
        (a.textColor ?? null) === ((b as typeof a).textColor ?? null) &&
        (a.alignment ?? null) === ((b as typeof a).alignment ?? null) &&
        (a.borderRadius ?? null) === ((b as typeof a).borderRadius ?? null) &&
        (a.width ?? null) === ((b as typeof a).width ?? null) &&
        (a.paddingTop ?? null) === ((b as typeof a).paddingTop ?? null) &&
        (a.paddingBottom ?? null) === ((b as typeof a).paddingBottom ?? null)
      )
    case 'divider':
      return (
        (a.style ?? null) === ((b as typeof a).style ?? null) &&
        (a.color ?? null) === ((b as typeof a).color ?? null) &&
        (a.thickness ?? null) === ((b as typeof a).thickness ?? null) &&
        (a.width ?? null) === ((b as typeof a).width ?? null) &&
        (a.paddingTop ?? null) === ((b as typeof a).paddingTop ?? null) &&
        (a.paddingBottom ?? null) === ((b as typeof a).paddingBottom ?? null)
      )
    case 'spacer':
      return (a.height ?? null) === ((b as typeof a).height ?? null)
    case 'image':
      return (
        a.url === (b as typeof a).url &&
        (a.alt ?? null) === ((b as typeof a).alt ?? null) &&
        (a.alignment ?? null) === ((b as typeof a).alignment ?? null) &&
        (a.width ?? null) === ((b as typeof a).width ?? null) &&
        (a.linkUrl ?? null) === ((b as typeof a).linkUrl ?? null) &&
        (a.paddingTop ?? null) === ((b as typeof a).paddingTop ?? null) &&
        (a.paddingBottom ?? null) === ((b as typeof a).paddingBottom ?? null)
      )
    case 'heading':
      return (
        a.text === (b as typeof a).text &&
        (a.level ?? null) === ((b as typeof a).level ?? null) &&
        (a.alignment ?? null) === ((b as typeof a).alignment ?? null) &&
        (a.color ?? null) === ((b as typeof a).color ?? null) &&
        (a.background ?? null) === ((b as typeof a).background ?? null) &&
        (a.paddingTop ?? null) === ((b as typeof a).paddingTop ?? null) &&
        (a.paddingBottom ?? null) === ((b as typeof a).paddingBottom ?? null)
      )
    case 'sarah_signature': {
      const bSig = b as typeof a
      return (
        (a.showName ?? null) === (bSig.showName ?? null) &&
        (a.showTitle ?? null) === (bSig.showTitle ?? null) &&
        (a.showEmail ?? null) === (bSig.showEmail ?? null) &&
        (a.showPhone ?? null) === (bSig.showPhone ?? null) &&
        (a.showWebsite ?? null) === (bSig.showWebsite ?? null) &&
        (a.showSignOff ?? null) === (bSig.showSignOff ?? null) &&
        (a.signOff ?? null) === (bSig.signOff ?? null) &&
        (a.alignment ?? null) === (bSig.alignment ?? null) &&
        (a.textColor ?? null) === (bSig.textColor ?? null) &&
        (a.companyTextColor ?? null) === (bSig.companyTextColor ?? null) &&
        (a.confidentialityColor ?? null) === (bSig.confidentialityColor ?? null) &&
        (a.paddingTop ?? null) === (bSig.paddingTop ?? null) &&
        (a.paddingBottom ?? null) === (bSig.paddingBottom ?? null)
      )
    }
    case 'html':
      return normaliseHtml(a.code) === normaliseHtml((b as typeof a).code)
    case 'video':
      return (
        a.url === (b as typeof a).url &&
        (a.thumbnailUrl ?? null) === ((b as typeof a).thumbnailUrl ?? null) &&
        (a.alignment ?? null) === ((b as typeof a).alignment ?? null) &&
        (a.width ?? null) === ((b as typeof a).width ?? null)
      )
    case 'social': {
      const bSocial = b as typeof a
      const platformsEqual = (
        ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'] as const
      ).every((key) => {
        const left = a.platforms[key]
        const right = bSocial.platforms[key]
        if (!left && !right) return true
        if (!left || !right) return false
        return left.enabled === right.enabled && (left.url ?? null) === (right.url ?? null)
      })
      return (
        platformsEqual &&
        (a.style ?? null) === (bSocial.style ?? null) &&
        (a.alignment ?? null) === (bSocial.alignment ?? null)
      )
    }
    case 'columns': {
      const bCols = b as typeof a
      if (a.columns !== bCols.columns) return false
      if (a.leftBlocks.length !== bCols.leftBlocks.length) return false
      if (a.rightBlocks.length !== bCols.rightBlocks.length) return false
      const eqList = (l: BasicAiBlock[], r: BasicAiBlock[]) =>
        l.every((x, i) => compactEqual(x as AiBlock, r[i] as AiBlock))
      if (!eqList(a.leftBlocks, bCols.leftBlocks)) return false
      if (!eqList(a.rightBlocks, bCols.rightBlocks)) return false
      const aCenter = a.centerBlocks ?? []
      const bCenter = bCols.centerBlocks ?? []
      if (aCenter.length !== bCenter.length) return false
      return eqList(aCenter, bCenter)
    }
    default:
      return false
  }
}

export function mergeAiBlocksWithExisting(
  aiBlocks: AiBlock[],
  existingFullBlocks: EditorBlock[],
): EditorBlock[] {
  const existingCompact = existingFullBlocks.map(compactBlockForPrompt)
  const result: EditorBlock[] = []
  for (let i = 0; i < aiBlocks.length; i++) {
    const aiBlock = aiBlocks[i]
    const originalCompact = existingCompact[i] ?? null
    const originalFull = existingFullBlocks[i]
    if (originalFull && compactEqual(aiBlock, originalCompact)) {
      result.push(originalFull)
    } else {
      result.push(expandAiBlock(aiBlock))
    }
  }
  return result
}

export function compactBlockForPrompt(block: EditorBlock): AiBlock | null {
  const c = block.content as Record<string, unknown>
  switch (block.type) {
    case 'text': {
      const rawHtml = String(c.html ?? '')
      const colorMatch = rawHtml.match(/^<span style="color:([^"]+)">([\s\S]*)<\/span>$/)
      return {
        type: 'text',
        html: colorMatch ? colorMatch[2] : rawHtml,
        alignment: c.alignment as 'left' | 'center' | 'right' | undefined,
        size: c.fontSize as 'small' | 'normal' | 'large' | 'xlarge' | undefined,
        color: colorMatch ? colorMatch[1] : undefined,
        background: c.backgroundColor ? String(c.backgroundColor) : undefined,
        paddingTop: typeof c.paddingTop === 'number' ? c.paddingTop : undefined,
        paddingBottom: typeof c.paddingBottom === 'number' ? c.paddingBottom : undefined,
      }
    }
    case 'button':
      return {
        type: 'button',
        text: String(c.text ?? ''),
        url: String(c.url ?? ''),
        color: c.backgroundColor ? String(c.backgroundColor) : undefined,
        textColor: c.textColor ? String(c.textColor) : undefined,
        alignment: c.alignment as 'left' | 'center' | 'right' | undefined,
        borderRadius: typeof c.borderRadius === 'number' ? c.borderRadius : undefined,
        width: c.width as 'auto' | '50' | '75' | 'full' | undefined,
        paddingTop: typeof c.paddingTop === 'number' ? c.paddingTop : undefined,
        paddingBottom: typeof c.paddingBottom === 'number' ? c.paddingBottom : undefined,
      }
    case 'divider':
      return {
        type: 'divider',
        style: c.style as 'solid' | 'dashed' | 'dotted' | undefined,
        color: c.color ? String(c.color) : undefined,
        thickness: typeof c.thickness === 'number' ? c.thickness : undefined,
        width: c.width as '25' | '50' | '75' | '100' | undefined,
        paddingTop: typeof c.paddingTop === 'number' ? c.paddingTop : undefined,
        paddingBottom: typeof c.paddingBottom === 'number' ? c.paddingBottom : undefined,
      }
    case 'spacer':
      return { type: 'spacer', height: typeof c.height === 'number' ? c.height : undefined }
    case 'image':
      return {
        type: 'image',
        url: String(c.src ?? ''),
        alt: c.alt ? String(c.alt) : undefined,
        alignment: c.alignment as 'left' | 'center' | 'right' | undefined,
        linkUrl: c.linkUrl ? String(c.linkUrl) : undefined,
        paddingTop: typeof c.paddingTop === 'number' ? c.paddingTop : undefined,
        paddingBottom: typeof c.paddingBottom === 'number' ? c.paddingBottom : undefined,
      }
    case 'sarah_signature':
      return {
        type: 'sarah_signature',
        showName: typeof c.showName === 'boolean' ? c.showName : undefined,
        showTitle: typeof c.showTitle === 'boolean' ? c.showTitle : undefined,
        showEmail: typeof c.showEmail === 'boolean' ? c.showEmail : undefined,
        showPhone: typeof c.showPhone === 'boolean' ? c.showPhone : undefined,
        showWebsite: typeof c.showWebsite === 'boolean' ? c.showWebsite : undefined,
        showSignOff: typeof c.showSignOff === 'boolean' ? c.showSignOff : undefined,
        signOff: typeof c.signOff === 'string' ? c.signOff : undefined,
        alignment: c.alignment as 'left' | 'center' | 'right' | undefined,
        textColor: typeof c.textColor === 'string' ? c.textColor : undefined,
        companyTextColor: typeof c.companyTextColor === 'string' ? c.companyTextColor : undefined,
        confidentialityColor: typeof c.confidentialityColor === 'string' ? c.confidentialityColor : undefined,
        paddingTop: typeof c.paddingTop === 'number' ? c.paddingTop : undefined,
        paddingBottom: typeof c.paddingBottom === 'number' ? c.paddingBottom : undefined,
      }
    case 'html':
      return { type: 'html', code: String(c.code ?? '') }
    case 'video':
      return {
        type: 'video',
        url: String(c.url ?? ''),
        thumbnailUrl: c.thumbnailUrl ? String(c.thumbnailUrl) : undefined,
        alignment: c.alignment as 'left' | 'center' | 'right' | undefined,
        width: c.width === 'full' ? 'full' : undefined,
      }
    case 'social': {
      const platforms = (c.platforms ?? {}) as Record<string, { enabled?: boolean; url?: string }>
      const platSchema = (key: string) => ({
        enabled: !!platforms[key]?.enabled,
        url: platforms[key]?.url ?? null,
      })
      return {
        type: 'social',
        platforms: {
          facebook: platSchema('facebook'),
          twitter: platSchema('twitter'),
          instagram: platSchema('instagram'),
          linkedin: platSchema('linkedin'),
          youtube: platSchema('youtube'),
        },
        style: c.style as 'coloured' | 'monochrome' | undefined,
        alignment: c.alignment as 'left' | 'center' | 'right' | undefined,
      }
    }
    case 'columns': {
      const left = Array.isArray(c.leftBlocks)
        ? (c.leftBlocks as EditorBlock[]).map(compactBlockForPrompt).filter(isBasic)
        : []
      const right = Array.isArray(c.rightBlocks)
        ? (c.rightBlocks as EditorBlock[]).map(compactBlockForPrompt).filter(isBasic)
        : []
      const center = Array.isArray(c.centerBlocks)
        ? (c.centerBlocks as EditorBlock[]).map(compactBlockForPrompt).filter(isBasic)
        : null
      const cols = (c.columns === 3 ? 3 : 2) as 2 | 3
      return {
        type: 'columns',
        columns: cols,
        leftBlocks: left,
        rightBlocks: right,
        centerBlocks: center && center.length > 0 ? center : undefined,
      }
    }
    default:
      return null
  }
}

const BASIC_TYPES: ReadonlySet<string> = new Set(['text', 'heading', 'button', 'divider', 'spacer', 'image'])
function isBasic(b: AiBlock | null): b is BasicAiBlock {
  return !!b && BASIC_TYPES.has(b.type)
}
