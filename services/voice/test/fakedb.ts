// Minimal chainable stand-in for the supabase-js query builder: records every
// operation and resolves it through a handler. Only what crm.ts/finalize.ts use.
export interface Op {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'rpc'
  payload?: unknown
  filters: [string, string, unknown][]
  single?: boolean
}
type Result = { data: unknown; error: { message: string } | null }

export function fakeDb(handler: (op: Op) => Result) {
  const ops: Op[] = []
  function builder(table: string) {
    const op: Op = { table, op: 'select', filters: [] }
    let started = false
    const b: Record<string, unknown> = {}
    const start = (kind: Op['op'], payload?: unknown) => {
      if (!started) {
        op.op = kind
        op.payload = payload
        started = true
      }
      return b
    }
    b.select = () => (started ? b : start('select'))
    b.insert = (p: unknown) => start('insert', p)
    b.update = (p: unknown) => start('update', p)
    b.upsert = (p: unknown) => start('upsert', p)
    for (const f of ['eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']) {
      b[f] = (col: string, val: unknown) => {
        op.filters.push([f, col, val])
        return b
      }
    }
    b.single = () => {
      op.single = true
      return b
    }
    b.maybeSingle = b.single
    b.then = (res: (r: Result) => unknown, rej: (e: unknown) => unknown) => {
      ops.push(op)
      try {
        return Promise.resolve(handler(op)).then(res, rej)
      } catch (e) {
        return Promise.reject(e).then(res, rej)
      }
    }
    return b
  }
  const db = {
    from: (t: string) => builder(t),
    rpc: (fn: string, args: unknown) => {
      const op: Op = { table: fn, op: 'rpc', payload: args, filters: [] }
      ops.push(op)
      return Promise.resolve(handler(op))
    },
  }
  return { db: db as never, ops }
}
