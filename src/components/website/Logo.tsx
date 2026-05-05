'use client'

export function DiamondLogo({ className = '', size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Diamond shape */}
      <path
        d="M20 2L38 20L20 38L2 20L20 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* C letter */}
      <text
        x="20"
        y="25"
        textAnchor="middle"
        fontFamily="'Playfair Display', Georgia, serif"
        fontSize="16"
        fontWeight="600"
        fill="currentColor"
      >
        C
      </text>
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <span className="font-[family-name:var(--font-heading)] text-xl font-semibold tracking-wide">
        THE CLUB
      </span>
      <span className="block font-[family-name:var(--font-label)] text-[0.55rem] font-medium uppercase tracking-[0.3em] opacity-60 mt-0.5">
        by Sarah Restrick
      </span>
    </div>
  )
}
