import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Eye, EyeOff } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  function quickLogin(email: string, password: string) {
    onSubmit({ email, password })
  }

  async function onSubmit(data: LoginFormData) {
    setError(null)
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      // Fetch profile to determine role
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Unable to retrieve user session')
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      // Role-based redirect
      if (profile?.role === 'admin') {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/portal', { replace: true })
      }
    } catch {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-14">
          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold text-text mb-2">
            The Club
          </h1>
          <div className="flex items-center justify-center gap-4">
            <span className="block w-10 h-px bg-gold" />
            <p className="font-[family-name:var(--font-label)] text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
              by Sarah Restrick
            </p>
            <span className="block w-10 h-px bg-gold" />
          </div>
        </div>

        {/* Login card */}
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-8">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text mb-1 text-center">
            Welcome Back
          </h2>
          <p className="text-sm text-text-muted text-center mb-6">
            Sign in to your members area
          </p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
              <p className="text-sm text-accent-warm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              autoComplete="current-password"
              error={errors.password?.message}
              suffix={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-text-dim hover:text-text transition-colors"
                >
                  {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
                </button>
              }
              {...register('password')}
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full font-[family-name:var(--font-body)] font-medium"
              size="lg"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-border text-center">
            <p className="text-xs text-text-dim">
              Membership is by invitation only.
              <br />
              Contact us to learn about joining The Club.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-text-dim mt-6">
          The Club by Sarah Restrick &copy; {new Date().getFullYear()}
        </p>

        {/* Dev quick-login buttons */}
        {import.meta.env.DEV && (
          <div className="mt-6 pt-4 border-t border-dashed border-border">
            <p className="text-[0.625rem] uppercase tracking-widest text-text-dim text-center mb-3">
              Dev Quick Login
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => quickLogin('admin@sarahrestrick.com', 'Admin12345')}
                disabled={loading}
                className="flex-1 px-4 py-2 text-xs font-medium rounded-full border border-border text-text-muted hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => quickLogin('member@sarahrestrick.com', 'Member12345')}
                disabled={loading}
                className="flex-1 px-4 py-2 text-xs font-medium rounded-full border border-border text-text-muted hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
              >
                Member
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
