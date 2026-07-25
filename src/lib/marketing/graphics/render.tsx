// Template Graphics — the pure render tree.
//
// renderGraphic({ template, values, shape }) returns the JSX element tree fed
// to next/og's ImageResponse (satori). Satori supports FLEXBOX + inline styles
// only — no grid, no arbitrary CSS — so the whole layout is nested flex
// columns. Honors slot zone / align / per-slot style overrides, a brand colour
// OR photo background, and ALWAYS stamps the locked "THE CLUB — by Sarah
// Restrick" brand line.
//
// Server-safe (no 'use client'); imported by the render + preview routes.

import type React from 'react'
import {
  SHAPE_DIMS,
  BRAND,
  FONT_STACKS,
  BRAND_LINE,
  BRAND_SUBLINE,
} from './types'
import { toAbsoluteUrl } from './resolve'
import type {
  GraphicShape,
  MarketingTemplate,
  SlotValues,
  TemplateSlot,
  SlotAlign,
} from './types'

function alignItemsFor(align: SlotAlign): 'flex-start' | 'center' | 'flex-end' {
  return align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'
}

function textFor(slot: TemplateSlot, values: SlotValues): string {
  const filled = values.slots?.[slot.id]?.text
  if (typeof filled === 'string' && filled.trim()) return filled
  if (slot.text_source === 'fixed') return slot.fixed_text ?? ''
  return ''
}

function photoFor(slot: TemplateSlot, values: SlotValues): string | null {
  const u = values.slots?.[slot.id]?.photo_url
  return u && u.trim() ? u : null
}

function backgroundPhoto(template: MarketingTemplate, values: SlotValues): string | null {
  if (values.background_photo_url && values.background_photo_url.trim()) {
    return values.background_photo_url
  }
  if (template.background.type === 'photo' && template.background.value?.trim()) {
    return template.background.value
  }
  return null
}

function slotStyle(slot: TemplateSlot): React.CSSProperties {
  const font = slot.style?.font ?? (slot.type === 'heading' ? 'serif' : 'sans')
  const isHeading = slot.type === 'heading'
  const size = slot.style?.size ?? (isHeading ? 72 : slot.type === 'fixed' ? 28 : 32)
  return {
    display: 'flex',
    fontFamily: FONT_STACKS[font],
    color: slot.style?.color ?? BRAND.cream,
    fontSize: size,
    lineHeight: 1.15,
    letterSpacing: slot.type === 'fixed' ? 4 : isHeading ? -0.5 : 0,
    textTransform: slot.type === 'fixed' ? 'uppercase' : 'none',
    textAlign: slot.align,
    margin: 0,
    maxWidth: '100%',
  }
}

function renderSlot(
  slot: TemplateSlot,
  values: SlotValues,
  key: string,
  origin?: string,
): React.ReactNode {
  const alignSelf = alignItemsFor(slot.align)

  if (slot.type === 'photo') {
    const url = toAbsoluteUrl(photoFor(slot, values), origin)
    if (!url) return null
    return (
      <div
        key={key}
        style={{
          display: 'flex',
          alignSelf: 'stretch',
          width: '100%',
          height: 360,
          borderRadius: 18,
          overflow: 'hidden',
          margin: '10px 0',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} width={1000} height={360} style={{ objectFit: 'cover', width: '100%', height: '100%' }} alt="" />
      </div>
    )
  }

  const text = textFor(slot, values)
  if (!text.trim()) return null
  return (
    <div key={key} style={{ display: 'flex', alignSelf, maxWidth: '100%', margin: '6px 0' }}>
      <div style={slotStyle(slot)}>{text}</div>
    </div>
  )
}

function zoneContainer(
  slots: TemplateSlot[],
  values: SlotValues,
  zone: 'top' | 'middle' | 'bottom',
  extra?: React.ReactNode,
  origin?: string,
): React.ReactNode {
  const nodes = slots
    .map((s, i) => renderSlot(s, values, `${zone}-${s.id}-${i}`, origin))
    .filter(Boolean)
  const justify =
    zone === 'top' ? 'flex-start' : zone === 'bottom' ? 'flex-end' : 'center'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        alignItems: 'stretch',
        flex: 1,
      }}
    >
      {nodes}
      {extra}
    </div>
  )
}

export function renderGraphic(args: {
  template: MarketingTemplate
  values: SlotValues
  shape: GraphicShape
  origin?: string
}): React.ReactElement {
  const { template, values, shape, origin } = args
  const dims = SHAPE_DIMS[shape] ?? SHAPE_DIMS.square
  const bgPhoto = toAbsoluteUrl(backgroundPhoto(template, values), origin)
  const bgColor =
    template.background.type === 'color' && template.background.value
      ? template.background.value
      : BRAND.dark

  const bySlotZone = (z: 'top' | 'middle' | 'bottom') =>
    (template.slots ?? []).filter((s) => s.zone === z)

  // The locked brand wordmark — always rendered, pinned in the bottom zone.
  const brandMark = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 28,
        gap: 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontFamily: FONT_STACKS.serif,
          fontSize: 30,
          letterSpacing: 8,
          color: BRAND.gold,
          textTransform: 'uppercase',
        }}
      >
        {BRAND_LINE}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: FONT_STACKS.sans,
          fontSize: 16,
          letterSpacing: 4,
          color: bgPhoto ? BRAND.cream : BRAND.gold,
          textTransform: 'uppercase',
          opacity: 0.85,
        }}
      >
        {BRAND_SUBLINE}
      </div>
    </div>
  )

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: dims.w,
        height: dims.h,
        backgroundColor: bgColor,
        overflow: 'hidden',
      }}
    >
      {/* Background photo (fills the canvas) + legibility scrim. */}
      {bgPhoto && (
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: dims.w, height: dims.h }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgPhoto}
            width={dims.w}
            height={dims.h}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
            alt=""
          />
        </div>
      )}
      {bgPhoto && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: dims.w,
            height: dims.h,
            display: 'flex',
            backgroundColor: 'rgba(33,29,25,0.45)',
          }}
        />
      )}

      {/* Foreground content — three zones, brand mark pinned to the bottom. */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: 72,
        }}
      >
        {zoneContainer(bySlotZone('top'), values, 'top', undefined, origin)}
        {zoneContainer(bySlotZone('middle'), values, 'middle', undefined, origin)}
        {zoneContainer(bySlotZone('bottom'), values, 'bottom', brandMark, origin)}
      </div>
    </div>
  )
}
