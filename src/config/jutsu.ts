import type { SignId } from './signs'

export type JutsuId = 'rasengan' | 'chidori' | 'rasenshuriken' | 'katon'

export interface JutsuDef {
  id: JutsuId
  name: string
  kanji: string
  blurb: string
  /**
   * Demo combinations, explicitly NOT canonical Naruto seal orders.
   * No jutsu's sequence may end with another's (so triggers are unambiguous).
   */
  sequence: SignId[]
  /** CSS accent colour for the UI. */
  accent: string
  chargeMs: number
  releaseMs: number
  impactMs: number
}

export const JUTSU: JutsuDef[] = [
  {
    id: 'rasengan',
    name: 'Rasengan',
    kanji: '螺旋丸',
    blurb: 'A spinning sphere of chakra.',
    sequence: ['tiger', 'ram', 'boar'],
    accent: '#38bdf8',
    chargeMs: 1200,
    releaseMs: 800,
    impactMs: 700,
  },
  {
    id: 'chidori',
    name: 'Chidori',
    kanji: '千鳥',
    blurb: 'Lightning chakra crackling in the palm.',
    sequence: ['ox', 'tiger', 'dog'],
    accent: '#a5b4fc',
    chargeMs: 1000,
    releaseMs: 700,
    impactMs: 600,
  },
  {
    id: 'rasenshuriken',
    name: 'Rasenshuriken',
    kanji: '螺旋手裏剣',
    blurb: 'A wind-edged shuriken of chakra.',
    sequence: ['ram', 'dog', 'clasp'],
    accent: '#67e8f9',
    chargeMs: 1500,
    releaseMs: 1000,
    impactMs: 900,
  },
  {
    id: 'katon',
    name: 'Katon',
    kanji: '火遁',
    blurb: 'A roaring plume of fire.',
    sequence: ['ram', 'ox', 'boar'],
    accent: '#fb923c',
    chargeMs: 900,
    releaseMs: 1200,
    impactMs: 900,
  },
]

export const JUTSU_BY_ID = Object.fromEntries(JUTSU.map((j) => [j.id, j])) as Record<JutsuId, JutsuDef>
