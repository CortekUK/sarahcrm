'use client'

import { cn } from '@/lib/utils'

// Slow-drifting bronze + plum aurora. Pure CSS, no JS, no canvas.
// Hand-tuned to feel like a subtle haze behind text — not a beachy
// gradient. Don't use it on every section; reserve for the hero, the
// apply close, and any other "this is the moment" beat.
//
// Variants:
//  - "soft"  — barely visible, for behind text columns
//  - "warm"  — strongest bronze, for hero halos
//  - "dusk"  — bronze + plum blend, for the apply close
//
// All variants respect prefers-reduced-motion (animation pauses).

interface AuroraProps {
  variant?: 'soft' | 'warm' | 'dusk'
  /** Z-index inside the parent. Defaults to 0 so siblings can sit above. */
  z?: number
  className?: string
}

export function Aurora({ variant = 'soft', z = 0, className }: AuroraProps) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{ zIndex: z }}
    >
      <div className={cn('aurora-blob aurora-1', variant)} />
      <div className={cn('aurora-blob aurora-2', variant)} />
      <div className={cn('aurora-blob aurora-3', variant)} />
      <style jsx>{`
        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0;
        }

        /* Position + base sizing */
        .aurora-1 { top: -10%; left: -10%; width: 60vw; height: 60vw; }
        .aurora-2 { bottom: -20%; right: -10%; width: 70vw; height: 70vw; }
        .aurora-3 { top: 30%; left: 30%; width: 40vw; height: 40vw; }

        /* "soft" variant — barely visible warm haze */
        .aurora-blob.soft.aurora-1 {
          background: radial-gradient(circle, rgba(168,123,79,0.16), transparent 70%);
          opacity: 1;
          animation: drift-1 36s ease-in-out infinite alternate;
        }
        .aurora-blob.soft.aurora-2 {
          background: radial-gradient(circle, rgba(192,152,112,0.10), transparent 70%);
          opacity: 1;
          animation: drift-2 42s ease-in-out infinite alternate;
        }
        .aurora-blob.soft.aurora-3 {
          background: radial-gradient(circle, rgba(168,123,79,0.06), transparent 70%);
          opacity: 1;
          animation: drift-3 30s ease-in-out infinite alternate;
        }

        /* "warm" — stronger bronze for hero halos */
        .aurora-blob.warm.aurora-1 {
          background: radial-gradient(circle, rgba(168,123,79,0.32), transparent 65%);
          opacity: 1;
          animation: drift-1 28s ease-in-out infinite alternate;
        }
        .aurora-blob.warm.aurora-2 {
          background: radial-gradient(circle, rgba(192,152,112,0.22), transparent 65%);
          opacity: 1;
          animation: drift-2 34s ease-in-out infinite alternate;
        }
        .aurora-blob.warm.aurora-3 {
          background: radial-gradient(circle, rgba(129,93,56,0.18), transparent 70%);
          opacity: 1;
          animation: drift-3 24s ease-in-out infinite alternate;
        }

        /* "dusk" — bronze + plum, used near the apply close */
        .aurora-blob.dusk.aurora-1 {
          background: radial-gradient(circle, rgba(58,27,31,0.42), transparent 65%);
          opacity: 1;
          animation: drift-1 32s ease-in-out infinite alternate;
        }
        .aurora-blob.dusk.aurora-2 {
          background: radial-gradient(circle, rgba(168,123,79,0.22), transparent 65%);
          opacity: 1;
          animation: drift-2 36s ease-in-out infinite alternate;
        }
        .aurora-blob.dusk.aurora-3 {
          background: radial-gradient(circle, rgba(92,42,48,0.20), transparent 70%);
          opacity: 1;
          animation: drift-3 28s ease-in-out infinite alternate;
        }

        @keyframes drift-1 {
          0%   { transform: translate3d(0, 0, 0) scale(1); }
          100% { transform: translate3d(8%, 12%, 0) scale(1.08); }
        }
        @keyframes drift-2 {
          0%   { transform: translate3d(0, 0, 0) scale(1); }
          100% { transform: translate3d(-10%, -8%, 0) scale(1.05); }
        }
        @keyframes drift-3 {
          0%   { transform: translate3d(0, 0, 0) scale(1); }
          100% { transform: translate3d(6%, -10%, 0) scale(1.1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .aurora-blob { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
