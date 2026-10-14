/** Ring with three tomoe, echoing the tomoe-like marks around the collar of the Nine-Tails cloak. */
export function TomoeEmblem({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="spin-slow drop-shadow-[0_0_8px_rgba(255,150,20,0.8)]">
      <defs>
        <linearGradient id="gold-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe066" />
          <stop offset="1" stopColor="#ff7a00" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="none" stroke="url(#gold-grad)" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="4" fill="url(#gold-grad)" />
      {[0, 120, 240].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 24 24)`}>
          {/* head */}
          <circle cx="24" cy="10.5" r="4.6" fill="url(#gold-grad)" />
          {/* tail, sweeping around the ring */}
          <path d="M19.6 10.2 C15 14 14.5 20.5 19.8 23.2 C16.8 19.2 17.6 14.6 21.2 12.6 Z" fill="url(#gold-grad)" />
        </g>
      ))}
    </svg>
  )
}

/** Three slanted strokes: the whisker marks. Used as a section-heading ornament. */
export function Whiskers({ className = '' }: { className?: string }) {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden className={className}>
      {[2, 8, 14].map((y) => (
        <path key={y} d={`M1 ${y + 1} L17 ${y - 1}`} stroke="#ffcf33" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  )
}

export function SectionTitle({ jp, children }: { jp: string; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2">
      <Whiskers />
      <span className="font-brush text-lg tracking-wider text-gold">{jp}</span>
      <span className="font-display text-xs tracking-[0.3em] text-slate-300/70">{children}</span>
      <span className="ml-1 h-px flex-1 bg-linear-to-r from-[rgba(255,160,30,0.5)] to-transparent" />
    </h2>
  )
}
