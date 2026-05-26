// Gold + bronze confetti burst — used on the contact form's success
// state to give the moment a small sense of celebration that matches the
// site's palette. Wraps canvas-confetti (the same lib MagicUI's
// <Confetti /> uses) with our brand colours baked in.
//
// Client-only: dynamically imports canvas-confetti so this module is
// safe to import from server components too — calling the function on
// the server is a no-op.

const BRONZE_GOLD_PALETTE = [
  '#C09870', // bronze-light
  '#A87B4F', // bronze
  '#8B5A2B', // bronze-dark
  '#D4AF7A', // soft gold
  '#F0EBE0', // ivory accent (sparkles)
]

export async function fireBronzeConfetti() {
  if (typeof window === 'undefined') return
  const confetti = (await import('canvas-confetti')).default

  const duration = 1400
  const end = Date.now() + duration
  const colors = BRONZE_GOLD_PALETTE

  // Two angled bursts from the bottom corners, plus a small overhead
  // shower. Total < 1.5s — celebratory but not obnoxious.
  ;(function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      startVelocity: 55,
      origin: { x: 0, y: 0.85 },
      colors,
      scalar: 0.95,
      ticks: 160,
    })
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      startVelocity: 55,
      origin: { x: 1, y: 0.85 },
      colors,
      scalar: 0.95,
      ticks: 160,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()

  confetti({
    particleCount: 60,
    spread: 100,
    startVelocity: 35,
    origin: { x: 0.5, y: 0.35 },
    colors,
    scalar: 1.1,
    ticks: 200,
  })
}
