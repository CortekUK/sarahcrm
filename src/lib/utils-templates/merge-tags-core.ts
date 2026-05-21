// Canonical merge-tag replacement core.
//
// Features:
//   Simple tags:        {{field_name}}
//   Fallback:           {{field_name|default text}}
//   Truthy block:       {{#if field_name}}...{{/if}}
//   Equality block:     {{#if field_name equals "value"}}...{{/if}}
//   Non-equality block: {{#if field_name not_equals "value"}}...{{/if}}
//   Contains block:     {{#if field_name contains "value"}}...{{/if}}
//   Negated block:      {{#unless field_name}}...{{/unless}}
//   Number formatting:  rendered as GBP currency (min 0 decimals)
//   Boolean formatting: rendered as "Yes" / "No"
//   Field lookup:       snake_case keys with camelCase fallback

export type MergeTagValue = string | number | boolean | null | undefined

export interface MergeTagData {
  [key: string]: MergeTagValue
}

export function replaceMergeTags(template: string, data: MergeTagData): string {
  if (!template) return ''
  return replaceSimpleTags(processConditionalBlocks(template, data), data)
}

function processConditionalBlocks(template: string, data: MergeTagData): string {
  let result = template

  result = result.replace(
    /\{\{#if\s+(\w+)\s+equals\s+"([^"]+)"\}\}([\s\S]*?)\{\{\/if\}\}/gi,
    (_, fieldName, expected, content) => {
      const actual = getFieldValue(fieldName, data)
      return actual === expected ? content : ''
    },
  )

  result = result.replace(
    /\{\{#if\s+(\w+)\s+not_equals\s+"([^"]+)"\}\}([\s\S]*?)\{\{\/if\}\}/gi,
    (_, fieldName, expected, content) => {
      const actual = getFieldValue(fieldName, data)
      return actual !== expected ? content : ''
    },
  )

  result = result.replace(
    /\{\{#if\s+(\w+)\s+contains\s+"([^"]+)"\}\}([\s\S]*?)\{\{\/if\}\}/gi,
    (_, fieldName, substring, content) => {
      const actual = String(getFieldValue(fieldName, data) ?? '')
      return actual.toLowerCase().includes(substring.toLowerCase()) ? content : ''
    },
  )

  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/gi,
    (_, fieldName, content) => {
      const value = getFieldValue(fieldName, data)
      return value && value !== '' ? content : ''
    },
  )

  result = result.replace(
    /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/gi,
    (_, fieldName, content) => {
      const value = getFieldValue(fieldName, data)
      return !value || value === '' ? content : ''
    },
  )

  return result
}

function replaceSimpleTags(template: string, data: MergeTagData): string {
  return template.replace(
    // Accept `{{tag}}`, `{{tag|fallback}}`, AND `{{tag|}}` (empty fallback).
    // The fallback group used to require one-or-more chars (`[^}]+`),
    // which meant an empty fallback didn't match either branch and the
    // raw token leaked through to the rendered email.
    /\{\{(\w+)(?:\|([^}]*))?\}\}/g,
    (_, fieldName, fallback) => {
      const value = getFieldValue(fieldName, data)
      if (value !== null && value !== undefined && value !== '') {
        return formatValue(value)
      }
      return fallback !== undefined ? fallback : ''
    },
  )
}

function getFieldValue(fieldName: string, data: MergeTagData): MergeTagValue {
  if (fieldName in data) return data[fieldName]
  const camel = fieldName.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())
  if (camel in data) return data[camel]
  return undefined
}

function formatValue(value: MergeTagValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
    }).format(value)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
