// "One room. Every network in it." — concentric-circle graphic from the
// brochure: You → The Club → Members' own networks → Partner client
// channels. Inline SVG (scales cleanly to 375px): each ring's label runs
// along the top of its band so labels never collide with the ring lines.
// Colours come from theme tokens via currentColor / CSS variables.

const RINGS = [
  { id: 'eco-partner', label: 'Partner client channels', r: 196, fill: 0.05 },
  { id: 'eco-members', label: "Members' own networks", r: 146, fill: 0.1 },
  { id: 'eco-club', label: 'The Club', r: 96, fill: 0.16 },
] as const

const CORE_R = 46

export function EcosystemGraphic() {
  return (
    <svg
      viewBox="0 0 400 400"
      role="img"
      aria-label="Concentric circles: You, inside The Club, inside members' own networks, inside partner client channels"
      className="mx-auto block w-full max-w-[520px] h-auto"
    >
      <defs>
        {RINGS.map((ring) => {
          // Label path: an upper arc midway through the ring's band.
          const lr = ring.r - 21
          return (
            <path
              key={ring.id}
              id={ring.id}
              d={`M ${200 - lr} 200 A ${lr} ${lr} 0 0 1 ${200 + lr} 200`}
              fill="none"
            />
          )
        })}
      </defs>

      {RINGS.map((ring) => (
        <circle
          key={`c-${ring.id}`}
          cx={200}
          cy={200}
          r={ring.r}
          style={{
            fill: 'var(--color-bronze)',
            fillOpacity: ring.fill,
            stroke: 'var(--color-bronze)',
            strokeOpacity: 0.55,
          }}
          strokeWidth={1}
        />
      ))}

      {RINGS.map((ring) => (
        <text
          key={`t-${ring.id}`}
          style={{ fill: 'var(--color-bronze-light)', fontFamily: 'var(--font-meta)' }}
          fontSize={11}
          letterSpacing={3}
        >
          <textPath href={`#${ring.id}`} startOffset="50%" textAnchor="middle">
            {ring.label.toUpperCase()}
          </textPath>
        </text>
      ))}

      <circle cx={200} cy={200} r={CORE_R} style={{ fill: 'var(--color-bronze)' }} />
      <text
        x={200}
        y={207}
        textAnchor="middle"
        fontSize={22}
        fontStyle="italic"
        style={{ fill: 'var(--color-bone)', fontFamily: 'var(--font-editorial)' }}
      >
        You
      </text>
    </svg>
  )
}
