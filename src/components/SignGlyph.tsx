import { SIGN_BY_ID, type SignId } from '../config/signs'

/** Minimal pictogram: four bars (index..pinky) tall when extended; two rings for the clasp. */
export function SignGlyph({ sign, size = 36, color = 'currentColor' }: { sign: SignId; size?: number; color?: string }) {
  const def = SIGN_BY_ID[sign]
  if (def.twoHands) {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="2.5" aria-hidden>
        <circle cx="13" cy="18" r="8" />
        <circle cx="23" cy="18" r="8" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill={color} aria-hidden>
      {def.fingers!.map((up, i) => {
        const h = up ? 18 : 6
        return <rect key={i} x={5 + i * 7} y={22 - h} width="5" height={h} rx="2.5" />
      })}
      <rect x="4" y="24" width="28" height="8" rx="3" opacity="0.55" />
    </svg>
  )
}
