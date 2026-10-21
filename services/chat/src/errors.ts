// HTTP-ish error that both REST (status + { error }) and socket acks
// ({ ok: false, error }) understand.
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (m = 'bad request') => new HttpError(400, m)
export const forbidden = (m = 'forbidden') => new HttpError(403, m)
export const notFound = (m = 'not found') => new HttpError(404, m)

export function toPublicError(err: unknown): { status: number; error: string } {
  if (err instanceof HttpError) return { status: err.status, error: err.message }
  if (err instanceof ZodError) {
    const first = err.issues[0]
    const where = first?.path.length ? `${first.path.join('.')}: ` : ''
    return { status: 400, error: `${where}${first?.message ?? 'invalid input'}` }
  }
  return { status: 500, error: 'internal error' }
}
