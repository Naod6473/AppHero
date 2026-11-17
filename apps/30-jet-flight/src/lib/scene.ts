// Sprite-stack fighter scene — a small software renderer.
//
// Everything is drawn into one low-resolution pixel buffer, the way the technique works:
//   · the jet is a stack of horizontal slices drawn 1 px apart, turned to any angle
//   · the islands and the clouds are stacks too (a height per ground pixel)
// The buffer is then shown scaled up with hard pixels.
//
// Two views share one camera: the overhead sprite-stack view, and a chase view from behind
// the jet. The camera slides between them, so the switch is a single continuous move.

import {
  JET_W, JET_L, JET_H, JET_PALETTE, decodeJet,
  JET_PIVOT_K, JET_PIVOT_Y, JET_ENGINE_A, JET_ENGINE_Y, JET_ENGINE_R, JET_NOZZLE_K,
  JET_WINGTIP_A, JET_WINGTIP_K, JET_WINGTIP_Y,
} from './jet-model'
import { buildCockpit, drawCockpit } from './cockpit'
import type { CockpitArt } from './cockpit'

export type TimeOfDay = 'day' | 'sunset' | 'night'
export type ViewMode = 'top' | 'chase' | 'cockpit'
export type FlameStyle = 'pixel' | 'realistic'

export interface SceneParams {
  speed: number // px per second
  boost: number // how many times faster it flies while the thrusters are held open
  agility: number // max turn rate, rad per second
  altitude: number // cruising height, px above the sea
  ceiling: number // the highest it can climb, px above the sea
  clearance: number // the closest it gets to the ground, trees and water, px
  bank: number // max bank angle, degrees
  spread: number // px between slices (1 = stacked)
  jetScale: number // size of the jet against the world (1 = one art pixel per world pixel)
  cameraFollow: number // 0 = north-up camera, 1 = camera turns with the jet
  view: ViewMode // overhead, from behind the jet, or from the pilot's seat
  chaseDistance: number // how far behind the jet the chase camera sits, in jet lengths
  chaseAngle: number // how high above the jet it sits, degrees
  chaseSize: number // how wide the jet is drawn in the chase view, as a share of the frame
  transition: number // seconds the camera takes to move between the views
  timeOfDay: TimeOfDay
  clouds: number // 0..1 cover
  land: number // 0..1 share of land
  seed: number
  afterburner: number // 0..1
  flameStyle: FlameStyle // flames drawn in pixels like the jet, or as smooth fire laid over the picture
  trails: boolean
  wingmen: number // 0..2
  shadow: boolean
  followPointer: boolean
  stunts: boolean
  intro: boolean
  bodyColor: string
  accentColor: string
  canopyColor: string
  enemies: number // 0..8 hostile jets about at once
  enemySkill: number // 0..1: how hard they turn and how well they aim
  enemyColor: string
  enemyAccentColor: string
  enemyCanopyColor: string
}

export const DEFAULT_PARAMS: SceneParams = {
  speed: 92,
  boost: 1.8,
  agility: 1.25,
  altitude: 64,
  ceiling: 300,
  clearance: 7,
  bank: 52,
  spread: 1,
  jetScale: 1,
  cameraFollow: 0.6,
  view: 'top',
  chaseDistance: 2.6,
  chaseAngle: 12,
  chaseSize: 0.19,
  transition: 1.4,
  timeOfDay: 'day',
  clouds: 0.45,
  land: 0.33,
  seed: 7,
  afterburner: 0.8,
  flameStyle: 'pixel',
  trails: true,
  wingmen: 0,
  shadow: true,
  followPointer: true,
  stunts: true,
  intro: true,
  bodyColor: '#545969',
  accentColor: '#f0580e',
  canopyColor: '#1e8ca0',
  enemies: 3,
  enemySkill: 0.5,
  enemyColor: '#8c2f2b',
  enemyAccentColor: '#f2c230',
  enemyCanopyColor: '#2b2f3a',
}

// ───────────────────────────────────────────────────────────── constants
const N = 2048 // world size (wraps)
const NM = N - 1
const NSHIFT = 11
const HMAX = 40 // tallest terrain stack, trees included

const NC = 1024 // cloud map size (wraps)
const NCM = NC - 1
const NCSHIFT = 10
const CK = 8 // cloud stack height
const CLOUD_ALT = 40

const PIV_K = JET_PIVOT_K // pivot along the fuselage
const PIV_Y = JET_PIVOT_Y // pivot slice (wing level)
const ENGINE_A = JET_ENGINE_A // engines, px off the centre line
const ENGINE_Y = JET_ENGINE_Y // engine centre height
const ENGINE_R = JET_ENGINE_R
const NOZZLE_K = JET_NOZZLE_K
const WINGTIP_A = JET_WINGTIP_A
const WINGTIP_K = JET_WINGTIP_K
const WINGTIP_Y = JET_WINGTIP_Y

const TRAIL_N = 160
const SMOKE_N = 96 // puffs of exhaust smoke kept alive at once
const SMOKE_F = 9 // numbers kept per puff

const ZTOP = CLOUD_ALT + CK // the tallest thing in the world
const VIEW_DIST = 1500 // how far the chase view sees
const FOG_START = 300
const FOG_STEPS = 10 // shades of haze between here and the horizon
const NSKY = 8 // bands in the sky gradient
const EPS = 1e-5
const HOLD = 0.2 // seconds: shorter is a click (roll), longer is a hold (thrusters)
const COCKPIT_LOOK = 64 // the cockpit view is centred this far ahead of the jet, px
const COCKPIT_EYE = 3 // the pilot's eyes, px above the jet's middle
const FLAME_MAX = 22 // smooth flames: two a jet (leader, wingmen and up to 8 enemies)
const FLAME_F = 16 // numbers kept per smooth flame
const FLAME_GROW = 1.3 // a smooth flame fades out along its length, so it is drawn this much longer

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

// ───────────────────────────────────────────────────────────── helpers
const pack = (r: number, g: number, b: number) =>
  ((255 << 24) | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r)) >>> 0
// the light that falls into the cockpit
const SUN_DAY = pack(255, 246, 222)
const SUN_SUNSET = pack(255, 170, 92)
const SUN_NIGHT = pack(150, 190, 255)
function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash8(o: number) {
  let h = Math.imul(o ^ (o >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  return (h >>> 24) & 255
}
function wrapAngle(a: number) {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2))
}

export function parseColor(str: string | undefined, fallback: number[]): number[] {
  if (!str) return fallback
  let s = String(str).trim()
  if (s[0] === '#') {
    s = s.slice(1)
    if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('')
    if (s.length >= 6) {
      const n = parseInt(s.slice(0, 6), 16)
      if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    return fallback
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(/[ ,/]+/).map(parseFloat)
    if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return [parts[0], parts[1], parts[2]]
  }
  return fallback
}

/** colour grading per time of day (amount 0..1) */
function grade(c: number[], tod: TimeOfDay, amount: number): number[] {
  if (tod === 'day' || amount <= 0) return c
  let r: number, g: number, b: number
  if (tod === 'sunset') {
    r = 0.95 * c[0] + 0.1 * c[1] + 12
    g = 0.72 * c[1] + 0.05 * c[0] + 4
    b = 0.7 * c[2] + 0.08 * c[0] + 10
  } else {
    r = 0.22 * c[0] + 2
    g = 0.3 * c[1] + 6
    b = 0.5 * c[2] + 22
  }
  return [c[0] + (r - c[0]) * amount, c[1] + (g - c[1]) * amount, c[2] + (b - c[2]) * amount]
}

// tileable value noise, one octave added into `field`
function addOctave(field: Float32Array, n: number, cell: number, amp: number, rnd: () => number) {
  const P = n / cell
  const lat = new Float32Array(P * P)
  for (let i = 0; i < lat.length; i++) lat[i] = rnd()
  const x0 = new Int32Array(n)
  const x1 = new Int32Array(n)
  const tx = new Float32Array(n)
  for (let x = 0; x < n; x++) {
    const g = x / cell
    const i = Math.floor(g)
    const f = g - i
    x0[x] = i % P
    x1[x] = (i + 1) % P
    tx[x] = f * f * (3 - 2 * f)
  }
  for (let y = 0; y < n; y++) {
    const ra = x0[y] * P
    const rb = x1[y] * P
    const ty = tx[y]
    const row = y * n
    for (let x = 0; x < n; x++) {
      const a0 = lat[ra + x0[x]]
      const b0 = lat[rb + x0[x]]
      const va = a0 + (lat[ra + x1[x]] - a0) * tx[x]
      const vb = b0 + (lat[rb + x1[x]] - b0) * tx[x]
      field[row + x] += amp * (va + (vb - va) * ty)
    }
  }
}
function normalise(field: Float32Array) {
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < field.length; i++) {
    const v = field[i]
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const k = 1 / (mx - mn || 1)
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - mn) * k
}

// ───────────────────────────────────────────────────────────── materials
// index: 0 deep · 1 mid · 2 shallow · 3 surf · 4 sand · 5 sand speck · 6 grass · 7 grass dark · 8 grass light
//        9 tree top · 10 tree · 11 tree edge · 12 rock · 13 rock dark · 14 rock light · 15 snow · 16 snow shade
const MAT_TOP = [
  [36, 104, 180], [44, 124, 198], [66, 160, 216], [104, 204, 214],
  [238, 220, 164], [222, 200, 140],
  [96, 178, 52], [70, 148, 44], [134, 206, 76],
  [70, 158, 64], [42, 122, 54], [28, 92, 46],
  [146, 140, 134], [118, 112, 110], [178, 172, 162],
  [246, 250, 255], [214, 226, 244],
]
const MAT_SIDE = [
  [36, 104, 180], [44, 124, 198], [66, 160, 216], [104, 204, 214],
  [204, 180, 122], [204, 180, 122],
  [56, 120, 44], [50, 108, 42], [60, 128, 46],
  [24, 78, 42], [22, 72, 40], [20, 64, 38],
  [96, 90, 92], [86, 82, 86], [104, 98, 98],
  [186, 202, 228], [176, 192, 220],
]
const NMAT = MAT_TOP.length

interface Jet {
  x: number
  y: number
  z: number
  yaw: number
  yawRate: number
  roll: number
  pitch: number
  stunt: number // 0..1 progress of an aileron roll, -1 idle
  stuntDir: number
  stuntDelay: number
  vx: number
  vy: number
  trail: Float32Array[] // [left, right] ring buffers of x,y,z,t
  trailHead: number
  trailLen: number
  g: number // how hard it is turning, 0..1 (smoothed)
  lastTrailX: number
  lastTrailY: number
  foe: boolean // an enemy: painted in the enemy colours and flown by the AI
  hp: number // 0..100
  dead: number // seconds since it was shot down, −1 while flying
  gunCool: number // seconds until the guns can fire again
  aiMode: number // 0 attack, 1 break away
  aiT: number // seconds left in this mode
  aiAlt: number // the height it holds against its target, px above or below
  aiSide: number // which way it breaks away
  smokeT: number // a damaged jet trails smoke
}

function makeJet(x: number, y: number, z: number, yaw: number, foe = false): Jet {
  return {
    x, y, z, yaw, yawRate: 0, roll: 0, pitch: 0, stunt: -1, stuntDir: 1, stuntDelay: 0, vx: 0, vy: 0,
    trail: [new Float32Array(TRAIL_N * 4), new Float32Array(TRAIL_N * 4)],
    trailHead: 0, trailLen: 0, g: 0, lastTrailX: x, lastTrailY: y,
    foe, hp: 100, dead: -1, gunCool: 0, aiMode: 0, aiT: 4, aiAlt: 0, aiSide: 1, smokeT: 0,
  }
}

export function createScene(initial: SceneParams) {
  let p: SceneParams = { ...initial }

  // ── the jet's slices as lists of voxels
  const slices = decodeJet()
  const sliceA: Float32Array[] = []
  const sliceB: Float32Array[] = []
  const sliceC: Uint8Array[] = []
  const shadowMask = new Uint8Array(JET_W * JET_L)
  let firstSlice = JET_H
  for (let y = 0; y < JET_H; y++) {
    const s = slices[y]
    let n = 0
    for (let o = 0; o < s.length; o++) if (s[o]) n++
    const a = new Float32Array(n)
    const b = new Float32Array(n)
    const c = new Uint8Array(n)
    let j = 0
    for (let k = 0; k < JET_L; k++) {
      for (let i = 0; i < JET_W; i++) {
        const v = s[k * JET_W + i]
        if (!v) continue
        a[j] = i - (JET_W - 1) / 2
        b[j] = PIV_K - k
        c[j] = v
        j++
        shadowMask[k * JET_W + i] = 1
      }
    }
    if (n && y < firstSlice) firstSlice = y
    sliceA.push(a)
    sliceB.push(b)
    sliceC.push(c)
  }

  // the jet from above, for the cockpit's status screen: 0 empty, 1 body, 2 paint, 3 glass
  const jetTop = { w: JET_W, h: JET_L, cells: new Uint8Array(JET_W * JET_L) }
  for (let y = JET_H - 1; y >= 0; y--) {
    for (let o = 0; o < JET_W * JET_L; o++) {
      const v = slices[y][o]
      if (v && jetTop.cells[o] === 0) jetTop.cells[o] = 1 + Math.min(2, (v - 1) >> 4)
    }
  }

  // ── palettes (rebuilt when colours or the time of day change)
  const jetPal = new Uint32Array(96)
  const jetPalLit = new Uint32Array(96) // one tone up, for surfaces turned to the sun
  const jetPalDim = new Uint32Array(96) // one tone down, for surfaces turned away
  // the same three tones in the enemy colours
  const foePal = new Uint32Array(96)
  const foePalLit = new Uint32Array(96)
  const foePalDim = new Uint32Array(96)
  let outlineCol = 0
  const topLit = new Uint32Array(NMAT)
  const topShade = new Uint32Array(NMAT)
  const sideLit = new Uint32Array(NMAT)
  const sideShade = new Uint32Array(NMAT)
  const cloudTop = new Uint32Array(CK)
  const cloudSide = new Uint32Array(CK)
  const flamePal = new Uint32Array(6)
  const trailPal = new Uint32Array(3)
  const skyPal = new Uint32Array(NSKY)
  let hazeCol = 0
  let cloudUnder = 0
  let sunCol = 0
  let sunGlow = 0
  let sparkA = 0
  let sparkB = 0
  let foamCol = 0
  let sunX = 0.45
  let sunY = 0.3

  function rebuildPalettes() {
    const tod = p.timeOfDay
    paintJet(p.bodyColor, p.accentColor, p.canopyColor, jetPal, jetPalLit, jetPalDim)
    paintJet(p.enemyColor, p.enemyAccentColor, p.enemyCanopyColor, foePal, foePalLit, foePalDim)
    rebuildWorldPalettes(tod)
  }

  /** the jet's palette recoloured from three key colours, in its plain, lit and dim tones */
  function paintJet(bodyColor: string, accentColor: string, canopyColor: string, pal: Uint32Array, palLit: Uint32Array, palDim: Uint32Array) {
    const tod = p.timeOfDay
    // jet: recolour each family from its key tone
    const keys: Record<number, { key: number; col: number[]; def: number[] }> = {
      0: { key: 4, col: parseColor(bodyColor, [84, 89, 105]), def: [84, 89, 105] },
      1: { key: 3, col: parseColor(accentColor, [240, 88, 14]), def: [240, 88, 14] },
      2: { key: 3, col: parseColor(canopyColor, [30, 140, 160]), def: [30, 140, 160] },
    }
    const keyLum: Record<number, number> = {}
    for (const row of JET_PALETTE) {
      const fam = row[4]
      if (fam < 3 && ((row[0] - 1) & 15) === keys[fam].key) keyLum[fam] = lum([row[1], row[2], row[3]])
    }
    const jetAmount = tod === 'sunset' ? 0.5 : tod === 'night' ? 0.16 : 0
    for (const row of JET_PALETTE) {
      const idx = row[0]
      const fam = row[4]
      let c = [row[1], row[2], row[3]]
      if (fam < 3) {
        const k = keys[fam]
        const same = k.col[0] === k.def[0] && k.col[1] === k.def[1] && k.col[2] === k.def[2]
        if (!same) {
          const l = lum(c)
          const kl = keyLum[fam] || 100
          if (l <= kl) {
            const f = l / kl
            c = [k.col[0] * f, k.col[1] * f, k.col[2] * f]
          } else {
            const f = (l - kl) / (255 - kl)
            c = [k.col[0] + (255 - k.col[0]) * f, k.col[1] + (255 - k.col[1]) * f, k.col[2] + (255 - k.col[2]) * f]
          }
        }
        c = grade(c, tod, jetAmount)
      }
      pal[idx] = pack(c[0], c[1], c[2])
    }
    for (const row of JET_PALETTE) {
      const idx = row[0]
      const fam = row[4]
      palLit[idx] = fam < 3 && pal[idx + 1] ? pal[idx + 1] : pal[idx]
      palDim[idx] = fam < 3 && ((idx - 1) & 15) > 0 ? pal[idx - 1] : pal[idx]
    }
  }

  function rebuildWorldPalettes(tod: TimeOfDay) {
    cockpit = null // repainted in the new colours shortly
    cockpitDue = 0.3
    const oc = tod === 'night' ? [44, 64, 118] : grade([13, 15, 26], tod, 0.3)
    outlineCol = pack(oc[0], oc[1], oc[2])
    // world
    for (let m = 0; m < NMAT; m++) {
      const t = grade(MAT_TOP[m], tod, 1)
      const s = grade(MAT_SIDE[m], tod, 1)
      topLit[m] = pack(t[0], t[1], t[2])
      sideLit[m] = pack(s[0], s[1], s[2])
      topShade[m] = pack(t[0] * 0.62, t[1] * 0.67, t[2] * 0.8)
      sideShade[m] = pack(s[0] * 0.62, s[1] * 0.67, s[2] * 0.8)
    }
    for (let k = 0; k < CK; k++) {
      const f = k / (CK - 1)
      const ft = Math.min(1, k / 2)
      const ca = tod === 'night' ? 0.72 : 1
      const t = grade([218 + 37 * ft, 230 + 25 * ft, 247 + 8 * ft], tod, ca)
      const s = grade([158 + 44 * f, 182 + 36 * f, 222 + 18 * f], tod, ca)
      cloudTop[k] = pack(t[0], t[1], t[2])
      cloudSide[k] = pack(s[0], s[1], s[2])
    }
    const sa = tod === 'sunset' ? [255, 170, 110] : tod === 'night' ? [70, 110, 190] : [120, 190, 236]
    const sb = tod === 'sunset' ? [255, 226, 170] : tod === 'night' ? [170, 200, 240] : [236, 250, 255]
    const fm = tod === 'sunset' ? [255, 226, 214] : tod === 'night' ? [110, 140, 200] : [240, 252, 255]
    sparkA = pack(sa[0], sa[1], sa[2])
    sparkB = pack(sb[0], sb[1], sb[2])
    foamCol = pack(fm[0], fm[1], fm[2])
    const flames = [[255, 252, 224], [255, 224, 120], [255, 164, 44], [246, 96, 20], [176, 48, 26], [96, 34, 40]]
    for (let i = 0; i < 6; i++) flamePal[i] = pack(flames[i][0], flames[i][1], flames[i][2])
    const tr = [grade([255, 255, 255], tod, 0.8), grade([214, 232, 250], tod, 0.8), grade([170, 204, 240], tod, 0.8)]
    for (let i = 0; i < 3; i++) trailPal[i] = pack(tr[i][0], tr[i][1], tr[i][2])
    // sky: from the horizon up
    const skyA = tod === 'sunset' ? [255, 198, 132] : tod === 'night' ? [36, 56, 110] : [198, 232, 250]
    const skyM = tod === 'sunset' ? [238, 122, 130] : tod === 'night' ? [18, 28, 70] : [122, 190, 240]
    const skyB = tod === 'sunset' ? [84, 68, 150] : tod === 'night' ? [7, 10, 34] : [62, 142, 222]
    for (let i = 0; i < NSKY; i++) {
      const f = i / (NSKY - 1)
      const a = f < 0.5 ? skyA : skyM
      const b = f < 0.5 ? skyM : skyB
      const g = f < 0.5 ? f * 2 : f * 2 - 1
      skyPal[i] = pack(a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g, a[2] + (b[2] - a[2]) * g)
    }
    const hz = tod === 'sunset' ? [250, 182, 134] : tod === 'night' ? [28, 44, 92] : [188, 224, 246]
    hazeCol = pack(hz[0], hz[1], hz[2])
    const cu = grade([138, 160, 200], tod, tod === 'night' ? 0.72 : 1)
    cloudUnder = pack(cu[0], cu[1], cu[2])
    const sc2 = tod === 'night' ? [232, 238, 255] : [255, 244, 200]
    const sg = tod === 'night' ? [70, 96, 160] : [255, 222, 150]
    sunCol = pack(sc2[0], sc2[1], sc2[2])
    sunGlow = pack(sg[0], sg[1], sg[2])
    if (tod === 'sunset') { sunX = 0.95; sunY = 0.5 } else if (tod === 'night') { sunX = 0.3; sunY = 0.42 } else { sunX = 0.5; sunY = 0.32 }
  }

  // ── the world: a height and a material per ground pixel
  const heightMap = new Uint8Array(N * N)
  const matMap = new Uint8Array(N * N)
  const cloudN = new Uint8Array(NC * NC)
  const nz = new Uint8Array(256 * 256)
  let spawnX = N / 2
  let spawnY = N / 2

  function buildWorld() {
    const rnd = mulberry32((p.seed | 0) * 7919 + 13)
    for (let i = 0; i < nz.length; i++) nz[i] = (rnd() * 256) | 0

    const E = new Float32Array(N * N)
    addOctave(E, N, 512, 0.55, rnd)
    addOctave(E, N, 256, 1, rnd)
    addOctave(E, N, 128, 0.5, rnd)
    addOctave(E, N, 64, 0.25, rnd)
    addOctave(E, N, 32, 0.11, rnd)
    addOctave(E, N, 16, 0.05, rnd)
    normalise(E)

    // sea level from the wanted share of land
    const bins = new Uint32Array(1024)
    for (let o = 0; o < E.length; o++) bins[(E[o] * 1023) | 0]++
    const land = clamp(p.land, 0.02, 0.9)
    let acc = 0
    let sea = 1
    const target = (1 - land) * E.length
    for (let b = 0; b < 1024; b++) {
      acc += bins[b]
      if (acc >= target) { sea = (b + 1) / 1023; break }
    }
    const SAND = 0.012
    const span = Math.max(0.05, 1 - sea - SAND)

    for (let y = 0; y < N; y++) {
      const row = y << NSHIFT
      const rowNW = ((y - 2) & NM) << NSHIFT
      const rowSE = ((y + 2) & NM) << NSHIFT
      for (let x = 0; x < N; x++) {
        const o = row | x
        const e = E[o]
        const hs = hash8(o)
        const d = e - sea
        if (d < 0) {
          const dd = -d + (hs - 128) * 0.00004
          matMap[o] = dd > 0.07 ? 0 : dd > 0.03 ? 1 : dd > 0.008 ? 2 : 3
          heightMap[o] = 0
          continue
        }
        if (d < SAND) {
          matMap[o] = hs < 34 ? 5 : 4
          heightMap[o] = 0
          continue
        }
        const hr = (d - SAND) / span
        // terraces: 8 grass levels (2 px each), 4 rock levels and the snow cap (3 px each)
        let lv = hr < 0.5 ? 1 + ((hr * 16) | 0) : hr < 0.78 ? 9 + (((hr - 0.5) / 0.07) | 0) : 13 + (((hr - 0.78) / 0.09) | 0)
        if (lv > 15) lv = 15
        heightMap[o] = lv <= 8 ? lv * 2 : 16 + (lv - 8) * 3
        const g = E[rowNW | ((x - 2) & NM)] - E[rowSE | ((x + 2) & NM)]
        const lit = g < -0.007
        const shaded = g > 0.007
        if (lv >= 13) matMap[o] = shaded ? 16 : 15
        else if (lv >= 9) matMap[o] = lit ? 14 : shaded ? 13 : hs < 26 ? 13 : 12
        else matMap[o] = lit ? 8 : shaded ? 7 : hs < 22 ? 7 : hs > 240 ? 8 : 6
      }
    }

    // forests: little cones of leaves
    const STEP = 5
    for (let gy = 0; gy < N; gy += STEP) {
      for (let gx = 0; gx < N; gx += STEP) {
        const hs = hash8(gy * 977 + gx * 131 + 7)
        const cx = (gx + (hs & 3)) & NM
        const cy = (gy + ((hs >> 2) & 3)) & NM
        const o = (cy << NSHIFT) | cx
        const m = matMap[o]
        if (m < 6 || m > 8) continue
        const h0 = heightMap[o]
        if (h0 > 14) continue
        const f = E[(((cy + 613) & NM) << NSHIFT) | ((N - 1 - cx + 911) & NM)]
        const pr = (f - sea) * 30
        if (pr <= 0 || pr * 255 < hash8(o + 99)) continue
        const r = 2 + ((hs >> 4) & 1)
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > r + 0.3) continue
            const oo = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
            if (matMap[oo] < 4) continue
            const nh = h0 + 1 + Math.round((1 - dist / (r + 0.5)) * (r + 1))
            if (nh > heightMap[oo]) {
              heightMap[oo] = nh
              matMap[oo] = dist < 1.1 ? 9 : dist < r - 0.5 ? 10 : 11
            }
          }
        }
      }
    }

    // a start over open water next to land
    let best = -1
    for (let tries = 0; tries < 400; tries++) {
      const x = (rnd() * N) | 0
      const y = (rnd() * N) | 0
      const here = matMap[(y << NSHIFT) | x]
      if (here > 2) continue
      let landNear = 0
      for (let a = 0; a < 8; a++) {
        const xx = (x + Math.cos(a * 0.785) * 120) & NM
        const yy = (y + Math.sin(a * 0.785) * 120) & NM
        if (matMap[(yy << NSHIFT) | xx] >= 4) landNear++
      }
      if (landNear > best && landNear <= 5) { best = landNear; spawnX = x; spawnY = y }
    }

    // clouds: clusters of round puffs. Each cell holds (rank << 4) | thickness; a cloud shows
    // when its rank is under the cover setting, so the slider adds and removes whole clouds.
    cloudN.fill(0)
    for (let i = 0; i < 200; i++) {
      const rank = i & 15
      const cx = rnd() * NC
      const cy = rnd() * NC
      const sc = 0.6 + rnd() * rnd() * 1.25
      const ang = 0.35 + (rnd() - 0.5) * 1.3
      const len = (12 + rnd() * 24) * sc
      const puffs = 4 + ((rnd() * 7) | 0)
      for (let q = 0; q < puffs; q++) {
        const t = (q / (puffs - 1)) * 2 - 1
        const pxc = cx + Math.cos(ang) * t * len + (rnd() - 0.5) * 9 * sc
        const pyc = cy + Math.sin(ang) * t * len + (rnd() - 0.5) * 9 * sc
        const r = (6 + rnd() * 8) * sc * (1 - 0.45 * Math.abs(t))
        const maxT = clamp(Math.round(r * 0.6), 2, CK)
        const ri = Math.ceil(r)
        for (let dy = -ri; dy <= ri; dy++) {
          for (let dx = -ri; dx <= ri; dx++) {
            const d2 = (dx * dx + dy * dy) / (r * r)
            if (d2 > 1) continue
            const tk = Math.max(1, Math.round(Math.sqrt(1 - d2) * maxT))
            const xx = (Math.round(pxc) + dx) & NCM
            const yy = (Math.round(pyc) + dy) & NCM
            const oo = (yy << NCSHIFT) | xx
            if (tk > (cloudN[oo] & 15)) cloudN[oo] = (rank << 4) | tk
          }
        }
      }
    }
  }

  // ── state
  let W = 0
  let H = 0
  let fb = new Uint32Array(0)
  let bytes = new Uint8ClampedArray(0)
  let jetMask = new Uint8Array(0)
  let time = 0
  let introT = 0
  let spreadNow = p.spread
  let holding = false
  let holdT = 0
  let pointerOn = false
  let pointerX = 0
  let pointerY = 0
  let pointerIdle = 99
  let autoStunt = 6
  let burn = 0 // afterburner, eased in after the intro
  let boost = 0 // 0..1: how hard the thrusters are being pushed (hold)
  let boostKey = false
  let keyTurn = 0 // flying with the keys: −1 left … +1 right
  let keyClimb = 0 // −1 dive … +1 climb
  let keyMode = false // the keys fly the jet until the pointer moves again
  let altGoal = p.altitude // the height the jet is heading for
  let climbV = 0 // how fast it is climbing, px per second (smoothed)
  let climbTilt = 0 // the jet's climb angle, which the chase camera leans with
  let worldDirty = 0 // seconds until the world is rebuilt (waits for a slider to settle)
  let reseat = false
  const cam = { x: 0, y: 0, yaw: 0, alt: p.altitude } // what the view is centred on (yaw: the overhead heading)
  const follow = { x: 0, y: 0, alt: p.altitude } // the same point as it trails the jet; the cockpit locks on instead
  let jets: Jet[] = []
  let colY = new Int32Array(0) // per screen column: the highest row the ground has reached
  let zbuf = new Float32Array(0) // per pixel: how deep into the view the world is, so it can hide a jet behind it
  // the cockpit view is drawn on a larger square sheet and then turned (the horizon rolls)
  let sheetSide = 0
  let sheet = new Uint32Array(0)
  let sheetMask = new Uint8Array(0)
  let sheetColY = new Int32Array(0)
  let sheetZ = new Float32Array(0)
  let pivotY = 0 // the screen row the cockpit view rolls about
  let cockpit: CockpitArt | null = null
  let cockpitDue = 0.3 // seconds until the cockpit is (re)painted; it is done ahead of time, never mid-move
  let colLo = 0 // the columns and rows being drawn (all of them, except on the sheet)
  let colHi = 0
  let rowLo = 0
  let rowHi = 0
  let frameH = 0 // height of the frame on screen (H is the sheet's while the world is drawn on it)
  let backdrop = new Uint32Array(0) // what was behind a jet, kept while it fades in or out
  let sheetBackdrop = new Uint32Array(0)

  // the view: 0 = overhead, 1 = behind the jet, 2 = in the cockpit, and anywhere between while it moves
  const viewIndex = (v: ViewMode) => (v === 'cockpit' ? 2 : v === 'chase' ? 1 : 0)
  let viewTarget = viewIndex(p.view)
  // How much of each view the camera is in. Each weight glides to its goal through three soft
  // stages, so a change starts and ends gently, goes straight from any view to any other, and
  // can be redirected half-way without a jolt.
  const wChase = [0, 0, 0]
  const wCock = [0, 0, 0]
  wChase.fill(viewTarget === 1 ? 1 : 0)
  wCock.fill(viewTarget === 2 ? 1 : 0)
  let vC = wChase[2] // chase
  let vK = wCock[2] // cockpit (what is left over is the overhead view)
  let jetFade = 1 // how solid the leader is drawn: it fades out as the camera moves into it
  let camSpin = 0 // 1 while the camera is going round with a roll that began in the cockpit
  let chaseYaw = 0 // heading of the chase camera (lags the jet a little in turns)
  let yawDiff = 0 // how far the chase heading is from the overhead one, kept continuous
  let vQ = 0 // 1 / camera distance: 0 is the flat sprite-stack view
  let vTan = 1 // how steeply the camera looks down
  let vS = 1 // scale at the jet
  let vCx = 0 // where the jet sits on screen
  let vCy = 0
  let vCos = 1
  let vSin = 0
  let vYaw = 0
  let vIn = 0 // 0..1: how far into the cockpit the camera is
  const smoke = new Float32Array(SMOKE_N * SMOKE_F) // x, y, z, born, size, push x, push y, strength, life
  let smokeHead = 0
  let smokeClock = 0
  let vRoll = 0 // the camera's roll (cockpit only)
  let vSteerY = 0 // the screen row that means "hold this height" when pointing to climb or dive
  let vLean = 1 // how steeply the chase camera would look down if nothing were in its way
  let camFix = 0 // how far the chase camera is moved up or down to stay clear of hills and clouds, px
  let camFloor = 0 // the lowest the chase camera may sit right now, px
  let floorS = 0 // the lowest the jet may fly right now (the ground ahead plus clearance), smoothed
  let speedNow = p.speed
  // the pilot's head, swaying with the flying (design pixels; right and down are positive)
  let headX = 0
  let headY = 0
  let headVX = 0
  let headVY = 0
  // Smooth flames are not drawn into the picture: the fire layer over it draws them. For each:
  // nozzle x y, a point straight behind it x y, tip x y (frame px), radius at the nozzle,
  // how much larger things are at the tip, thrust 0..1, strength 0..1, how much of the nozzle,
  // middle and tip can be seen, which flame it is, the afterburner setting, and its true
  // length in nozzle radii.
  const flameData = new Float32Array(FLAME_MAX * FLAME_F)
  const flameOut = { count: 0, data: flameData }
  const flameSeen = new Float32Array(FLAME_MAX * 3).fill(1)
  const flameV = [0, 0, 0]

  /** 0..1: how far the cockpit has slid into place round the camera */
  function cockpitIn() {
    const u = clamp((vK - 0.16) / 0.84, 0, 1)
    return u * u * u * (u * (u * 6 - 15) + 10)
  }

  function updateView() {
    const sc = jetSize()
    const lead = jets[0]
    const top = 1 - vC - vK
    vCx = W >> 1
    vIn = vK
    cam.x = follow.x
    cam.y = follow.y
    cam.alt = follow.alt
    if ((vC === 0 && vK === 0) || !lead) {
      // the plain overhead view, exactly
      vQ = 0
      vTan = 1
      vLean = 1
      vS = 1
      vCy = H >> 1
      vSteerY = vCy
      vRoll = 0
      jetFade = 1
      vYaw = cam.yaw
    } else {
      // Each view is a camera pose; the frame shows a blend of the three.
      // chase: behind the jet (under boost it closes in a little, which widens the view)
      const dist = clamp(p.chaseDistance, 1, 8) * JET_L * sc * (1 - 0.16 * boost)
      const zoom = Math.max(1, (clamp(p.chaseSize, 0.05, 0.6) * W) / (JET_W * sc))
      // cockpit: at the pilot's eyes, looking at a point ahead of the nose
      const focalIn = W * 0.6 * (1 - 0.1 * boost)
      const ahead = COCKPIT_LOOK * vK
      const sn = Math.sin(lead.yaw)
      const cs = Math.cos(lead.yaw)
      cam.x += (lead.x + sn * ahead - follow.x) * vK
      cam.y += (lead.y - cs * ahead - follow.y) * vK
      cam.alt += (lead.z + COCKPIT_EYE * sc - follow.alt) * vK
      vQ = vC / dist + vK / COCKPIT_LOOK
      vS = Math.exp(vC * Math.log(zoom) + vK * Math.log(focalIn / COCKPIT_LOOK))
      // how steeply it looks down: 45° overhead, the chase angle behind, level in the cockpit.
      // The chase camera drops behind the jet as it climbs and rises over it as it dives, and
      // camFix lifts or lowers it to stay clear of the hills and out of the cloud layer.
      const angle = (45 * top + clamp(p.chaseAngle, 2, 40) * vC) * (Math.PI / 180)
      vLean = Math.tan(angle) - 0.5 * climbTilt * vC
      const free = 1 - vK
      vTan = Math.max(vLean + camFix * vQ * free, (camFloor - cam.alt) * vQ * free, (2 - cam.alt) * vQ)
      // where the jet (or, in the cockpit, the horizon) sits in the frame; a climb drops the horizon
      const focal = vS / vQ
      const cyChase = (H >> 1) + H * (0.14 - 0.03 * boost)
      const cyIn = pivotY + focal * Math.tan(clamp(lead.pitch * 0.8, -0.6, 0.6))
      vCy = top * (H >> 1) + vC * cyChase + vK * cyIn
      vSteerY = top * (H >> 1) + vC * cyChase + vK * H * 0.34
      // in the cockpit the view rolls and turns exactly with the jet
      // (a full roll is followed either all the way round or not at all, so it always ends level)
      vRoll = lead.roll * vK + spinOf(lead) * camSpin
      const behind = cam.yaw + yawDiff
      vYaw = cam.yaw + yawDiff * (vC + vK) + wrapAngle(-lead.yaw - behind) * vK
      // the jet fades away as the camera moves into it
      const f = clamp((vK - 0.12) / 0.4, 0, 1)
      jetFade = 1 - f * f * (3 - 2 * f)
    }
    vCos = Math.cos(vYaw)
    vSin = Math.sin(vYaw)
  }

  /** how long the afterburner flames are, in jet pixels (before the flicker) */
  function flameLength() {
    return (0.07 + 0.17 * p.afterburner) * JET_L * burn * clamp(1.6 - spreadNow * 0.6, 0, 1) * (1 + 1.6 * boost)
  }
  /** how far the flames bend: the exhaust trails round the inside of a turn */
  function flameBend() {
    const lead = jets[0]
    return lead ? clamp(lead.yawRate / Math.max(0.1, p.agility), -1, 1) * 0.36 : 0
  }
  /** how far through a full roll a jet is, as an angle (0 when it is not rolling) */
  function spinOf(j: Jet) {
    if (j.stunt < 0 || j.stuntDelay > 0) return 0
    const t = j.stunt
    return j.stuntDir * Math.PI * 2 * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
  }
  /** a jet's bank angle, including any roll it is half-way through */
  function rollOf(j: Jet) {
    return j.roll + spinOf(j)
  }
  const groundAt = (x: number, y: number) => heightMap[(((y | 0) & NM) << NSHIFT) | ((x | 0) & NM)]
  /** the tallest ground under a jet and along the next stretch of its path */
  function groundAhead(j: Jet, speed: number) {
    const sn = Math.sin(j.yaw)
    const cs = Math.cos(j.yaw)
    let top = 0
    for (let i = 0; i <= 4; i++) {
      const d = speed * 0.16 * i
      for (let side = -1; side <= 1; side++) {
        const h = groundAt(j.x + sn * d + cs * side * 7, j.y - cs * d + sn * side * 7)
        if (h > top) top = h
      }
    }
    return top
  }

  const jetSize = () => clamp(p.jetScale || 1, 0.4, 2)
  const formX = () => JET_W * 1.2 * jetSize() + 2
  const formY = () => JET_L * 0.74 * jetSize()

  function resetFlight() {
    const yaw = 0.9
    jets = [makeJet(spawnX, spawnY, p.altitude, yaw)]
    cam.x = follow.x = spawnX
    cam.y = follow.y = spawnY
    cam.yaw = -yaw * p.cameraFollow
    cam.alt = follow.alt = p.altitude
    camFix = 0
    camFloor = 0
    floorS = 0
    chaseYaw = -yaw
    yawDiff = wrapAngle(chaseYaw - cam.yaw)
    introT = p.intro ? 0 : 99
    burn = p.intro ? 0 : 1
    autoStunt = 7
    altGoal = p.altitude
    climbV = 0
    climbTilt = 0
    boost = 0
  }
  function syncWingmen() {
    const want = 1 + clamp(Math.round(p.wingmen), 0, 2)
    const lead = jets[0]
    while (jets.length < want) {
      const side = jets.length === 1 ? -1 : 1
      const j = makeJet(
        lead.x + Math.cos(lead.yaw) * side * formX() - Math.sin(lead.yaw) * formY(),
        lead.y + Math.sin(lead.yaw) * side * formX() + Math.cos(lead.yaw) * formY(),
        lead.z, lead.yaw,
      )
      jets.push(j)
    }
    if (jets.length > want) jets.length = want
  }

  // ── combat: guns, missiles, enemy jets and what is left when they are hit
  //
  // Bullets and missiles live in plain pools of numbers. Every one is a world point that is
  // projected like everything else, so they show in all three views.
  const BUL_N = 512
  const BUL_F = 8 // x, y, z, vx, vy, vz, life left, team (0 ours, 1 theirs)
  const BUL_SPEED = 820 // px per second on top of the jet's own speed
  const BUL_LIFE = 1.15
  const GUN_EVERY = 0.065 // seconds between rounds
  const GUN_DAMAGE = 9
  const FOE_GUN_DAMAGE = 3
  const MSL_N = 32
  const MSL_F = 12 // x, y, z, vx, vy, vz, age, team, target (index into foes, −1 none), life, smoke clock, side
  const MSL_SPEED = 470
  const MSL_TURN = 2.6 // rad per second
  const MSL_MAX = 6
  const MSL_RELOAD = 4 // seconds to make another missile
  const LOCK_RANGE = 1100
  const LOCK_CONE = 0.42 // rad either side of the nose
  const LOCK_TIME = 0.55 // seconds of holding a target in the cone before it is locked
  const FX_N = 900
  const FX_F = 11 // x, y, z, vx, vy, vz, born, life, size, kind, gravity
  const FX_FIRE = 0
  const FX_SMOKE = 1
  const FX_WHITE = 2
  const FX_SPARK = 3
  const FX_DEBRIS = 4
  const HIT_R = JET_L * 0.42 // how close a round must pass to a jet's centre to hit it, jet px

  const bullets = new Float32Array(BUL_N * BUL_F)
  let bulHead = 0
  const missiles = new Float32Array(MSL_N * MSL_F)
  let mslHead = 0
  const fx = new Float32Array(FX_N * FX_F)
  let fxHead = 0
  let foes: Jet[] = []
  let gunHeld = false
  let gunCool = 0
  let gunSide = 1
  let missileQueued = false
  let missilesLeft = MSL_MAX
  let reload = 0
  let mslSide = 1
  let lockFoe = -1 // the enemy in the nose cone
  let lockT = 0 // how long it has been held there
  let kills = 0
  let losses = 0
  let playerDead = -1 // seconds since the player was shot down, −1 while flying
  let shield = 0 // seconds of not being hit after coming back
  let hurt = 0 // 0..1 red flash when hit
  let muzzle = 0 // 0..1 flash at the guns

  const rand = (a: number, b: number) => a + Math.random() * (b - a)
  const leadAlive = () => playerDead < 0

  function emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, kind: number, gravity = 0) {
    const o = fxHead * FX_F
    fx[o] = x; fx[o + 1] = y; fx[o + 2] = z
    fx[o + 3] = vx; fx[o + 4] = vy; fx[o + 5] = vz
    fx[o + 6] = time; fx[o + 7] = life; fx[o + 8] = size; fx[o + 9] = kind; fx[o + 10] = gravity
    fxHead = (fxHead + 1) % FX_N
  }

  /** a fireball, smoke and flying pieces; `big` for a jet, smaller for a missile hitting the ground */
  function explode(x: number, y: number, z: number, vx: number, vy: number, big: number) {
    const sc = jetSize()
    const n = Math.round(10 * big)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const e = rand(-0.6, 1)
      const sp = rand(20, 70) * big
      emit(x, y, z, vx * 0.35 + Math.cos(a) * sp, vy * 0.35 + Math.sin(a) * sp, e * sp, rand(0.45, 0.95), rand(2.5, 6) * sc * big, FX_FIRE)
    }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      emit(x + rand(-4, 4), y + rand(-4, 4), z, vx * 0.2 + Math.cos(a) * 18, vy * 0.2 + Math.sin(a) * 18, rand(4, 16), rand(1.6, 3), rand(3.5, 7) * sc * big, FX_SMOKE)
    }
    for (let i = 0; i < Math.round(14 * big); i++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(40, 140)
      emit(x, y, z, vx * 0.5 + Math.cos(a) * sp, vy * 0.5 + Math.sin(a) * sp, rand(10, 90), rand(1, 2.2), 1, FX_DEBRIS, 120)
    }
    for (let i = 0; i < Math.round(10 * big); i++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(80, 200)
      emit(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, rand(-60, 100), rand(0.2, 0.45), 1, FX_SPARK, 60)
    }
  }

  function sparks(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(40, 120)
      emit(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, rand(-40, 80), rand(0.15, 0.35), 1, FX_SPARK, 40)
    }
  }

  /** a jet's point given in its own px: across to the right, ahead along the fuselage, up */
  function jetPoint(j: Jet, across: number, ahead: number, up: number) {
    const ax = axes(j)
    const sc = jetSize()
    return [
      j.x + (across * ax.rx + ahead * ax.fx + up * ax.ux) * sc,
      j.y + (across * ax.ry + ahead * ax.fy + up * ax.uy) * sc,
      j.z + (across * ax.rz + ahead * ax.fz + up * ax.uz) * sc,
      ax.fx, ax.fy, ax.fz,
    ]
  }

  function fireRound(j: Jet, team: number, side: number, spread: number) {
    const m = jetPoint(j, side * 6, PIV_K * 0.55, 0)
    let fx0 = m[3] + rand(-spread, spread)
    let fy0 = m[4] + rand(-spread, spread)
    let fz0 = m[5] + rand(-spread, spread) * 0.6
    const l = Math.hypot(fx0, fy0, fz0) || 1
    fx0 /= l; fy0 /= l; fz0 /= l
    const o = bulHead * BUL_F
    bullets[o] = m[0]; bullets[o + 1] = m[1]; bullets[o + 2] = m[2]
    bullets[o + 3] = j.vx + fx0 * BUL_SPEED
    bullets[o + 4] = j.vy + fy0 * BUL_SPEED
    bullets[o + 5] = fz0 * BUL_SPEED
    bullets[o + 6] = BUL_LIFE
    bullets[o + 7] = team
    bulHead = (bulHead + 1) % BUL_N
  }

  function launchMissile(j: Jet, team: number, target: number) {
    const m = jetPoint(j, mslSide * 9, -2, -2)
    mslSide = -mslSide
    const o = mslHead * MSL_F
    missiles[o] = m[0]; missiles[o + 1] = m[1]; missiles[o + 2] = m[2]
    // it drops clear of the wing for a moment before its motor lights
    missiles[o + 3] = j.vx + m[3] * 30
    missiles[o + 4] = j.vy + m[4] * 30
    missiles[o + 5] = m[5] * 30 - 26
    missiles[o + 6] = 0
    missiles[o + 7] = team
    missiles[o + 8] = target
    missiles[o + 9] = 6
    missiles[o + 10] = 0
    missiles[o + 11] = 1
    mslHead = (mslHead + 1) % MSL_N
  }

  /** where to put a new enemy: well away from the player, mostly ahead so it comes to meet them */
  function placeFoe(f: Jet) {
    const lead = jets[0]
    const a = lead.yaw + rand(-1.3, 1.3)
    const d = rand(750, 1050)
    f.x = lead.x + Math.sin(a) * d
    f.y = lead.y - Math.cos(a) * d
    f.z = clamp(lead.z + rand(-10, 40), groundAt(f.x, f.y) + 20, Math.max(60, p.ceiling - 10))
    f.yaw = Math.atan2(lead.x - f.x, -(lead.y - f.y)) + rand(-0.4, 0.4)
    f.yawRate = 0
    f.roll = 0
    f.pitch = 0
    f.hp = 100
    f.dead = -1
    f.aiMode = 0
    f.aiT = rand(4, 8)
    f.aiAlt = rand(-14, 22)
    f.aiSide = Math.random() < 0.5 ? -1 : 1
    f.gunCool = rand(1, 2.5)
    f.trailLen = 0
    f.lastTrailX = f.x
    f.lastTrailY = f.y
  }
  function syncFoes() {
    const want = clamp(Math.round(p.enemies), 0, 8)
    while (foes.length < want) {
      const f = makeJet(0, 0, p.altitude, 0, true)
      placeFoe(f)
      // the first ones wait a little, so the intro plays out first
      f.dead = rand(0, 2.5) // counts up to 5, then it flies in
      foes.push(f)
    }
    if (foes.length > want) foes.length = want
  }

  function hitFoe(i: number, dmg: number, x: number, y: number, z: number) {
    const f = foes[i]
    if (f.dead >= 0) return
    f.hp -= dmg
    sparks(x, y, z, 3)
    say('hit')
    if (f.hp <= 0) {
      f.dead = 0
      kills++
      addScore(100)
      say('boom-big')
      explode(f.x, f.y, f.z, f.vx, f.vy, 1.3)
      if (lockFoe === i) { lockFoe = -1; lockT = 0 }
    } else if (f.aiMode === 0 && Math.random() < 0.25) {
      // hit: it breaks away
      f.aiMode = 1
      f.aiT = rand(1.4, 2.4)
      f.aiSide = Math.random() < 0.5 ? -1 : 1
    }
  }
  function hitPlayer(dmg: number, x: number, y: number, z: number) {
    if (!leadAlive() || shield > 0) return
    const lead = jets[0]
    lead.hp -= tough ? 0 : dmg * armorMul()
    hurt = 1
    say('hurt')
    sparks(x, y, z, 3)
    if (lead.hp <= 0) {
      lead.hp = 0
      playerDead = 0
      losses++
      say('dead')
      explode(lead.x, lead.y, lead.z, lead.vx, lead.vy, 1.5)
      lockFoe = -1
      lockT = 0
    }
  }

  /** closest approach of a segment a→b to point c, squared */
  function segDist2(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
    const dx = bx - ax
    const dy = by - ay
    const dz = bz - az
    const l2 = dx * dx + dy * dy + dz * dz
    let t = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / l2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const ex = ax + dx * t - cx
    const ey = ay + dy * t - cy
    const ez = az + dz * t - cz
    return ex * ex + ey * ey + ez * ez
  }

  /** the enemy AI: chase the player, line up a shot, break away now and then, keep off the ground */
  function flyFoe(f: Jet, dt: number, clearance: number) {
    const lead = jets[0]
    const skill = skillNow()
    const maxRate = Math.max(0.1, p.agility) * (0.62 + 0.3 * skill)
    const dx = lead.x - f.x
    const dy = lead.y - f.y
    const dist = Math.hypot(dx, dy)
    // too far away to matter: bring it back round
    if (dist > 2600) { placeFoe(f); return }
    let want = 0
    f.aiT -= dt
    if (f.aiMode === 0) {
      // lead the target a little, as a pilot would
      const tgo = Math.min(1.2, dist / (BUL_SPEED + p.speed))
      const ax = lead.x + lead.vx * tgo - f.x
      const ay = lead.y + lead.vy * tgo - f.y
      const aim = leadAlive() ? Math.atan2(ax, -ay) : f.yaw + 0.4
      want = clamp(wrapAngle(aim - f.yaw) * 2.4, -maxRate, maxRate)
      if (f.aiT <= 0 || dist < 70) { f.aiMode = 1; f.aiT = rand(1.6, 3); f.aiSide = Math.random() < 0.5 ? -1 : 1 }
    } else {
      want = f.aiSide * maxRate
      if (f.aiT <= 0) { f.aiMode = 0; f.aiT = rand(4, 8); f.aiAlt = rand(-14, 22) }
    }
    // keep apart from the other enemies
    for (const o of foes) {
      if (o === f || o.dead >= 0) continue
      const ox = f.x - o.x
      const oy = f.y - o.y
      const d2 = ox * ox + oy * oy
      if (d2 < 60 * 60 && d2 > 0) want += clamp(wrapAngle(Math.atan2(ox, -oy) - f.yaw), -1, 1) * 0.6
    }
    want = clamp(want, -maxRate, maxRate)
    f.yawRate += (want - f.yawRate) * (1 - Math.exp(-dt * 2.6))
    f.yaw += f.yawRate * dt
    const bankMax = (p.bank * Math.PI) / 180
    f.roll += (clamp(f.yawRate / maxRate, -1, 1) * bankMax - f.roll) * (1 - Math.exp(-dt * 5))
    // faster when far behind, so it can catch up; about the player's speed when close
    const speed = p.speed * (0.92 + clamp((dist - 300) / 900, 0, 1) * 0.55)
    f.vx = Math.sin(f.yaw) * speed
    f.vy = -Math.cos(f.yaw) * speed
    f.x += f.vx * dt
    f.y += f.vy * dt
    const floor = groundAhead(f, speed) + clearance
    const goal = clamp(lead.z + f.aiAlt, floor, Math.max(floor, clamp(p.ceiling, 20, 900)))
    const climbMax = speed * 0.5
    const dz = clamp((goal - f.z) * (1 - Math.exp(-dt * 2)), -climbMax * dt, climbMax * dt)
    f.z += dz
    f.z = Math.max(f.z, groundAt(f.x, f.y) + clearance * 0.7)
    f.pitch += (clamp(dz / Math.max(dt, 1e-4) / Math.max(20, speed), -0.5, 0.5) - f.pitch) * (1 - Math.exp(-dt * 4))
    f.g += (clamp(Math.abs(f.yawRate) / maxRate, 0, 1) - f.g) * (1 - Math.exp(-dt * 2.5))
    // guns: short bursts when the player is in front and close
    f.gunCool -= dt
    if (leadAlive() && f.gunCool <= 0 && dist < 460) {
      const off = Math.abs(wrapAngle(Math.atan2(dx, -dy) - f.yaw))
      const vert = Math.abs(lead.z - f.z) / Math.max(30, dist)
      if (off < 0.16 && vert < 0.25) {
        fireRound(f, 1, (Math.random() < 0.5 ? -1 : 1), 0.05 - 0.035 * skill)
        f.gunCool = 0.11
        if (Math.random() < 0.16) f.gunCool = rand(0.8, 1.6) // between bursts
      }
    }
    // a damaged jet trails black smoke
    if (f.hp < 55) {
      f.smokeT -= dt
      if (f.smokeT <= 0) {
        f.smokeT = 0.05
        emit(f.x - f.vx * 0.04, f.y - f.vy * 0.04, f.z, 0, 0, 6, rand(0.9, 1.5), rand(2, 3.5) * jetSize(), FX_SMOKE)
      }
    }
  }

  function combatStep(dt: number, introDone: boolean, clearance: number) {
    const lead = jets[0]
    if (phase === 'demo') syncFoes()
    hurt = Math.max(0, hurt - dt * 2.2)
    muzzle = Math.max(0, muzzle - dt * 12)
    if (shield > 0) shield -= dt
    // the player comes back a little after being shot down
    if (playerDead >= 0) {
      playerDead += dt
      if (phase === 'demo' && playerDead > 2.6) { playerDead = -1; lead.hp = 100; shield = 2.5 }
    }
    // missiles are made again slowly
    if (phase === 'demo' && missilesLeft < MSL_MAX) {
      reload += dt
      if (reload >= MSL_RELOAD) { reload = 0; missilesLeft++ }
    } else reload = 0
    // the enemies
    for (let i = 0; i < foes.length; i++) {
      const f = foes[i]
      if (f.dead >= 0) {
        f.dead += dt
        if (f.dead > 5 && introDone && phase === 'demo') placeFoe(f)
        continue
      }
      if (!introDone) continue
      flyFoe(f, dt, clearance)
      trailStep(f)
    }
    // lock-on: the enemy nearest the nose, inside the cone and in range
    let best = -1
    let bestOff = LOCK_CONE
    let bestD = 0
    if (leadAlive()) {
      for (let i = 0; i < foes.length; i++) {
        const f = foes[i]
        if (f.dead >= 0) continue
        const dx = f.x - lead.x
        const dy = f.y - lead.y
        const d = Math.hypot(dx, dy)
        if (d > LOCK_RANGE || d < 40) continue
        const off = Math.abs(wrapAngle(Math.atan2(dx, -dy) - lead.yaw)) + Math.abs(f.z - lead.z) / d * 0.5
        if (off < bestOff) { bestOff = off; best = i; bestD = d }
      }
    }
    if (best !== lockFoe) { lockFoe = best; lockT = 0 } else if (best >= 0) lockT += dt
    // on touch screens the guns can fire on their own when an enemy is right in front
    autoFiring = autoGuns && phase === 'wave' && best >= 0 && bestOff < 0.2 && bestD < 620
    // the player's guns and missiles
    gunCool -= dt
    if ((gunHeld || autoFiring) && introDone && leadAlive() && gunCool <= 0) {
      fireRound(lead, 0, gunSide, 0.012)
      if (gunSide > 0) say('gun')
      gunSide = -gunSide
      gunCool = GUN_EVERY
      muzzle = 1
    }
    if (missileQueued) {
      missileQueued = false
      if (introDone && leadAlive() && missilesLeft > 0) {
        missilesLeft--
        launchMissile(lead, 0, lockFoe >= 0 && lockT >= LOCK_TIME ? lockFoe : -1)
      }
    }
    // rounds in flight
    for (let n = 0; n < BUL_N; n++) {
      const o = n * BUL_F
      if (bullets[o + 6] <= 0) continue
      const x0 = bullets[o]
      const y0 = bullets[o + 1]
      const z0 = bullets[o + 2]
      const x1 = x0 + bullets[o + 3] * dt
      const y1 = y0 + bullets[o + 4] * dt
      const z1 = z0 + bullets[o + 5] * dt
      bullets[o] = x1; bullets[o + 1] = y1; bullets[o + 2] = z1
      bullets[o + 6] -= dt
      if (bullets[o + 7] === 0 && ship && ship.dead < 0 && z1 < DECK_Z + 2 && onShip(x1, y1)) {
        bullets[o + 6] = 0
        sparks(x1, y1, z1, 2)
        damageShip(GUN_DAMAGE * 0.3 * damageMul())
        continue
      }
      if (z1 < groundAt(x1, y1)) {
        bullets[o + 6] = 0
        emit(x1, y1, z1 + 1, 0, 0, 20, 0.5, 1.4 * jetSize(), FX_WHITE)
        if (bullets[o + 7] === 0) {
          for (const s of sites) {
            if (s.dead < 0 && Math.abs(s.x - x1) < 13 && Math.abs(s.y - y1) < 13) { damageSite(s, GUN_DAMAGE * 0.5 * damageMul()); sparks(x1, y1, z1 + 1, 2); break }
          }
        }
        continue
      }
      const r2 = HIT_R * jetSize() * HIT_R * jetSize()
      if (bullets[o + 7] === 0) {
        for (let i = 0; i < foes.length; i++) {
          const f = foes[i]
          if (f.dead >= 0) continue
          if (segDist2(x0, y0, z0, x1, y1, z1, f.x, f.y, f.z) < r2) {
            bullets[o + 6] = 0
            hitFoe(i, GUN_DAMAGE * damageMul(), x1, y1, z1)
            break
          }
        }
      } else if (leadAlive() && segDist2(x0, y0, z0, x1, y1, z1, lead.x, lead.y, lead.z) < r2) {
        bullets[o + 6] = 0
        hitPlayer(FOE_GUN_DAMAGE * (0.7 + 0.6 * skillNow()) * (phase === 'demo' ? 1 : Math.min(1.2, 0.55 + 0.05 * wave)), x1, y1, z1)
      }
    }
    // missiles in flight
    for (let n = 0; n < MSL_N; n++) {
      const o = n * MSL_F
      if (missiles[o + 9] <= 0) continue
      const age = (missiles[o + 6] += dt)
      missiles[o + 9] -= dt
      let vx = missiles[o + 3]
      let vy = missiles[o + 4]
      let vz = missiles[o + 5]
      if (age > 0.28) {
        // motor on: speed up, and turn towards where the target will be
        const sp = Math.hypot(vx, vy, vz) || 1
        let dx = vx / sp
        let dy = vy / sp
        let dz = vz / sp
        const ti = missiles[o + 8] | 0
        const theirs = missiles[o + 7] === 1
        // an enemy missile homes on the player; ours on the locked enemy
        const t = theirs ? (leadAlive() ? jets[0] : null) : ti >= 0 ? foes[ti] : null
        if (theirs && t) samWarn = 0
        if (t && t.dead < 0) {
          const ex = t.x - missiles[o]
          const ey = t.y - missiles[o + 1]
          const ez = t.z - missiles[o + 2]
          const tgo = Math.hypot(ex, ey, ez) / Math.max(200, sp)
          let wx = ex + t.vx * tgo
          let wy = ey + t.vy * tgo
          let wz = ez
          const wl = Math.hypot(wx, wy, wz) || 1
          wx /= wl; wy /= wl; wz /= wl
          const k = Math.min(1, (theirs ? 1.45 + 0.45 * skillNow() : MSL_TURN) * dt)
          dx += (wx - dx) * k
          dy += (wy - dy) * k
          dz += (wz - dz) * k
          const dl = Math.hypot(dx, dy, dz) || 1
          dx /= dl; dy /= dl; dz /= dl
        } else if (dz < 0) dz *= 1 - dt * 2 // no target: it levels out and flies on
        const nsp = Math.min(theirs ? 300 + p.speed : MSL_SPEED + p.speed, sp + 520 * dt)
        vx = dx * nsp
        vy = dy * nsp
        vz = dz * nsp
        // white smoke behind it
        missiles[o + 10] -= dt
        if (missiles[o + 10] <= 0) {
          missiles[o + 10] = 0.018
          emit(missiles[o], missiles[o + 1], missiles[o + 2], rand(-4, 4), rand(-4, 4), rand(2, 6), rand(1.1, 1.8), rand(1.1, 1.8) * jetSize(), FX_WHITE)
        }
      } else vz -= 60 * dt
      missiles[o + 3] = vx
      missiles[o + 4] = vy
      missiles[o + 5] = vz
      const x0 = missiles[o]
      const y0 = missiles[o + 1]
      const z0 = missiles[o + 2]
      const x1 = x0 + vx * dt
      const y1 = y0 + vy * dt
      const z1 = z0 + vz * dt
      missiles[o] = x1; missiles[o + 1] = y1; missiles[o + 2] = z1
      // the fuse: close enough to any enemy, the ground, or out of fuel
      let boom = missiles[o + 9] <= 0 || z1 < groundAt(x1, y1) + 1
      if (!boom && age > 0.28 && missiles[o + 7] === 1) {
        const fuse = 14 * jetSize()
        const lead = jets[0]
        if (leadAlive() && segDist2(x0, y0, z0, x1, y1, z1, lead.x, lead.y, lead.z) < fuse * fuse) {
          hitPlayer(30, x1, y1, z1)
          boom = true
        }
      } else if (!boom && age > 0.28) {
        const fuse = 16 * jetSize()
        for (let i = 0; i < foes.length; i++) {
          const f = foes[i]
          if (f.dead >= 0) continue
          if (segDist2(x0, y0, z0, x1, y1, z1, f.x, f.y, f.z) < fuse * fuse) {
            hitFoe(i, 120, x1, y1, z1)
            boom = true
            break
          }
        }
      }
      if (boom) {
        missiles[o + 9] = 0
        explode(x1, y1, Math.max(z1, groundAt(x1, y1) + 1), vx * 0.2, vy * 0.2, 0.7)
        if (missiles[o + 7] === 0 && z1 < groundAt(x1, y1) + 4) blast(x1, y1, groundAt(x1, y1), BOMB_RADIUS * 0.8, BOMB_DAMAGE * 0.8 * damageMul())
        if (missiles[o + 7] === 0 || leadAlive()) say('boom-s')
      }
    }
    gameStep(dt)
  }

  /** the wingtip trails: a point every few px */
  function trailStep(j: Jet) {
    const ddx = j.x - j.lastTrailX
    const ddy = j.y - j.lastTrailY
    if (ddx * ddx + ddy * ddy <= 6.25) return
    j.lastTrailX = j.x
    j.lastTrailY = j.y
    const ax = axes(j)
    const sc = jetSize()
    for (let w = 0; w < 2; w++) {
      const a = (w === 0 ? -WINGTIP_A : WINGTIP_A) * sc
      const b = (PIV_K - WINGTIP_K) * sc
      const hy = (WINGTIP_Y - PIV_Y) * sc
      const o = j.trailHead * 4
      j.trail[w][o] = j.x + a * ax.rx + b * ax.fx + hy * ax.ux
      j.trail[w][o + 1] = j.y + a * ax.ry + b * ax.fy + hy * ax.uy
      j.trail[w][o + 2] = j.z + a * ax.rz + b * ax.fz + hy * ax.uz
      j.trail[w][o + 3] = time
    }
    j.trailHead = (j.trailHead + 1) % TRAIL_N
    if (j.trailLen < TRAIL_N) j.trailLen++
  }

  // ── the game (Jet Flight): waves of enemy jets and anti-aircraft guns on the islands
  //
  // Out of a game ('demo') the scene flies on its own behind the title screen. In a game,
  // every wave brings enemy jets and guns on the ground (flak, then missile launchers, and a
  // ship full of guns every fifth wave). Bombs are for the ground, the guns and missiles for
  // the sky. Between two waves the player picks an upgrade: speed, armour or damage.
  type Phase = 'demo' | 'wave' | 'between' | 'over'
  type Upgrade = 'speed' | 'armor' | 'damage'
  interface Site {
    x: number
    y: number
    z: number
    kind: number // 0 flak gun, 1 missile launcher
    hp: number
    max: number
    dead: number // −1 standing, else seconds since it was destroyed
    cool: number // seconds until it fires again
    aim: number // where the barrels point (a heading)
    elev: number // how far up they point
    flash: number // 0..1 white blink when hit
    mount: number // −1 on land, else its place on the ship (index into SHIP_MOUNTS)
  }
  interface Crate {
    x: number
    y: number
    z: number
    kind: number // 0 repair, 1 bombs, 2 missiles
    age: number
  }
  interface Ship {
    x: number
    y: number
    yaw: number
    hp: number
    max: number
    dead: number
    flash: number
    side: number // which way it turns away from land
    wakeT: number
    boomT: number // the chain of explosions once it is sunk
  }

  const UPGRADE_STEP: Record<Upgrade, number> = { speed: 10, armor: 20, damage: 25 } // percent per pick
  const BOMB_N = 24
  const BOMB_F = 7 // x, y, z, vx, vy, vz, live
  const BOMB_G = 110 // px per second²
  const BOMB_RADIUS = 26
  const BOMB_DAMAGE = 120
  const BOMB_MAX = 6
  const BOMB_REGEN = 9 // seconds to make one bomb when there are none left and targets on the ground
  const SHELL_N = 96
  const SHELL_F = 7 // x, y, z, vx, vy, vz, fuse
  const FLAK_RANGE = 520
  const FLAK_SPEED = 360
  const FLAK_BURST = 24 // px: how close a burst must be to hurt
  const SAM_RANGE = 780
  const CRATE_LIFE = 32
  // the ship and the guns are little models of blocks; one block is SS or GS world px
  const SS = 2
  const GS = 2
  const SHIP_L = 46 // half the ship's length, in blocks
  const SHIP_W = 9 // half its width amidships, in blocks
  const SHIP_DECK = 5 // in blocks
  const DECK_Z = SHIP_DECK * SS // world px
  const SHIP_SPEED = 13
  // the ship's turrets: across, ahead, in blocks
  const SHIP_MOUNTS = [[0, 31], [0, 18], [0, -26], [0, -37], [-5, -6], [5, -6]]

  let phase: Phase = 'demo'
  let wave = 0
  let score = 0
  let bombsLeft = 0
  let bombRegen = 0
  let bombQueued = false
  let bombCool = 0
  let upSpeed = 0
  let upArmor = 0
  let upDamage = 0
  let sites: Site[] = []
  let crates: Crate[] = []
  let ship: Ship | null = null
  let foeSkill = 0.5
  let foeQueue = 0 // enemy jets still to come this wave
  let foeTimer = 0
  let autoGuns = false
  let autoFiring = false
  let samWarn = 99 // seconds since an enemy missile last homed on the player
  let tough = false // tests and the demo video only: nothing hurts
  let events: string[] = []
  const bombs = new Float32Array(BOMB_N * BOMB_F)
  let bombHead = 0
  const shells = new Float32Array(SHELL_N * SHELL_F)
  let shellHead = 0

  const playing = () => phase === 'wave' || phase === 'between'
  const speedMul = () => (phase === 'demo' ? 1 : 1 + upSpeed / 100)
  const damageMul = () => (phase === 'demo' ? 1 : 1 + upDamage / 100)
  const armorMul = () => (phase === 'demo' ? 1 : 100 / (100 + upArmor))
  const skillNow = () => (phase === 'demo' ? clamp(p.enemySkill, 0, 1) : foeSkill)
  const say = (e: string) => { if (events.length < 96) events.push(e) }
  /** the copy of a point in the wrapping world that lies nearest to `ref` */
  const near = (v: number, ref: number) => v - Math.round((v - ref) / N) * N

  function shipFrame(s: Ship) {
    return { fx: Math.sin(s.yaw), fy: -Math.cos(s.yaw), rx: Math.cos(s.yaw), ry: Math.sin(s.yaw) }
  }
  /** half the hull's width at a point along it, in blocks */
  function hullHalfWidth(ahead: number) {
    if (ahead > 18) return SHIP_W * Math.pow(Math.max(0, 1 - (ahead - 18) / (SHIP_L - 18 + 1)), 0.7)
    if (ahead < -38) return SHIP_W * 0.82
    return SHIP_W
  }
  /** where a world point is on the ship: across and ahead, or null when it is not over the hull */
  function onShip(x: number, y: number, margin = 0) {
    if (!ship || ship.dead >= 0) return null
    const f = shipFrame(ship)
    const dx = x - ship.x
    const dy = y - ship.y
    const ahead = (dx * f.fx + dy * f.fy) / SS
    const across = (dx * f.rx + dy * f.ry) / SS
    const m = margin / SS
    if (Math.abs(ahead) > SHIP_L + m || Math.abs(across) > hullHalfWidth(ahead) + m) return null
    return { ahead, across }
  }

  const isGround = (m: number) => (m >= 6 && m <= 8) || (m >= 12 && m <= 14)
  /** a flat bit of open land at a distance from the player, away from the other guns */
  function landSpot(dmin: number, dmax: number) {
    const lead = jets[0]
    for (let t = 0; t < 600; t++) {
      const relax = t > 400
      const a = Math.random() * Math.PI * 2
      const d = rand(dmin, relax ? dmax * 1.4 : dmax)
      const x = Math.round(lead.x + Math.sin(a) * d)
      const y = Math.round(lead.y - Math.cos(a) * d)
      if (!isGround(matMap[((y & NM) << NSHIFT) | (x & NM)])) continue
      const h = groundAt(x, y)
      let flat = true
      for (const [ox, oy] of [[12, 0], [-12, 0], [0, 12], [0, -12], [8, 8], [-8, -8]]) {
        if (Math.abs(groundAt(x + ox, y + oy) - h) > (relax ? 6 : 3)) flat = false
      }
      if (!flat) continue
      if (sites.some((s) => s.mount < 0 && Math.hypot(near(s.x, x) - x, near(s.y, y) - y) < 130)) continue
      return [x, y, h]
    }
    return null
  }
  /** open sea, deep enough for a ship */
  function seaSpot(dmin: number, dmax: number) {
    const lead = jets[0]
    for (let t = 0; t < 800; t++) {
      const a = Math.random() * Math.PI * 2
      const d = rand(dmin, dmax)
      const x = Math.round(lead.x + Math.sin(a) * d)
      const y = Math.round(lead.y - Math.cos(a) * d)
      let ok = true
      for (let k = 0; k < 12 && ok; k++) {
        const b = (k / 12) * Math.PI * 2
        for (const r of [0, 60, 110]) {
          const m = matMap[((Math.round(y + Math.cos(b) * r) & NM) << NSHIFT) | (Math.round(x + Math.sin(b) * r) & NM)]
          if (m > 1) { ok = false; break }
        }
      }
      if (ok) return [x, y]
    }
    return null
  }
  function addSite(kind: number, x: number, y: number, z: number, mount = -1) {
    const max = kind === 1 ? 140 : mount >= 0 ? 90 : 110
    sites.push({ x, y, z, kind, hp: max, max, dead: -1, cool: rand(1.5, 3.5), aim: Math.random() * 6.28, elev: 0.3, flash: 0, mount })
  }

  function clearBattle() {
    foes = []
    sites = []
    crates = []
    ship = null
    foeQueue = 0
    lockFoe = -1
    lockT = 0
    bullets.fill(0)
    missiles.fill(0)
    bombs.fill(0)
    shells.fill(0)
    samWarn = 99
  }

  function startWave(n: number) {
    wave = n
    phase = 'wave'
    foeSkill = Math.min(0.95, 0.25 + 0.08 * n)
    const boss = n % 5 === 0
    foes = []
    lockFoe = -1
    lockT = 0
    sites = sites.filter((s) => s.dead < 0 && s.mount < 0) // anything left standing stays (there is none)
    ship = null
    foeQueue = Math.min(8, 1 + n)
    if (boss) foeQueue = Math.max(1, foeQueue >> 1)
    foeTimer = 2
    const flak = boss ? 2 : Math.min(10, 1 + n)
    const sam = boss ? (n >= 10 ? 1 : 0) : n >= 3 ? Math.min(4, (n - 1) >> 1) : 0
    for (let i = 0; i < flak + sam; i++) {
      const spot = landSpot(380, 1250)
      if (spot) addSite(i < flak ? 0 : 1, spot[0], spot[1], spot[2])
    }
    if (boss) {
      const at = seaSpot(500, 1300) || seaSpot(300, 1900)
      if (at) {
        const hp = 600 + (n / 5 - 1) * 250
        ship = { x: at[0], y: at[1], yaw: Math.random() * 6.28, hp, max: hp, dead: -1, flash: 0, side: 1, wakeT: 0, boomT: 0 }
        const mounts = n >= 10 ? 6 : 4
        for (let i = 0; i < mounts; i++) addSite(i < 4 ? 0 : 1, ship.x, ship.y, DECK_Z, i)
      }
    }
    bombsLeft = Math.max(bombsLeft, BOMB_MAX)
    bombRegen = 0
    say('wave')
  }

  function startGame() {
    clearBattle()
    const lead = jets[0]
    lead.hp = 100
    playerDead = -1
    shield = 1.5
    hurt = 0
    score = 0
    kills = 0
    upSpeed = 0
    upArmor = 0
    upDamage = 0
    bombsLeft = BOMB_MAX
    missilesLeft = 2
    reload = 0
    introT = Math.max(introT, 2)
    startWave(1)
  }
  function endGame() {
    clearBattle()
    phase = 'demo'
    wave = 0
    const lead = jets[0]
    lead.hp = 100
    playerDead = -1
    shield = 0
    missilesLeft = MSL_MAX
  }
  function chooseUpgrade(k: Upgrade) {
    if (phase !== 'between') return
    if (k === 'speed') upSpeed = Math.min(80, upSpeed + UPGRADE_STEP.speed)
    else if (k === 'armor') upArmor += UPGRADE_STEP.armor
    else upDamage += UPGRADE_STEP.damage
    startWave(wave + 1)
  }

  function addScore(n: number) {
    if (playing()) score += n
  }
  function dropCrate(x: number, y: number, z: number, kind: number) {
    crates.push({ x, y, z, kind, age: 0 })
  }

  function damageSite(s: Site, dmg: number) {
    if (s.dead >= 0) return
    s.hp -= dmg
    s.flash = 1
    if (s.hp > 0) return
    s.dead = 0
    explode(s.x, s.y, s.z + 3, 0, 0, s.mount >= 0 ? 0.9 : 1.1)
    say('boom')
    addScore(s.kind === 1 ? 250 : 150)
    if (s.mount < 0 && Math.random() < 0.38) {
      const lead = jets[0]
      // what is short comes up more often
      const kind = lead.hp < 50 && Math.random() < 0.6 ? 0 : bombsLeft < 2 && Math.random() < 0.6 ? 1 : (Math.random() * 3) | 0
      dropCrate(s.x, s.y, s.z, kind)
    }
  }
  function damageShip(dmg: number) {
    if (!ship || ship.dead >= 0) return
    ship.hp -= dmg
    ship.flash = 1
    if (ship.hp > 0) return
    ship.dead = 0
    ship.boomT = 0
    for (const s of sites) if (s.mount >= 0 && s.dead < 0) { s.dead = 0; s.hp = 0 }
    explode(ship.x, ship.y, DECK_Z + 6, 0, 0, 2.6)
    say('boom-big')
    addScore(1500)
    dropCrate(ship.x, ship.y, 0, 0)
  }
  /** a bomb or a missile going off on the ground: everything close by is hurt */
  function blast(x: number, y: number, z: number, r: number, dmg: number) {
    for (const s of sites) {
      if (s.dead >= 0) continue
      const d = Math.hypot(s.x - x, s.y - y, (s.z - z) * 0.5)
      if (d < r) damageSite(s, dmg * (1 - (0.5 * d) / r))
    }
    if (ship && ship.dead < 0) {
      if (onShip(x, y)) damageShip(dmg)
      else if (onShip(x, y, r * 0.5)) damageShip(dmg * 0.4)
    }
  }

  function fireFlak(s: Site) {
    const lead = jets[0]
    const dist = Math.hypot(lead.x - s.x, lead.y - s.y, lead.z - s.z)
    const tgo = dist / FLAK_SPEED
    // closer is deadlier: the error grows with the distance
    const err = 9 + dist * 0.09 * (1.3 - foeSkill)
    const tx = lead.x + lead.vx * tgo + rand(-err, err)
    const ty = lead.y + lead.vy * tgo + rand(-err, err)
    const tz = lead.z + rand(-err, err) * 0.6
    const ox = s.x + Math.sin(s.aim) * 7 * GS
    const oy = s.y - Math.cos(s.aim) * 7 * GS
    const oz = s.z + 5 * GS
    const l = Math.hypot(tx - ox, ty - oy, tz - oz) || 1
    const o = shellHead * SHELL_F
    shells[o] = ox; shells[o + 1] = oy; shells[o + 2] = oz
    shells[o + 3] = ((tx - ox) / l) * FLAK_SPEED
    shells[o + 4] = ((ty - oy) / l) * FLAK_SPEED
    shells[o + 5] = ((tz - oz) / l) * FLAK_SPEED
    shells[o + 6] = l / FLAK_SPEED
    shellHead = (shellHead + 1) % SHELL_N
    emit(ox, oy, oz, 0, 0, 10, 0.18, 1.6, FX_FIRE)
    if (dist < 420) say('flak-fire')
  }
  function launchSam(s: Site) {
    const lead = jets[0]
    const o = mslHead * MSL_F
    const dx = lead.x - s.x
    const dy = lead.y - s.y
    const d = Math.hypot(dx, dy) || 1
    missiles[o] = s.x; missiles[o + 1] = s.y; missiles[o + 2] = s.z + 5 * GS
    missiles[o + 3] = (dx / d) * 40
    missiles[o + 4] = (dy / d) * 40
    missiles[o + 5] = 110
    missiles[o + 6] = 0
    missiles[o + 7] = 1
    missiles[o + 8] = -1
    missiles[o + 9] = 5.5
    missiles[o + 10] = 0
    missiles[o + 11] = 1
    mslHead = (mslHead + 1) % MSL_N
    say('sam')
  }

  /** where a bomb let go now would land */
  function bombImpact() {
    const lead = jets[0]
    const vx = lead.vx * 0.92
    const vy = lead.vy * 0.92
    const vz = -8
    const z0 = lead.z - 3
    let g = 0
    let t = 0
    for (let k = 0; k < 4; k++) {
      t = (vz + Math.sqrt(vz * vz + 2 * BOMB_G * Math.max(0, z0 - g))) / BOMB_G
      g = groundAt(lead.x + vx * t, lead.y + vy * t)
      if (ship && ship.dead < 0 && onShip(lead.x + vx * t, lead.y + vy * t)) g = DECK_Z
    }
    return [lead.x + vx * t, lead.y + vy * t, g]
  }

  function gameStep(dt: number) {
    const lead = jets[0]
    if (bombCool > 0) bombCool -= dt
    if (samWarn < 99) samWarn += dt
    // the player's bombs
    if (bombQueued) {
      bombQueued = false
      if (playing() && leadAlive() && bombsLeft > 0 && bombCool <= 0) {
        const o = bombHead * BOMB_F
        bombs[o] = lead.x; bombs[o + 1] = lead.y; bombs[o + 2] = lead.z - 3
        bombs[o + 3] = lead.vx * 0.92; bombs[o + 4] = lead.vy * 0.92; bombs[o + 5] = -8
        bombs[o + 6] = 1
        bombHead = (bombHead + 1) % BOMB_N
        bombsLeft--
        bombCool = 0.3
        say('bomb')
      }
    }
    const groundLeft = sites.some((s) => s.dead < 0) || (!!ship && ship.dead < 0)
    if (phase === 'wave' && bombsLeft === 0 && groundLeft) {
      bombRegen += dt
      if (bombRegen >= BOMB_REGEN) { bombRegen = 0; bombsLeft = 1 }
    } else bombRegen = 0
    for (let n = 0; n < BOMB_N; n++) {
      const o = n * BOMB_F
      if (!bombs[o + 6]) continue
      bombs[o + 5] -= BOMB_G * dt
      const x = (bombs[o] += bombs[o + 3] * dt)
      const y = (bombs[o + 1] += bombs[o + 4] * dt)
      const z = (bombs[o + 2] += bombs[o + 5] * dt)
      const deck = ship && ship.dead < 0 && z < DECK_Z + 1 && onShip(x, y)
      const g = groundAt(x, y)
      if (!deck && z > g) continue
      bombs[o + 6] = 0
      const water = !deck && g === 0 && matMap[((y & NM) << NSHIFT) | (x & NM)] <= 3
      blast(x, y, deck ? DECK_Z : g, BOMB_RADIUS, BOMB_DAMAGE * damageMul())
      if (water) {
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * 6.28
          emit(x, y, 1, Math.cos(a) * rand(6, 20), Math.sin(a) * rand(6, 20), rand(30, 70), rand(0.8, 1.4), rand(2, 4), FX_WHITE)
        }
        say('splash')
      } else {
        explode(x, y, (deck ? DECK_Z : g) + 1, 0, 0, 1)
        say('boom')
      }
    }
    // flak shells: they burst when their fuse runs out, close to where the player was going
    for (let n = 0; n < SHELL_N; n++) {
      const o = n * SHELL_F
      if (shells[o + 6] <= 0) continue
      shells[o] += shells[o + 3] * dt
      shells[o + 1] += shells[o + 4] * dt
      shells[o + 2] += shells[o + 5] * dt
      shells[o + 6] -= dt
      if (shells[o + 6] > 0) continue
      const x = shells[o]
      const y = shells[o + 1]
      const z = shells[o + 2]
      for (let i = 0; i < 4; i++) emit(x + rand(-3, 3), y + rand(-3, 3), z + rand(-2, 2), rand(-6, 6), rand(-6, 6), rand(-2, 4), rand(1.4, 2.2), rand(3, 5), FX_SMOKE)
      for (let i = 0; i < 3; i++) emit(x, y, z, rand(-20, 20), rand(-20, 20), rand(-10, 20), rand(0.15, 0.3), rand(2, 3.5), FX_FIRE)
      if (leadAlive()) {
        const d = Math.hypot(lead.x - x, lead.y - y, lead.z - z)
        if (d < FLAK_BURST) hitPlayer((3 + (1 - d / FLAK_BURST) * 11) * Math.min(1.3, 0.75 + 0.05 * wave), x, y, z)
        if (d < 200) say('flak')
      }
    }
    // the ship sails on, and turns away from land
    if (ship) {
      ship.x = near(ship.x, lead.x)
      ship.y = near(ship.y, lead.y)
      ship.flash = Math.max(0, ship.flash - dt * 6)
      if (ship.dead < 0) {
        const f = shipFrame(ship)
        let blocked = false
        for (const r of [60, 90, 120]) {
          for (const side of [-12, 0, 12]) {
            const m = matMap[((Math.round(ship.y + f.fy * r + f.ry * side) & NM) << NSHIFT) | (Math.round(ship.x + f.fx * r + f.rx * side) & NM)]
            if (m > 1) blocked = true
          }
        }
        if (blocked) ship.yaw += ship.side * 0.45 * dt
        else if (Math.random() < dt * 0.1) ship.side = -ship.side
        ship.x += f.fx * SHIP_SPEED * dt
        ship.y += f.fy * SHIP_SPEED * dt
        ship.wakeT -= dt
        if (ship.wakeT <= 0) {
          ship.wakeT = 0.07
          for (const side of [-1, 1]) {
            emit(ship.x - f.fx * SHIP_L * SS + f.rx * side * 10, ship.y - f.fy * SHIP_L * SS + f.ry * side * 10, 0.5, -f.fx * 8 + f.rx * side * 7, -f.fy * 8 + f.ry * side * 7, 0, rand(1.8, 3), rand(2.5, 4), FX_WHITE)
          }
        }
      } else {
        ship.dead += dt
        ship.boomT -= dt
        if (ship.dead < 2.2 && ship.boomT <= 0) {
          ship.boomT = rand(0.18, 0.35)
          const f = shipFrame(ship)
          const a = rand(-SHIP_L, SHIP_L) * SS
          explode(ship.x + f.fx * a, ship.y + f.fy * a, DECK_Z + 3, 0, 0, 1.1)
          say('boom')
        }
        if (ship.dead > 9) ship = null
      }
    }
    // the guns on the ground
    for (const s of sites) {
      if (s.mount >= 0 && ship) {
        const f = shipFrame(ship)
        const [ac, ah] = SHIP_MOUNTS[s.mount]
        s.x = ship.x + (f.rx * ac + f.fx * ah) * SS
        s.y = ship.y + (f.ry * ac + f.fy * ah) * SS
        s.z = DECK_Z - (ship.dead >= 0 ? ship.dead * 1.6 * SS : 0)
      } else {
        s.x = near(s.x, lead.x)
        s.y = near(s.y, lead.y)
      }
      s.flash = Math.max(0, s.flash - dt * 6)
      if (s.dead >= 0) {
        s.dead += dt
        // a wreck smokes for a while
        if (s.dead < 9 && Math.random() < dt * 9) emit(s.x + rand(-2, 2), s.y + rand(-2, 2), s.z + 2, rand(-3, 3), rand(-3, 3), rand(10, 18), rand(1.8, 2.8), rand(2, 3.5), FX_SMOKE)
        continue
      }
      const dx = lead.x - s.x
      const dy = lead.y - s.y
      const dz = lead.z - s.z
      const d2 = Math.hypot(dx, dy)
      const dist = Math.hypot(d2, dz)
      const tracking = leadAlive() && dist < SAM_RANGE * 1.3
      const goal = tracking ? Math.atan2(dx, -dy) : s.aim + 0.3
      s.aim += clamp(wrapAngle(goal - s.aim), -2.2 * dt, 2.2 * dt)
      s.elev += ((tracking ? Math.atan2(dz, Math.max(1, d2)) : 0.35) - s.elev) * (1 - Math.exp(-dt * 3))
      if (phase !== 'wave' || !leadAlive() || shield > 0) continue
      s.cool -= dt
      if (s.cool > 0) continue
      if (s.kind === 0 && dist < FLAK_RANGE) {
        fireFlak(s)
        s.cool = Math.max(0.9, 2.5 - 0.12 * wave) * rand(0.75, 1.25)
      } else if (s.kind === 1 && dist < SAM_RANGE) {
        launchSam(s)
        s.cool = Math.max(4, 8.5 - 0.3 * wave) * rand(0.85, 1.2)
      }
    }
    // crates: fly over one to pick it up
    for (let i = crates.length - 1; i >= 0; i--) {
      const c = crates[i]
      c.x = near(c.x, lead.x)
      c.y = near(c.y, lead.y)
      c.age += dt
      if (c.age > CRATE_LIFE) { crates.splice(i, 1); continue }
      if (leadAlive() && Math.hypot(lead.x - c.x, lead.y - c.y) < 26) {
        if (c.kind === 0) lead.hp = Math.min(100, lead.hp + 35)
        else if (c.kind === 1) bombsLeft = Math.min(BOMB_MAX + 3, bombsLeft + 3)
        else missilesLeft = Math.min(MSL_MAX, missilesLeft + 2)
        addScore(50)
        say(c.kind === 0 ? 'pick-repair' : c.kind === 1 ? 'pick-bombs' : 'pick-missiles')
        crates.splice(i, 1)
      }
    }
    // enemy jets join the fight a few at a time
    if (phase === 'wave' && foeQueue > 0) {
      foeTimer -= dt
      const flying = foes.filter((f) => f.dead < 0).length
      if (foeTimer <= 0 && flying < 3 + (wave >> 1)) {
        const f = makeJet(0, 0, p.altitude, 0, true)
        placeFoe(f)
        foes.push(f)
        foeQueue--
        foeTimer = rand(1.5, 3)
      }
    }
    // the wave is over when everything is down
    if (phase === 'wave' && leadAlive() && foeQueue === 0 && foes.every((f) => f.dead >= 0) && !groundLeft) {
      phase = 'between'
      addScore(300 * wave)
      lead.hp = Math.min(100, lead.hp + 35)
      say('clear')
    }
    // shot down: the game is over
    if (playing() && playerDead > 2.4) {
      phase = 'over'
      say('over')
    }
  }

  // ── the game, drawn

  const SAND_A = pack(205, 182, 128)
  const SAND_B = pack(170, 148, 98)
  const CONCRETE = pack(146, 146, 138)
  const OLIVE = pack(92, 108, 62)
  const OLIVE_DARK = pack(66, 80, 44)
  const GUN_BODY = pack(116, 122, 132)
  const GUN_TOP = pack(78, 84, 94)
  const GUN_RED = pack(224, 60, 44)
  const STEEL = pack(44, 48, 56)
  const RAIL = pack(232, 235, 239)
  const TIP = pack(214, 58, 42)
  const CRATER = pack(58, 52, 45)
  const WRECK = pack(36, 34, 33)
  const HULL = pack(96, 106, 116)
  const HULL_DARK = pack(70, 78, 88)
  const DECK = pack(150, 158, 166)
  const DECK_LINE = pack(186, 192, 198)
  const BRIDGE = pack(176, 182, 188)
  const WINDOW = pack(30, 46, 64)
  const FUNNEL = pack(46, 50, 58)
  const WHITE = pack(255, 255, 255)
  const CROSS = pack(255, 226, 64)
  const CROSS_DARK = pack(60, 40, 0)
  const SHELL_COL = pack(40, 36, 32)
  const BOMB_COL = pack(52, 58, 52)
  const CRATE_COL = [pack(64, 190, 92), pack(242, 194, 48), pack(126, 200, 255)]
  const CRATE_MARK = pack(255, 255, 255)
  const SITE_MARK = pack(255, 176, 32)
  const CRATE_ARROW = pack(96, 230, 120)

  // the ship's hull, decks and bridge as little blocks: across, ahead, height, colour
  const shipVox: number[] = []
  {
    const add = (c: number, a: number, h: number, col: number) => shipVox.push(c, a, h, col)
    for (let a = -SHIP_L; a <= SHIP_L; a++) {
      const w = hullHalfWidth(a)
      for (let c = -Math.floor(w); c <= Math.floor(w); c++) {
        const edge = Math.abs(c) >= Math.floor(w) - 0.5 || a === SHIP_L || a === -SHIP_L
        if (edge) for (let h = 0; h < SHIP_DECK; h++) add(c, a, h, h < 2 ? HULL_DARK : HULL)
        add(c, a, SHIP_DECK, edge ? HULL : a % 9 === 0 || c === 0 ? DECK_LINE : DECK)
      }
    }
    // the bridge, then the funnel
    for (let h = SHIP_DECK + 1; h <= SHIP_DECK + 8; h++) {
      for (let a = -16; a <= 4; a++) {
        for (let c = -5; c <= 5; c++) {
          const edge = Math.abs(c) === 5 || a === -16 || a === 4
          if (!edge && h !== SHIP_DECK + 8) continue
          add(c, a, h, h === SHIP_DECK + 6 && (a === 4 || Math.abs(c) === 5) && (a + c) % 2 === 0 ? WINDOW : BRIDGE)
        }
      }
    }
    for (let h = SHIP_DECK + 9; h <= SHIP_DECK + 13; h++) {
      for (let a = -10; a <= -5; a++) for (let c = -2; c <= 2; c++) if (Math.abs(c) === 2 || a === -10 || a === -5 || h === SHIP_DECK + 13) add(c, a, h, FUNNEL)
    }
    // lowest blocks first, so the higher ones are drawn over them
    const order = Array.from({ length: shipVox.length / 4 }, (_, i) => i).sort((a, b) => shipVox[a * 4 + 2] - shipVox[b * 4 + 2])
    const sorted = order.flatMap((i) => shipVox.slice(i * 4, i * 4 + 4))
    shipVox.length = 0
    shipVox.push(...sorted)
  }

  /** one block of a model, at a world point */
  function vox(x: number, y: number, z: number, col: number, size = GS) {
    if (!project(x, y, z)) return
    const t = Math.max(1, Math.ceil(prM * size))
    line(prX - (t >> 1), prY - (t >> 1), prX - (t >> 1), prY - (t >> 1), prV, col, t)
  }

  function drawSite(s: Site) {
    const dead = s.dead >= 0
    const fl = s.flash > 0.4
    if (s.mount < 0) {
      // the emplacement: a ring of sandbags round a concrete floor
      for (let c = -6; c <= 6; c++) {
        for (let a = -6; a <= 6; a++) {
          const r = Math.hypot(c, a)
          if (r > 6.2) continue
          if (dead) { if (r < 5 || hash8((c + 9) * 31 + a + 9) < 90) vox(s.x + c * GS, s.y + a * GS, s.z, r < 3.5 ? WRECK : CRATER); continue }
          if (r > 4.6) {
            const col = hash8((c + 9) * 17 + a * 3 + 40) < 110 ? SAND_B : SAND_A
            vox(s.x + c * GS, s.y + a * GS, s.z, col)
            vox(s.x + c * GS, s.y + a * GS, s.z + GS, col)
          } else vox(s.x + c * GS, s.y + a * GS, s.z, CONCRETE)
        }
      }
    }
    if (dead) return
    const cs = Math.cos(s.aim)
    const sn = Math.sin(s.aim)
    const z = s.z + (s.mount >= 0 ? 0 : GS)
    if (s.kind === 0) {
      // the gun: a turret and two barrels pointing at the player
      for (let h = 0; h < 3; h++) {
        const r = h === 2 ? 1 : 2
        for (let c = -r; c <= r; c++) for (let a = -r; a <= r; a++) vox(s.x + (c * cs - a * sn) * GS, s.y + (c * sn + a * cs) * GS, z + h * GS, fl ? WHITE : h === 2 ? (c === 0 && a === 0 && ((time * 3) | 0) & 1 ? GUN_RED : GUN_TOP) : a === -r ? GUN_RED : GUN_BODY)
      }
      const ce = Math.cos(s.elev)
      const se = Math.sin(s.elev)
      for (const side of [-1, 1]) {
        for (let k = 1; k <= 7; k++) {
          const along = k * ce
          vox(s.x + (side * 0.9 * cs + sn * along) * GS, s.y + (side * 0.9 * sn - cs * along) * GS, z + (2.5 + k * se) * GS, fl ? WHITE : STEEL)
        }
      }
    } else {
      // the missile launcher: a truck with two rails on top
      for (let h = 0; h < 2; h++) {
        for (let c = -3; c <= 3; c++) for (let a = -6; a <= 6; a++) vox(s.x + (c * cs - a * sn) * GS, s.y + (c * sn + a * cs) * GS, z + h * GS, fl ? WHITE : a < -4 ? OLIVE_DARK : OLIVE)
      }
      const ce = Math.cos(Math.max(0.35, s.elev))
      const se = Math.sin(Math.max(0.35, s.elev))
      for (const side of [-1.3, 1.3]) {
        for (let k = -2; k <= 8; k++) {
          const along = k * ce
          vox(s.x + (side * cs + sn * along) * GS, s.y + (side * sn - cs * along) * GS, z + (2.5 + Math.max(0, k) * se) * GS, fl ? WHITE : k >= 7 ? TIP : RAIL)
        }
      }
    }
  }

  function drawShip() {
    if (!ship) return
    const f = shipFrame(ship)
    const sink = ship.dead >= 0 ? ship.dead * 1.6 : 0 // in blocks
    const fl = ship.flash > 0.4
    for (let i = 0; i < shipVox.length; i += 4) {
      const z = shipVox[i + 2] - sink
      if (z < 0) continue
      const c = shipVox[i]
      const a = shipVox[i + 1]
      vox(ship.x + (f.rx * c + f.fx * a) * SS, ship.y + (f.ry * c + f.fy * a) * SS, z * SS, fl ? WHITE : ship.dead >= 0 && hash8(i) < 120 ? WRECK : shipVox[i + 3], SS * 1.35)
    }
  }

  function drawCrate(c: Crate) {
    if (c.age > CRATE_LIFE - 5 && ((time * 8) | 0) & 1) return
    const bob = 2 + Math.sin(time * 3 + c.x) * 1
    for (let h = 0; h < 4; h++) {
      for (let a = -2; a <= 2; a++) {
        for (let b = -2; b <= 2; b++) {
          const mark = h === 3 && (a === 0 || b === 0)
          vox(c.x + a * GS, c.y + b * GS, c.z + (bob + h) * GS, mark ? CRATE_MARK : CRATE_COL[c.kind])
        }
      }
    }
  }

  /** the ground targets and crates, drawn far to near before the jets */
  function drawGameWorld() {
    if (phase === 'demo') return
    const items: { d: number; draw: () => void }[] = []
    const depth = (x: number, y: number) => (x - cam.x) * vSin + (y - cam.y) * vCos
    if (ship) { const sh = ship; items.push({ d: depth(sh.x, sh.y), draw: drawShip }) }
    for (const s of sites) items.push({ d: depth(s.x, s.y) + (s.mount >= 0 ? 1 : 0), draw: () => drawSite(s) })
    for (const c of crates) items.push({ d: depth(c.x, c.y), draw: () => drawCrate(c) })
    items.sort((a, b) => a.d - b.d)
    for (const it of items) it.draw()
  }

  /** bombs, flak shells and the cross where a bomb would land */
  function drawGameShots() {
    if (phase === 'demo') return
    for (let n = 0; n < BOMB_N; n++) {
      const o = n * BOMB_F
      if (!bombs[o + 6]) continue
      if (!project(bombs[o], bombs[o + 1], bombs[o + 2])) continue
      const t = Math.max(1, Math.round(prM * 1.6))
      line(prX - (t >> 1), prY - (t >> 1), prX - (t >> 1), prY - (t >> 1), prV, BOMB_COL, t)
    }
    for (let n = 0; n < SHELL_N; n++) {
      const o = n * SHELL_F
      if (shells[o + 6] <= 0) continue
      if (!project(shells[o], shells[o + 1], shells[o + 2])) continue
      line(prX, prY, prX, prY, prV, SHELL_COL, prM > 2.2 ? 2 : 1)
    }
    if (playing() && leadAlive() && bombsLeft > 0 && jetFade > 0.5) {
      const [x, y, z] = bombImpact()
      if (project(x, y, z + 0.5)) {
        const r = Math.max(3, Math.round(3.5 * prM))
        const cx = Math.round(prX)
        const cy = Math.round(prY)
        const col = ((time * 4) | 0) & 1 ? CROSS : WHITE
        line(cx - r, cy + 1, cx + r, cy + 1, -1e9, CROSS_DARK, 1)
        line(cx + 1, cy - r, cx + 1, cy + r, -1e9, CROSS_DARK, 1)
        line(cx - r, cy, cx + r, cy, -1e9, col, 1)
        line(cx, cy - r, cx, cy + r, -1e9, col, 1)
      }
    }
  }

  /** arrows at the edge of the frame towards a world point out of it */
  function edgeArrow(x: number, y: number, z: number, col: number, size: number) {
    const cx = W >> 1
    const cy = H >> 1
    let ux: number
    let uy: number
    if (project(x, y, z)) {
      if (prX >= 2 && prY >= 2 && prX < W - 2 && prY < H - 2) return
      ux = prX - cx
      uy = prY - cy
    } else {
      const dx = x - cam.x
      const dy = y - cam.y
      ux = dx * vCos - dy * vSin
      uy = Math.abs(dx * vSin + dy * vCos) + 1
    }
    const l = Math.hypot(ux, uy) || 1
    ux /= l
    uy /= l
    const m = 7
    const t = Math.min(ux !== 0 ? (cx - m) / Math.abs(ux) : 1e9, uy !== 0 ? (cy - m) / Math.abs(uy) : 1e9)
    const ax = cx + ux * t
    const ay = cy + uy * t
    for (let k = 0; k < size; k++) {
      const bx = ax - ux * k
      const by = ay - uy * k
      line(bx - uy * k * 0.7, by + ux * k * 0.7, bx + uy * k * 0.7, by - ux * k * 0.7, -1e9, col, 1)
    }
  }
  function drawGameMarkers() {
    if (!playing()) return
    for (const s of sites) if (s.dead < 0 && s.mount < 0) edgeArrow(s.x, s.y, s.z, SITE_MARK, 5)
    if (ship && ship.dead < 0) edgeArrow(ship.x, ship.y, DECK_Z, SITE_MARK, 6)
    for (const c of crates) edgeArrow(c.x, c.y, c.z, CRATE_ARROW, 4)
  }

  rebuildPalettes()
  buildWorld()
  resetFlight()
  syncWingmen()

  function setParams(next: SceneParams) {
    const prev = p
    p = { ...next }
    if (prev.seed !== p.seed) { worldDirty = 0.2; reseat = true }
    if (prev.land !== p.land) worldDirty = 0.2
    if (
      prev.timeOfDay !== p.timeOfDay || prev.bodyColor !== p.bodyColor ||
      prev.accentColor !== p.accentColor || prev.canopyColor !== p.canopyColor ||
      prev.enemyColor !== p.enemyColor || prev.enemyAccentColor !== p.enemyAccentColor ||
      prev.enemyCanopyColor !== p.enemyCanopyColor
    ) rebuildPalettes()
    if (prev.intro !== p.intro && p.intro) { introT = 0; burn = 0 }
    if (prev.view !== p.view) viewTarget = viewIndex(p.view)
    syncWingmen()
  }

  function resize(w: number, h: number) {
    W = Math.max(8, w | 0)
    H = Math.max(8, h | 0)
    const buf = new ArrayBuffer(W * H * 4)
    fb = new Uint32Array(buf)
    bytes = new Uint8ClampedArray(buf)
    jetMask = new Uint8Array(W * H)
    colY = new Int32Array(W)
    zbuf = new Float32Array(W * H)
    // the square sheet reaches every corner of the frame however far the view is rolled
    pivotY = Math.round(H * 0.34)
    cockpit = null
    cockpitDue = 0.3
    const tall = Math.max(pivotY, H - pivotY)
    sheetSide = (Math.ceil(Math.sqrt((W / 2) * (W / 2) + tall * tall)) + 2) * 2
    sheet = new Uint32Array(sheetSide * sheetSide)
    sheetMask = new Uint8Array(sheetSide * sheetSide)
    sheetColY = new Int32Array(sheetSide)
    sheetZ = new Float32Array(sheetSide * sheetSide)
    backdrop = new Uint32Array(W * H)
    sheetBackdrop = new Uint32Array(sheetSide * sheetSide)
    updateView()
  }

  function pointerMove(x: number, y: number) {
    keyMode = false
    pointerOn = true
    pointerX = x
    pointerY = y
    pointerIdle = 0
  }
  function pointerLeave() {
    pointerOn = false
    holding = false
  }
  function press() {
    holding = true
    holdT = 0
  }
  function release() {
    if (holding && holdT < HOLD) startRoll() // a click rolls; a hold was the thrusters
    holding = false
  }
  /** arrow keys / WASD: turn −1..1, climb −1..1 (chase view), and whether the boost key is down */
  function setKeys(turn: number, climb: number, boostHeld: boolean) {
    keyTurn = clamp(turn, -1, 1)
    keyClimb = clamp(climb, -1, 1)
    boostKey = boostHeld
    if (keyTurn !== 0 || keyClimb !== 0) keyMode = true
  }
  function startRoll() {
    const lead = jets[0]
    if (lead.stunt >= 0) return
    const dir = lead.yawRate >= 0 ? 1 : -1
    camSpin = vK > 0.5 ? 1 : 0
    jets.forEach((j, i) => {
      j.stunt = 0
      j.stuntDir = dir
      j.stuntDelay = i * 0.16
    })
  }
  /** on to the next view: overhead → behind the jet → cockpit → overhead */
  function toggleView() {
    viewTarget = (viewTarget + 1) % 3
  }
  function replayIntro() {
    introT = 0
    burn = 0
  }

  // ── simulation
  function step(dtRaw: number) {
    const dt = clamp(dtRaw, 0, 0.05)
    time += dt
    introT += dt
    pointerIdle += dt
    if (holding) holdT += dt
    if (worldDirty > 0) {
      worldDirty -= dt
      if (worldDirty <= 0) {
        buildWorld()
        if (reseat) {
          const dx = spawnX - jets[0].x
          const dy = spawnY - jets[0].y
          for (const j of jets) { j.x += dx; j.y += dy; j.trailLen = 0; j.lastTrailX = j.x; j.lastTrailY = j.y }
          follow.x += dx
          follow.y += dy
          reseat = false
        }
      }
    }
    if (!cockpit && W > 0) {
      cockpitDue -= dt
      if (cockpitDue <= 0) cockpitArt()
    }
    const introDone = introT > 1.9
    burn += ((introDone ? 1 : 0) - burn) * (1 - Math.exp(-dt * 5))

    // holding down opens the thrusters: longer flames, more speed
    const pushing = introDone && ((holding && holdT >= HOLD) || boostKey)
    boost += ((pushing ? 1 : 0) - boost) * (1 - Math.exp(-dt * (pushing ? 5 : 2.4)))
    if (boost < 0.0005 && !pushing) boost = 0
    const speed = p.speed * speedMul() * (1 + (clamp(p.boost, 1, 4) - 1) * boost)
    speedNow = speed
    spreadNow += (p.spread - spreadNow) * (1 - Math.exp(-dt * 11))

    const lead = jets[0]
    const maxRate = Math.max(0.1, p.agility)
    // how low and how high it may fly: it skims whatever ground lies ahead, with a little
    // room to spare, so it can get close but never hit anything; the ceiling is a setting
    const clearance = clamp(p.clearance, 2, 60)
    const floorNow = groundAhead(lead, speed) + clearance
    if (floorS === 0) floorS = floorNow
    floorS += (floorNow - floorS) * (1 - Math.exp(-dt * (floorNow > floorS ? 9 : 3)))
    const altLo = floorS
    const altHi = Math.max(altLo, p.altitude, clamp(p.ceiling, 20, 900))
    const climbMax = speed * 0.55
    const chase = vC + vK > 0.5 // flying from behind or from the seat

    // where to turn and, from behind, how high to fly
    let want = 0
    let flown = false // true while the player is choosing the height
    const steering = p.followPointer && pointerOn && pointerIdle < 5
    if (!introDone) {
      want = 0
    } else if (keyMode) {
      want = keyTurn * maxRate
      altGoal += keyClimb * climbMax * dt
      flown = true
    } else if (steering && (chase || project(lead.x, lead.y, lead.z))) {
      const vx = pointerX - prX
      const vy = pointerY - prY
      if (chase) {
        // from behind: point left or right of the jet to turn, above or below it to climb or dive
        const t = clamp((pointerX - vCx) / (W * 0.26), -1, 1)
        if (Math.abs(t) > 0.06) want = t * maxRate
        const raw = pointerY < vSteerY ? (vSteerY - pointerY) / Math.max(1, vSteerY) : -(pointerY - vSteerY) / Math.max(1, H - vSteerY)
        const up = Math.sign(raw) * Math.max(0, Math.abs(raw) - 0.08) / 0.92
        altGoal = up >= 0 ? p.altitude + up * (altHi - p.altitude) : p.altitude + up * (p.altitude - altLo)
        flown = true
      } else {
        flown = true // overhead: keep the height it was flown to
        if (vx * vx + vy * vy > 18 * 18) {
        const fx = vx * vCos + vy * vSin
        const fy = -vx * vSin + vy * vCos
          const err = wrapAngle(Math.atan2(fx, -fy) - lead.yaw)
          want = clamp(err * 2.6, -maxRate, maxRate)
        }
      }
    } else {
      want = maxRate * (0.62 * Math.sin(time * 0.31 + 1.3) + 0.38 * Math.sin(time * 0.73 + 0.4) + 0.22 * Math.sin(time * 0.17))
      want = clamp(want, -maxRate, maxRate)
      if (p.stunts) {
        autoStunt -= dt
        if (autoStunt <= 0) { startRoll(); autoStunt = 9 + (hash8((time * 10) | 0) / 255) * 7 }
      }
    }
    lead.yawRate += (want - lead.yawRate) * (1 - Math.exp(-dt * 2.6))
    lead.yaw += lead.yawRate * dt
    const bankMax = (p.bank * Math.PI) / 180
    const rollTarget = clamp(lead.yawRate / maxRate, -1, 1) * bankMax
    lead.roll += (rollTarget - lead.roll) * (1 - Math.exp(-dt * 5))
    lead.vx = Math.sin(lead.yaw) * speed
    lead.vy = -Math.cos(lead.yaw) * speed
    lead.x += lead.vx * dt
    lead.y += lead.vy * dt
    // height: left alone it drifts back to cruising; it climbs and dives at a limited rate
    if (!flown) altGoal += (p.altitude - altGoal) * (1 - Math.exp(-dt * 0.9))
    altGoal = clamp(altGoal, altLo, altHi)
    let dz = (altGoal + Math.sin(time * 0.9) * 1.5 - lead.z) * (1 - Math.exp(-dt * 3))
    dz = clamp(dz, -climbMax * dt, climbMax * dt)
    lead.z += dz
    // last resort: never closer to what is right underneath than most of the clearance
    const hard = groundAt(lead.x, lead.y) + clearance * 0.7
    if (lead.z < hard) lead.z += (hard - lead.z) * (1 - Math.exp(-dt * 22))
    climbV += (dz / Math.max(dt, 1e-4) - climbV) * (1 - Math.exp(-dt * 6))
    // nose up in a climb, down in a dive (the gentle cruise bob does not count)
    const climbing = Math.sign(climbV) * Math.max(0, Math.abs(climbV) - 3)
    climbTilt = clamp((climbing / Math.max(20, speed)) * 1.25, -0.5, 0.5)
    const pitchTarget = Math.abs(lead.yawRate / maxRate) * 0.1 + climbTilt
    lead.pitch += (pitchTarget - lead.pitch) * (1 - Math.exp(-dt * 4))
    // the pilot's head: it leans into a turn, sinks in a climb and under thrust, lifts in a
    // dive, and is never quite still. On a soft spring, so it overshoots a little and settles.
    const hxGoal = clamp(lead.yawRate / maxRate, -1, 1) * 6.4 + Math.sin(time * 0.53) * 0.3
    const hyGoal = clamp(climbTilt / 0.5, -1, 1) * 3.4 + boost * 1.6 + Math.sin(time * 0.71 + 1) * 0.25
    headVX += ((hxGoal - headX) * 64 - headVX * 11) * dt
    headVY += ((hyGoal - headY) * 64 - headVY * 11) * dt
    headX = clamp(headX + headVX * dt, -8, 8)
    headY = clamp(headY + headVY * dt, -5, 5)

    // wingmen hold formation
    for (let i = 1; i < jets.length; i++) {
      const j = jets[i]
      const side = i === 1 ? -1 : 1
      const tx = lead.x + Math.cos(lead.yaw) * side * formX() - Math.sin(lead.yaw) * formY()
      const ty = lead.y + Math.sin(lead.yaw) * side * formX() + Math.cos(lead.yaw) * formY()
      const k = 1 - Math.exp(-dt * 3.2)
      const ox = j.x
      const oy = j.y
      j.x += lead.vx * dt + (tx - (j.x + lead.vx * dt)) * k
      j.y += lead.vy * dt + (ty - (j.y + lead.vy * dt)) * k
      j.vx = (j.x - ox) / Math.max(dt, 1e-4)
      j.vy = (j.y - oy) / Math.max(dt, 1e-4)
      j.yaw += wrapAngle(lead.yaw - j.yaw) * (1 - Math.exp(-dt * 4))
      j.roll += (lead.roll - j.roll) * (1 - Math.exp(-dt * 3.2))
      j.pitch = lead.pitch
      j.z += (lead.z + Math.sin(time * 1.1 + i * 2) * 1.2 - j.z) * (1 - Math.exp(-dt * 3))
      j.z = Math.max(j.z, groundAt(j.x, j.y) + clearance * 0.7)
    }

    for (const j of jets) {
      const gNow = clamp(Math.abs(lead.yawRate) / maxRate + (j.stunt >= 0 ? 0.7 : 0) + boost * 0.9 + Math.abs(climbTilt), 0, 1)
      j.g += (gNow - j.g) * (1 - Math.exp(-dt * 2.5))
      if (j.stunt >= 0) {
        if (j.stuntDelay > 0) j.stuntDelay -= dt
        else {
          j.stunt += dt / 0.85
          if (j.stunt >= 1) j.stunt = -1
        }
      }
      trailStep(j) // wingtip trails
    }
    combatStep(dt, introDone, clearance)

    // a little dark smoke off the end of each flame, left hanging in the air behind the jet
    smokeClock += dt
    const every = 0.034 - 0.012 * boost
    if (smokeClock >= every && burn > 0.6 && p.afterburner > 0.05 && spreadNow < 2) {
      smokeClock = 0
      const len = flameLength()
      const sc = jetSize()
      for (let i = 0; i < jets.length; i++) {
        if (i === 0 && playerDead >= 0) continue
        const j = jets[i]
        const ax = axes(j)
        const side = (smokeHead + i) & 1 ? 1 : -1
        const t = len * 0.78
        const a = (side * ENGINE_A + flameBend() * ((t * t) / Math.max(1, len))) * sc
        const b = (PIV_K - NOZZLE_K - t) * sc
        const hy = (ENGINE_Y - PIV_Y) * sc
        const o = smokeHead * SMOKE_F
        smoke[o] = j.x + a * ax.rx + b * ax.fx + hy * ax.ux
        smoke[o + 1] = j.y + a * ax.ry + b * ax.fy + hy * ax.uy
        smoke[o + 2] = j.z + a * ax.rz + b * ax.fz + hy * ax.uz
        smoke[o + 3] = time
        smoke[o + 4] = (1.3 + (hash8(smokeHead * 31 + 7) / 255) * 1.2) * sc
        smoke[o + 5] = -lead.vx * 0.3 + (hash8(smokeHead * 17 + 3) - 128) * 0.05
        smoke[o + 6] = -lead.vy * 0.3 + (hash8(smokeHead * 13 + 5) - 128) * 0.05
        smoke[o + 7] = (0.46 + 0.36 * boost) * clamp(p.afterburner * 1.4, 0, 1)
        smoke[o + 8] = 0.75 + 0.5 * boost + (hash8(smokeHead * 5) / 255) * 0.3
        smokeHead = (smokeHead + 1) % SMOKE_N
      }
    }

    // the view weights glide to their goals (three soft stages each)
    const goC = viewTarget === 1 ? 1 : 0
    const goK = viewTarget === 2 ? 1 : 0
    const ease = 1 - Math.exp((-dt * 7.6) / clamp(p.transition, 0.2, 8))
    let settled = true
    for (let i = 0; i < 3; i++) {
      wChase[i] += ((i === 0 ? goC : wChase[i - 1]) - wChase[i]) * ease
      wCock[i] += ((i === 0 ? goK : wCock[i - 1]) - wCock[i]) * ease
      if (Math.abs(wChase[i] - goC) > 0.0004 || Math.abs(wCock[i] - goK) > 0.0004) settled = false
    }
    if (settled) {
      wChase.fill(goC)
      wCock.fill(goK)
    }
    vC = wChase[2]
    vK = wCock[2]

    // camera: ahead of the leader, turning part of the way with it
    const look = (22 + 16 * boost) * (1 - vC - vK)
    const tx = lead.x + Math.sin(lead.yaw) * look
    const ty = lead.y - Math.cos(lead.yaw) * look
    const kc = 1 - Math.exp(-dt * 3.5)
    follow.x += lead.vx * dt + (tx - (follow.x + lead.vx * dt)) * kc
    follow.y += lead.vy * dt + (ty - (follow.y + lead.vy * dt)) * kc
    cam.yaw += (-lead.yaw * clamp(p.cameraFollow, 0, 1) - cam.yaw) * (1 - Math.exp(-dt * 1.6))
    follow.alt += (lead.z - follow.alt) * (1 - Math.exp(-dt * 3))
    // the chase camera keeps clear of the hills behind the jet, and stays out of the cloud
    // layer: under it while the jet is low, over it otherwise
    let fix = 0
    camFloor = 0
    if (vC > 0.3 && vQ > 1e-4) {
      const back = 1 / vQ
      const gx = cam.x + vSin * back
      const gy = cam.y + vCos * back
      let top = 0
      for (let iy = -1; iy <= 1; iy++) for (let ix = -1; ix <= 1; ix++) top = Math.max(top, groundAt(gx + ix * 9, gy + iy * 9))
      camFloor = top + 5
      const nominal = follow.alt + vLean * back
      let want = Math.max(nominal, camFloor)
      if (want > CLOUD_ALT - 3 && want < ZTOP + 3) want = lead.z < CLOUD_ALT - 8 ? Math.max(camFloor, CLOUD_ALT - 3) : ZTOP + 3
      fix = want - nominal
    }
    camFix += (fix - camFix) * (1 - Math.exp(-dt * 7))
    // the chase camera sits behind the jet and swings round a beat late in turns
    chaseYaw += (-lead.yaw - chaseYaw) * (1 - Math.exp(-dt * 3.4))
    const raw = chaseYaw - cam.yaw
    if (vC === 0 && vK === 0) yawDiff = wrapAngle(raw)
    else yawDiff += wrapAngle(raw - yawDiff)
    updateView()
  }

  // the jet's own axes in the world (x right, y down the map, z up)
  function axes(j: Jet) {
    const cs = Math.cos(j.yaw)
    const sn = Math.sin(j.yaw)
    const roll = rollOf(j)
    const cr = Math.cos(roll)
    const sr = Math.sin(roll)
    // right wing dips for a positive roll
    const rx = cs * cr
    const ry = sn * cr
    const rz = -sr
    const u2x = cs * sr
    const u2y = sn * sr
    const u2z = cr
    const cp = Math.cos(j.pitch)
    const sp = Math.sin(j.pitch)
    const fx = sn * cp + u2x * sp
    const fy = -cs * cp + u2y * sp
    const fz = u2z * sp
    const ux = u2x * cp - sn * sp
    const uy = u2y * cp + cs * sp
    const uz = u2z * cp
    return { rx, ry, rz, fx, fy, fz, ux, uy, uz, cr }
  }

  // ── drawing
  //
  // One camera covers both views. A world point lands on screen at
  //   scale = S / (1 + q·depth)     x = Cx + scale·across     y = Cy − scale·(height + slope·depth)
  // With q = 0 this is the flat sprite-stack view: every layer is drawn one pixel above the last.
  // Raising q brings the camera in behind the jet: far things shrink and a horizon appears.
  // Switching views only slides q, the slope, the scale and the heading, so there is no cut.
  const sjx = new Float64Array(3)
  const sjy = new Float64Array(3)
  const srx = new Float64Array(3)
  const sry = new Float64Array(3)
  const sfx = new Float64Array(3)
  const sfy = new Float64Array(3)
  const sic = new Float64Array(3)
  const rowNow = new Int32Array(64) // screen row of every height at this depth step
  const rowPrev = new Int32Array(64) // … and at the step before
  const offX = new Float32Array(64)
  const offY = new Float32Array(64)
  const sliceOrder = new Int32Array(JET_H)
  const sliceKey = new Float64Array(JET_H)
  let prX = 0
  let prY = 0
  let prM = 0
  let prV = 0

  /** world point → screen (prX, prY) and its scale (prM); false when it is behind the camera */
  function project(x: number, y: number, z: number) {
    const dx = x - cam.x
    const dy = y - cam.y
    const depth = -(dx * vSin + dy * vCos)
    const den = 1 + vQ * depth
    if (den < 0.12) return false
    prV = depth
    prM = vS / den
    prX = vCx + prM * (dx * vCos - dy * vSin)
    prY = vCy - prM * (z - cam.alt + vTan * depth)
    return true
  }

  // The islands and clouds, drawn from the nearest ground to the farthest. Every ground pixel
  // is a column of stacked layers: its top is drawn where the column ends and its wall where it
  // starts, and a pixel that is already taken stays taken (nearer things win).
  function drawWorld() {
    const _fb = fb
    const _zb = zbuf
    if (rowLo === 0 && rowHi === H && colLo === 0 && colHi === W) {
      _fb.fill(0)
      _zb.fill(1e9)
    } else {
      for (let y = rowLo; y < rowHi; y++) {
        _fb.fill(0, y * W + colLo, y * W + colHi)
        _zb.fill(1e9, y * W + colLo, y * W + colHi)
      }
    }
    colY.fill(rowHi)
    const c = vCos
    const s = vSin
    const q = vQ
    const S = vS
    const tn = vTan
    const Cx = vCx
    const Cy = vCy
    const A = cam.alt
    const bx = cam.x - Math.floor(cam.x / N) * N + N * 2
    const by = cam.y - Math.floor(cam.y / N) * N + N * 2
    const rankMax = Math.round(clamp(p.clouds, 0, 1) * 16)
    const cloudsOn = rankMax > 0
    const cdx = (time * 7) % NC
    const cdy = (time * 3) % NC
    const csx = sunX * CLOUD_ALT - cdx + NC
    const csy = sunY * CLOUD_ALT - cdy + NC
    const tW1 = ((time * 6) | 0) & 1023
    const tW2 = ((time * 4) | 0) & 1023
    const tF = (time * 36) | 0
    const sx = sunX
    const sy = sunY
    const isc = 1 / jetSize()
    const reach = JET_L * 0.75 * jetSize() + 3
    let nShadow = 0
    if (p.shadow && introT > 0.3) {
      for (let j = 0; j < jets.length && j < 3; j++) {
        const jet = jets[j]
        const ax = axes(jet)
        sjx[j] = bx + (jet.x - cam.x) + sx * jet.z
        sjy[j] = by + (jet.y - cam.y) + sy * jet.z
        const cs = Math.cos(jet.yaw)
        const sn = Math.sin(jet.yaw)
        srx[j] = cs
        sry[j] = sn
        sfx[j] = sn
        sfy[j] = -cs
        sic[j] = 1 / (Math.max(0.3, Math.abs(ax.cr)) * jetSize())
        nShadow++
      }
    }
    const _h = heightMap
    const _m = matMap
    const _cn = cloudN
    const _nz = nz
    const _cy = colY
    const hzR = hazeCol & 255
    const hzG = (hazeCol >> 8) & 255
    const hzB = (hazeCol >> 16) & 255
    const mixHaze = (col: number, keep: number, fog: number) =>
      ((255 << 24) |
        (((((col >> 16) & 255) * keep + hzB * fog) >> 8) << 16) |
        (((((col >> 8) & 255) * keep + hzG * fog) >> 8) << 8) |
        (((col & 255) * keep + hzR * fog) >> 8)) >>> 0

    // start where the tallest thing sits on the bottom row; stop when the sea leaves the top
    // of the frame, or at the view distance once there is a horizon
    // (a camera down among the hills and clouds starts right in front of itself instead)
    const below = rowHi - Cy
    const nearest = q > 0 ? -0.85 / q : -1e9
    const camHigh = q > 0 ? A + tn / q : 1e9
    const dn = S * tn + q * below
    let v = camHigh > ZTOP + 1 && dn > 1e-6 ? Math.max(nearest, (S * (A - ZTOP) - below) / dn - 2) : nearest
    // from higher up it sees further, and the haze starts further out
    const viewDist = VIEW_DIST + 3 * A
    const fogStart = FOG_START + 2 * A
    const above = Cy - rowLo + 2
    let vEnd = viewDist
    if (S * tn > q * above) vEnd = Math.min(viewDist, (S * A + above) / (S * tn - q * above))
    let den = 1 + q * v
    let m = S / den
    let R = Cy - m * (tn * v - A) + EPS
    for (let z = 0; z <= ZTOP; z++) rowNow[z] = Math.floor(R - m * z)
    const rowsK = S * (tn + q * A)
    for (let guard = 0; v < vEnd && guard < 4000; guard++) {
      // one step deeper: about one screen row of sea, never coarser than a few pixels across
      let dv = (den * den) / rowsK
      const cap = (2.5 * den) / S
      if (dv > cap) dv = cap
      if (dv < 0.5) dv = 0.5
      v += dv
      den = 1 + q * v
      m = S / den
      R = Cy - m * (tn * v - A) + EPS
      for (let z = 0; z <= ZTOP; z++) {
        rowPrev[z] = rowNow[z]
        rowNow[z] = Math.floor(R - m * z)
      }
      const inv = den / S
      const ax = c * inv
      const ay = -s * inv
      let wx = bx - Cx * ax - v * s
      let wy = by - Cx * ay - v * c
      // distance haze: colours step towards the horizon colour, a few shades at a time
      let fog = 0
      if (q > 0 && v > fogStart) {
        const f = (v - fogStart) / (viewDist - fogStart)
        fog = Math.min(256, ((Math.sqrt(f) * FOG_STEPS + 0.5) | 0) * (256 / FOG_STEPS)) | 0
      }
      const keep = 256 - fog
      const fine = inv < 1.8
      wx += ax * colLo
      wy += ay * colLo
      for (let px = colLo; px < colHi; px++, wx += ax, wy += ay) {
        // clouds: a stack of up to CK layers floating at CLOUD_ALT
        if (cloudsOn) {
          const cv = _cn[((((wy - cdy + NC) | 0) & NCM) << NCSHIFT) | (((wx - cdx + NC) | 0) & NCM)]
          if (cv !== 0 && cv >> 4 < rankMax) {
            const tk = cv & 15
            const zt = CLOUD_ALT + tk - 1
            let y0 = rowNow[zt]
            let y1 = rowPrev[zt]
            if (y0 < rowLo) y0 = rowLo
            if (y1 > rowHi) y1 = rowHi
            if (y0 < y1) {
              let col = cloudTop[tk - 1]
              if (fog > 0) col = mixHaze(col, keep, fog)
              for (let y = y0, o = y0 * W + px; y < y1; y++, o += W) {
                // the thinnest rim is a checker, so the cloud edge is soft
                if (_fb[o] !== 0 || (tk === 1 && ((px + y) & 1) === 0)) continue
                _fb[o] = col
                _zb[o] = v
              }
            }
            // its underside, when the camera is below the clouds
            let u0 = rowPrev[CLOUD_ALT]
            let u1 = rowNow[CLOUD_ALT]
            if (u0 < u1) {
              if (u0 < rowLo) u0 = rowLo
              if (u1 > rowHi) u1 = rowHi
              const col = fog > 0 ? mixHaze(cloudUnder, keep, fog) : cloudUnder
              for (let y = u0, o = u0 * W + px; y < u1; y++, o += W) {
                if (_fb[o] !== 0 || (tk === 1 && ((px + y) & 1) === 0)) continue
                _fb[o] = col
                _zb[o] = v
              }
            }
            for (let k = tk - 2; k >= 0; k--) {
              let ya = rowPrev[CLOUD_ALT + k + 1]
              let yb = rowPrev[CLOUD_ALT + k]
              if (ya < rowLo) ya = rowLo
              if (yb > rowHi) yb = rowHi
              if (ya >= yb) continue
              let col = cloudSide[k]
              if (fog > 0) col = mixHaze(col, keep, fog)
              for (let y = ya, o = ya * W + px; y < yb; y++, o += W) {
                if (_fb[o] === 0) { _fb[o] = col; _zb[o] = v }
              }
            }
          }
        }
        // terrain
        const gx = wx | 0
        const gy = wy | 0
        const idx = ((gy & NM) << NSHIFT) | (gx & NM)
        const h = _h[idx]
        let cY = _cy[px]
        const yT = rowNow[h]
        let yR = rowPrev[h]
        if (yT >= cY && yR >= cY) continue
        const mat = _m[idx]
        // shadows: clouds, then the jets
        let shade = 0
        if (cloudsOn) {
          const sv = _cn[((((gy + csy) | 0) & NCM) << NCSHIFT) | (((gx + csx) | 0) & NCM)]
          if ((sv & 15) > 1 && sv >> 4 < rankMax) shade = 1
        }
        if (shade === 0 && nShadow > 0) {
          for (let j = 0; j < nShadow; j++) {
            const dx = gx - sjx[j] + sx * h
            const dy = gy - sjy[j] + sy * h
            if (dx > -reach && dx < reach && dy > -reach && dy < reach) {
              const a = (dx * srx[j] + dy * sry[j]) * sic[j]
              const b = (dx * sfx[j] + dy * sfy[j]) * isc
              const i = Math.floor(a + JET_W / 2)
              const k = Math.floor(PIV_K - b + 0.5)
              if (i >= 0 && i < JET_W && k >= 0 && k < JET_L && shadowMask[k * JET_W + i] === 1) { shade = 1; break }
            }
          }
        }
        let top: number
        let side: number
        if (mat < 4) {
          top = shade ? topShade[mat] : topLit[mat]
          if (mat === 3) {
            if (((_nz[((gy & 255) << 8) | (gx & 255)] + tF) & 255) < 120) top = shade ? topShade[2] : foamCol
          } else if (shade === 0 && fine) {
            const n1 = _nz[((gy & 255) << 8) | (((gx + tW1) >> 2) & 255)]
            if (n1 > 243) {
              const n2 = _nz[(((gy + 91) & 255) << 8) | (((gx + 1024 - tW2) >> 2) & 255)]
              if (n2 > 128) top = n1 > 252 ? sparkB : sparkA
            }
          }
          side = top
        } else {
          top = shade ? topShade[mat] : topLit[mat]
          side = shade ? sideShade[mat] : sideLit[mat]
        }
        if (fog > 0) {
          top = mixHaze(top, keep, fog)
          side = mixHaze(side, keep, fog)
        }
        // the wall of this column, where it starts …
        if (yR < cY) {
          if (yR < rowLo) yR = rowLo
          for (let y = yR, o = yR * W + px; y < cY; y++, o += W) {
            if (_fb[o] === 0) { _fb[o] = side; _zb[o] = v }
          }
          cY = yR
        }
        // … and its top, up to where it ends (unless the camera is below it)
        if (yT < cY) {
          const y0 = yT < rowLo ? rowLo : yT
          for (let y = y0, o = y0 * W + px; y < cY; y++, o += W) {
            if (_fb[o] === 0) { _fb[o] = top; _zb[o] = v }
          }
          cY = yT
        }
        _cy[px] = cY
      }
    }
  }

  // whatever the ground left empty: sky above the horizon, haze below it
  function drawSky() {
    if (vC === 0 && vK === 0) return
    const _fb = fb
    const q = vQ
    const horizon = q > 1e-7 ? vCy - (vS * vTan) / q : -1e9
    const hz = horizon > H ? H : Math.floor(horizon)
    const focal = q > 1e-7 ? vS / q : 1e9
    const tod = p.timeOfDay
    // sun or moon, low over the horizon, opposite the shadows
    if (hz > 0 && tod !== 'day') {
      const sl = Math.sqrt(sunX * sunX + sunY * sunY) || 1
      const dx = -sunX / sl
      const dy = -sunY / sl
      const du = dx * vCos - dy * vSin
      const dv = -(dx * vSin + dy * vCos)
      if (dv > 0.2) {
        const rad = tod === 'sunset' ? W * 0.05 : W * 0.022
        const cxs = vCx + (focal * du) / dv
        const cys = horizon - (focal * (tod === 'sunset' ? 0.12 : 0.3)) / dv
        const reach = rad * 1.9
        const xa = Math.max(0, Math.floor(cxs - reach))
        const xb = Math.min(W - 1, Math.ceil(cxs + reach))
        const ya = Math.max(0, Math.floor(cys - reach))
        const yb = Math.min(hz - 1, Math.ceil(cys + reach))
        for (let y = ya; y <= yb; y++) {
          for (let x = xa; x <= xb; x++) {
            const o = y * W + x
            if (_fb[o] !== 0) continue
            const d = Math.sqrt((x - cxs) * (x - cxs) + (y - cys) * (y - cys)) / rad
            if (d < 1) _fb[o] = sunCol
            else if (d < 1.9 && (1.9 - d) * 14 > BAYER[((y & 3) << 2) | (x & 3)]) _fb[o] = sunGlow
          }
        }
      }
    }
    const span = frameH * 0.75
    const starOff = ((vYaw * focal) | 0) & 4095
    const stars = tod === 'night'
    for (let y = rowLo; y < rowHi; y++) {
      let o = y * W
      o += colLo
      if (y < hz) {
        const t = ((hz - y) / span) * (NSKY - 1)
        for (let x = colLo; x < colHi; x++, o++) {
          if (_fb[o] !== 0) continue
          let b = t | 0
          const edge = (t - b - 0.7) * 3.4
          if (edge > 0 && edge * 16 > BAYER[((y & 3) << 2) | (x & 3)]) b++
          if (b >= NSKY) b = NSKY - 1
          _fb[o] = stars && b > 1 && hash8(((x + starOff) & 4095) * 73 + y * 9973) < 2 ? sunCol : skyPal[b]
        }
      } else {
        for (let x = colLo; x < colHi; x++, o++) if (_fb[o] === 0) _fb[o] = hazeCol
      }
    }
  }

  function drawTrails() {
    if (!p.trails) return
    const LIFE = 2.6
    const _fb = fb
    const _zb = zbuf
    for (const j of trailJets()) {
      if (j === jets[0] && jetFade < 0.5) continue
      const g = j.g
      for (let w = 0; w < 2; w++) {
        const tr = j.trail[w]
        let prevX = 0
        let prevY = 0
        let has = false
        for (let n = 0; n < j.trailLen; n++) {
          const o = ((j.trailHead - 1 - n + TRAIL_N * 2) % TRAIL_N) * 4
          const age = (time - tr[o + 3]) / (LIFE * (0.3 + 0.7 * g))
          if (age >= 1) break
          if (!project(tr[o], tr[o + 1], tr[o + 2])) { has = false; continue }
          const sxp = prX
          const syp = prY
          if (has) {
            // short line from the previous point, thicker when it is close to the camera
            const span = Math.max(Math.abs(sxp - prevX), Math.abs(syp - prevY))
            if (span < 600) {
              const steps = Math.max(1, Math.ceil(span))
              const alpha = age < 0.5 ? 1 : (1 - age) * 2
              const col = age < 0.25 ? trailPal[0] : age < 0.6 ? trailPal[1] : trailPal[2]
              const thick = prM > 2.4 ? 2 : 1
              for (let k = 0; k < steps; k++) {
                const x0 = Math.round(prevX + ((sxp - prevX) * k) / steps)
                const y0 = Math.round(prevY + ((syp - prevY) * k) / steps)
                for (let yy = y0; yy < y0 + thick; yy++) {
                  for (let xx = x0; xx < x0 + thick; xx++) {
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
                    if (_zb[yy * W + xx] < prV - 1) continue // behind a hill or a cloud
                    if (alpha * 16 > BAYER[((yy & 3) << 2) | (xx & 3)]) _fb[yy * W + xx] = col
                  }
                }
              }
            }
          }
          prevX = sxp
          prevY = syp
          has = true
        }
      }
    }
  }

  // dark exhaust smoke: soft round puffs that swell, pale and thin out as they hang in the air
  function drawSmoke() {
    const _fb = fb
    const _zb = zbuf
    const night = p.timeOfDay === 'night' ? 0.55 : 1
    for (let i = 0; i < SMOKE_N; i++) {
      const o = i * SMOKE_F
      const life = smoke[o + 8]
      if (life <= 0) continue
      const age = time - smoke[o + 3]
      if (age < 0 || age >= life) continue
      const u = age / life
      // the exhaust shoves it backwards at first; then it just hangs and rises a little
      const push = (1 - Math.exp(-age * 5)) / 5
      if (!project(smoke[o] + smoke[o + 5] * push, smoke[o + 1] + smoke[o + 6] * push, smoke[o + 2] + age * 2.5)) continue
      const rad = Math.max(0.8, smoke[o + 4] * (1 + 2.4 * u) * prM)
      if (rad > 60) continue
      const alpha = smoke[o + 7] * (1 - u) * (1 - u) * (u < 0.08 ? u / 0.08 : 1) * night
      const shade = 26 + 70 * u
      const cr = shade
      const cg = shade + 1
      const cb = shade + 7
      const x0 = Math.max(0, Math.floor(prX - rad))
      const x1 = Math.min(W - 1, Math.ceil(prX + rad))
      const y0 = Math.max(0, Math.floor(prY - rad))
      const y1 = Math.min(H - 1, Math.ceil(prY + rad))
      const inv = 1 / (rad * rad)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d2 = ((x - prX) * (x - prX) + (y - prY) * (y - prY)) * inv
          if (d2 > 1) continue
          const at = y * W + x
          if (_zb[at] < prV - 1) continue
          const k = (alpha * (1 - d2 * 0.7) * 256) | 0
          const bg = _fb[at]
          const r = ((bg & 255) * (256 - k) + cr * k) >> 8
          const g = (((bg >> 8) & 255) * (256 - k) + cg * k) >> 8
          const b = (((bg >> 16) & 255) * (256 - k) + cb * k) >> 8
          _fb[at] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
        }
      }
    }
  }

  function drawJet(j: Jet, index: number) {
    const c = vCos
    const s = vSin
    const q = vQ
    const S = vS
    const tn = vTan
    const ax = axes(j)
    const sc = jetSize()
    // the jet's own axes in view space, per voxel: across the screen (U), into it (V), up (W)
    const rU = (ax.rx * c - ax.ry * s) * sc
    const rV = -(ax.rx * s + ax.ry * c) * sc
    const rW = ax.rz * sc
    const fU = (ax.fx * c - ax.fy * s) * sc
    const fV = -(ax.fx * s + ax.fy * c) * sc
    const fW = ax.fz * sc
    const uU = (ax.ux * c - ax.uy * s) * sc
    const uV = -(ax.ux * s + ax.uy * c) * sc
    const uW = ax.uz * sc
    const dx = j.x - cam.x
    const dy = j.y - cam.y
    const cU = dx * c - dy * s
    const cV = -(dx * s + dy * c)
    const cW = j.z - cam.alt
    // going into the cockpit, the camera moves into the leader, which fades away
    const fade = index === 0 ? jetFade : 1
    if (fade < 0.004) return
    const fading = fade < 1
    const _bg = backdrop
    const den0 = 1 + q * cV
    if (den0 < 0.2) return
    const m0 = S / den0
    const cx = vCx + m0 * cU
    const cy = vCy - m0 * (cW + tn * cV)
    const far = JET_L * sc * m0 + 40
    if (cx < -far || cy < -far - H || cx > W + far || cy > H + far) return
    // screen steps for one voxel along the wing and along the fuselage, at the jet's centre
    const prx = m0 * rU
    const pry = -m0 * (rW + tn * rV)
    const pfx = m0 * fU
    const pfy = -m0 * (fW + tn * fV)
    const _fb = fb
    const _mk = jetMask
    const _zb = zbuf
    // light: which way each half of the jet faces the sun
    const lx = -sunX
    const ly = -sunY
    const lz = 1.1
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz)
    const night = p.timeOfDay === 'night'
    const litAt = night ? 0.74 : 0.9
    const dimAt = night ? 0.4 : 0.66
    const lit = (side: number) => {
      const nx = ax.ux + side * 0.4 * ax.rx
      const ny = ax.uy + side * 0.4 * ax.ry
      const nz2 = ax.uz + side * 0.4 * ax.rz
      const b = (nx * lx + ny * ly + nz2 * lz) / (ll * Math.sqrt(nx * nx + ny * ny + nz2 * nz2))
      if (j.foe) return b > litAt ? foePalLit : b < dimAt ? foePalDim : foePal
      return b > litAt ? jetPalLit : b < dimAt ? jetPalDim : jetPal
    }
    const palL = lit(-1)
    const palR = lit(1)
    let x0 = W
    let y0 = H
    let x1 = -1
    let y1 = -1
    // several samples per voxel, more the larger it is drawn, so a turned slice has no pin-holes
    const big = (sc * S) / Math.max(0.2, den0 - q * JET_L * 0.6 * sc)
    const ns = clamp(Math.ceil(big * 2 - 0.24), 2, 8)
    for (let i = 0; i < ns; i++) {
      for (let k = 0; k < ns; k++) {
        const oi = (i + 0.5) / ns - 0.5
        const ok = (k + 0.5) / ns - 0.5
        offX[i * ns + k] = oi * prx + ok * pfx
        offY[i * ns + k] = oi * pry + ok * pfy
      }
    }
    const nOff = ns * ns
    // slices are drawn from the one farthest from eye level to the nearest, so nearer ones cover
    let eye: number
    if (q < 1e-6) eye = tn * uW - uV >= 0 ? 1e9 : -1e9
    else eye = (-cU * uU + (-1 / q - cV) * uV + (tn / q - cW) * uW) / (sc * sc)
    for (let y = 0; y < JET_H; y++) {
      sliceOrder[y] = y
      sliceKey[y] = Math.abs((y - PIV_Y) * spreadNow - eye)
    }
    for (let i = 1; i < JET_H; i++) {
      const y = sliceOrder[i]
      const key = sliceKey[y]
      let k = i - 1
      while (k >= 0 && sliceKey[sliceOrder[k]] < key) { sliceOrder[k + 1] = sliceOrder[k]; k-- }
      sliceOrder[k + 1] = y
    }
    const it = j.foe ? 99 : introT - index * 0.25 // enemies fly in whole, without the intro drop
    const flameOn = burn > 0.02 && p.afterburner > 0.01 && spreadNow < 2.6
    const flick = 0.82 + 0.18 * Math.sin(time * 47 + index * 2) * Math.sin(time * 31)
    const flameLen = flameLength() * flick
    const flameWide = 1.15 * (1 + 0.22 * boost)
    const behind = vC + vK > 0.5 // seen from behind, the flames sit in front of the whole tail
    const bend = flameBend()
    const arch = climbTilt * 0.35
    const smooth = p.flameStyle === 'realistic'
    const dropOf = (y: number) => {
      // the intro: slices fall in from the top one after another and land on the stack
      if (it >= 2) return 0
      const tt = (it - (y - firstSlice) * 0.07) / 0.36
      if (tt <= 0) return NaN
      return tt < 1 ? -(1 - tt * tt) * ((H >> 1) + 44) : 0
    }
    // afterburner, sliced the same way so it stacks with the jet
    const flames = (y: number, bU: number, bV: number, bW: number, drop: number) => {
      const dyv = (y + 0.5 - ENGINE_Y) / (ENGINE_R * 1.25)
      if (dyv <= -1 || dyv >= 1 || flameLen <= 0.5) return
      const prof = Math.sqrt(1 - dyv * dyv)
      for (let e = -1; e <= 1; e += 2) {
        for (let t = 0; t < flameLen; t += 0.5) {
          const u = t / flameLen
          const rad = ENGINE_R * flameWide * Math.pow(1 - u, 0.75) * prof * (0.9 + 0.2 * Math.sin(t * 1.9 - time * 40 + e))
          if (rad < 0.2) continue
          const b = PIV_K - NOZZLE_K - t
          // the plume trails round the inside of a turn, and along the arc of a climb or dive
          const curl = (t * t) / flameLen
          const swing = bend * curl
          const lift = arch * curl
          for (let a = -rad; a <= rad; a += 0.5) {
            const aa = e * ENGINE_A + a + swing
            const V = bV + aa * rV + b * fV + lift * uV
            const den = 1 + q * V
            if (den < 0.2) continue
            const m = S / den
            const heat = u * 0.9 + (Math.abs(a) / (rad + 0.01)) * 0.55 + Math.abs(dyv) * 0.3 - 0.16 * boost
            const col = flamePal[heat < 0.28 ? 0 : heat < 0.5 ? 1 : heat < 0.75 ? 2 : heat < 1.0 ? 3 : heat < 1.25 ? 4 : 5]
            const fx = Math.round(vCx + m * (bU + aa * rU + b * fU + lift * uU))
            const fy = Math.round(vCy - m * (bW + aa * rW + b * fW + lift * uW + tn * V) + drop)
            const size = Math.max(1, Math.ceil(m * sc * 0.55))
            for (let yy = fy; yy < fy + size; yy++) {
              for (let xx = fx; xx < fx + size; xx++) {
                if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
                const at = yy * W + xx
                if (_zb[at] < V - 1) continue
                if (fading && _mk[at] === 0) _bg[at] = _fb[at]
                _fb[at] = col
                _mk[at] = 2 // flame: never outlined
              }
            }
            if (fx < x0) x0 = fx
            if (fx + size > x1) x1 = fx + size
            if (fy < y0) y0 = fy
            if (fy + size > y1) y1 = fy + size
          }
        }
      }
    }
    // a smooth flame is only measured here: where its nozzle, a point straight behind it and its
    // tip (which swings out in a turn) fall in the frame, and how much of it the world hides
    const smoothFlames = () => {
      // (the fire flickers by itself, so its length is held much steadier than the pixel flames')
      const L = flameLength() * (0.94 + 0.3 * (flick - 0.82)) * FLAME_GROW
      const wide = ENGINE_R * (1 + 0.12 * boost) * 1.5
      const show = fade * (1 - cockpitIn())
      if (L <= 0.6 || show < 0.01) return
      const hgt = (ENGINE_Y - 0.5 - PIV_Y) * spreadNow
      const bU = cU + hgt * uU
      const bV = cV + hgt * uV
      const bW = cW + hgt * uW
      for (let e = -1; e <= 1; e += 2) {
        if (flameOut.count >= FLAME_MAX) return
        const o = flameOut.count * FLAME_F
        let inView = true
        let mA = 0
        let mC = 0
        for (let n = 0; n < 3; n++) {
          const curl = n === 2 ? L : 0
          const aa = e * ENGINE_A + bend * curl
          const b = PIV_K - NOZZLE_K - n * 0.5 * L
          const lift = arch * curl
          const V = bV + aa * rV + b * fV + lift * uV
          const den = 1 + q * V
          if (den < 0.2) { inView = false; break }
          const m = S / den
          flameData[o + n * 2] = vCx + m * (bU + aa * rU + b * fU + lift * uU)
          flameData[o + n * 2 + 1] = vCy - m * (bW + aa * rW + b * fW + lift * uW + tn * V)
          flameV[n] = V
          if (n === 0) mA = m
          else if (n === 2) mC = m
        }
        if (!inView) continue
        const rad = wide * sc * mA
        const slot = (index * 2 + (e > 0 ? 1 : 0)) % FLAME_MAX
        for (let n = 0; n < 3; n++) {
          const mid = n === 1
          const px = mid ? 0.25 * flameData[o] + 0.5 * flameData[o + 2] + 0.25 * flameData[o + 4] : flameData[o + n * 2]
          const py = mid ? 0.25 * flameData[o + 1] + 0.5 * flameData[o + 3] + 0.25 * flameData[o + 5] : flameData[o + n * 2 + 1]
          const V = mid ? 0.25 * flameV[0] + 0.5 * flameV[1] + 0.25 * flameV[2] : flameV[n]
          let open = 0
          for (let k = 0; k < 5; k++) {
            const xx = Math.round(px + (k === 1 ? -rad : k === 2 ? rad : 0))
            const yy = Math.round(py + (k === 3 ? -rad : k === 4 ? rad : 0))
            if (xx < 0 || yy < 0 || xx >= W || yy >= H || _zb[yy * W + xx] >= V - 1) open++
          }
          // eased, so a flame slips behind a cloud rather than blinking out
          const at = slot * 3 + n
          flameSeen[at] += (open / 5 - flameSeen[at]) * 0.3
          flameData[o + 10 + n] = flameSeen[at]
        }
        flameData[o + 6] = rad
        flameData[o + 7] = mC / mA
        flameData[o + 8] = boost
        flameData[o + 9] = show
        flameData[o + 13] = slot
        flameData[o + 14] = clamp(p.afterburner, 0, 1)
        flameData[o + 15] = L / wide
        flameOut.count++
      }
    }
    for (let n = 0; n < JET_H; n++) {
      const y = sliceOrder[n]
      const cnt = sliceC[y].length
      if (cnt === 0) continue
      const drop = dropOf(y)
      if (drop !== drop) continue
      const hgt = (y - PIV_Y) * spreadNow
      const bU = cU + hgt * uU
      const bV = cV + hgt * uV
      const bW = cW + hgt * uW
      const A = sliceA[y]
      const B = sliceB[y]
      const C = sliceC[y]
      for (let v = 0; v < cnt; v++) {
        const a = A[v]
        const b = B[v]
        const V = bV + a * rV + b * fV
        const den = 1 + q * V
        if (den < 0.2) continue
        const m = S / den
        const col = a < 0 ? palL[C[v]] : palR[C[v]]
        const px = vCx + m * (bU + a * rU + b * fU)
        const py = vCy - m * (bW + a * rW + b * fW + tn * V) + drop
        const k = m / m0
        let x = 0
        let yy = 0
        for (let o = 0; o < nOff; o++) {
          x = Math.round(px + offX[o] * k)
          yy = Math.round(py + offY[o] * k)
          if (x < 0 || yy < 0 || x >= W || yy >= H) continue
          const at = yy * W + x
          if (_zb[at] < V - 1) continue // a hill or a cloud is in front
          if (fading && _mk[at] === 0) _bg[at] = _fb[at]
          _fb[at] = col
          _mk[at] = 1
        }
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (yy < y0) y0 = yy
        if (yy > y1) y1 = yy
      }
      if (flameOn && !smooth && !behind) flames(y, bU, bV, bW, drop)
    }
    if (flameOn && smooth) smoothFlames()
    if (flameOn && !smooth && behind) {
      for (let y = 0; y < JET_H; y++) {
        const drop = dropOf(y)
        if (drop !== drop) continue
        const hgt = (y - PIV_Y) * spreadNow
        flames(y, cU + hgt * uU, cV + hgt * uV, cW + hgt * uW, drop)
      }
    }
    // a dark 1 px outline around the whole stack, so it reads over any ground
    x0 = Math.max(1, x0 - 4)
    y0 = Math.max(1, y0 - 4)
    x1 = Math.min(W - 2, x1 + 4)
    y1 = Math.min(H - 2, y1 + 4)
    for (let yy = y0; yy <= y1; yy++) {
      let o = yy * W + x0
      for (let x = x0; x <= x1; x++, o++) {
        if (fading) {
          // let what was behind show through
          if (_mk[o] !== 0) {
            const bg = _bg[o]
            const fg = _fb[o]
            const k = (fade * 256) | 0
            const r = ((bg & 255) * (256 - k) + (fg & 255) * k) >> 8
            const g = (((bg >> 8) & 255) * (256 - k) + ((fg >> 8) & 255) * k) >> 8
            const b = (((bg >> 16) & 255) * (256 - k) + ((fg >> 16) & 255) * k) >> 8
            _fb[o] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
          }
        } else if (_mk[o] === 0 && ((_mk[o - 1] | _mk[o + 1] | _mk[o - W] | _mk[o + W]) & 1) === 1 && _zb[o] >= cV - 2) {
          _fb[o] = outlineCol
        }
      }
    }
    for (let yy = y0 - 1; yy <= y1 + 1; yy++) _mk.fill(0, yy * W + x0 - 1, yy * W + x1 + 2)
  }

  // ── the cockpit view
  //
  // The world is drawn on a larger square sheet and then turned, so the horizon tilts as the
  // jet banks. On top of that come the head-up display, the canopy frame and the instruments.

  /** turn the square sheet by the camera's roll into the frame */
  function turnSheet() {
    const c = Math.cos(vRoll)
    const s = Math.sin(vRoll)
    const half = sheetSide >> 1
    const cx = W >> 1
    const _fb = fb
    const _sh = sheet
    const side = sheetSide
    for (let y = 0; y < H; y++) {
      const dy = y - pivotY
      let sx = half - c * cx - s * dy + 0.5
      let sy = half - s * cx + c * dy + 0.5
      let o = y * W
      for (let x = 0; x < W; x++, o++, sx += c, sy += s) _fb[o] = _sh[(sy | 0) * side + (sx | 0)]
    }
  }

  // the cockpit's fixed metalwork is painted once per size and colour scheme
  function cockpitArt() {
    if (!cockpit || cockpit.W !== W || cockpit.H !== H) {
      const body: number[] = []
      const hot: number[] = []
      for (let t = 0; t < 9; t++) body.push(jetPal[1 + t])
      for (let t = 0; t < 6; t++) hot.push(jetPal[17 + t])
      cockpit = buildCockpit(W, H, { body, hot })
    }
    return cockpit
  }
  const radarLand = (right: number, ahead: number) => {
    const lead = jets[0]
    const sn = Math.sin(lead.yaw)
    const cs = Math.cos(lead.yaw)
    const m = matMap[((((lead.y + right * sn - ahead * cs) | 0) & NM) << NSHIFT) | (((lead.x + right * cs + ahead * sn) | 0) & NM)]
    return m >= 12 ? 3 : m >= 4 ? 2 : m >= 2 ? 1 : 0
  }
  const blips: number[] = []
  function drawCockpitView() {
    const lead = jets[0]
    // the panel and the hoop slide into place over the later part of the move
    const inPlace = cockpitIn()
    if (inPlace <= 0) return
    const h = clamp((vK - 0.72) / 0.28, 0, 1)
    const sn = Math.sin(lead.yaw)
    const cs = Math.cos(lead.yaw)
    blips.length = 0
    for (const j of trailJets()) {
      if (j === lead || j.dead >= 0) continue
      const ex = j.x - lead.x
      const ey = j.y - lead.y
      blips.push(ex * cs + ey * sn, ex * sn - ey * cs)
    }
    // where the sun is from the seat: to one side or the other, ahead or behind
    const tod = p.timeOfDay
    const sl = Math.sqrt(sunX * sunX + sunY * sunY) || 1
    const sunFront = (-sunX * sn + sunY * cs) / sl
    const sunSide = (-sunX * cs - sunY * sn) / sl
    drawCockpit(fb, cockpitArt(), {
      time,
      inPlace,
      hud: h * h * (3 - 2 * h),
      roll: vRoll,
      pitch: lead.pitch,
      heading: lead.yaw,
      speed: speedNow,
      speedMax: p.speed * clamp(p.boost, 1, 4) * 1.08,
      alt: lead.z,
      altMax: Math.max(p.altitude, clamp(p.ceiling, 20, 900)),
      climb: clamp(climbTilt / 0.5, -1, 1),
      turn: clamp(lead.yawRate / Math.max(0.1, p.agility), -1, 1),
      boost,
      pivotY,
      horizonY: vCy,
      focal: vS / vQ,
      // the head sways with the flying, and shudders while the thrusters are open
      headX,
      headY: headY + (boost > 0.2 ? ((((time * 30) | 0) & 1) - 0.5) * 1.5 * boost : 0),
      // light pours over the pilot's shoulder with the sun behind; the hood shades the panel with it ahead
      sunSide,
      sunReach: 0.72 - 0.28 * sunFront,
      sunColor: tod === 'sunset' ? SUN_SUNSET : tod === 'night' ? SUN_NIGHT : SUN_DAY,
      sunPower: tod === 'sunset' ? 1.1 : tod === 'night' ? 0.45 : 1,
      land: radarLand,
      blips,
      jet: jetTop,
    })
  }

  // ── combat, drawn into the same picture

  /** every jet with wingtip trails: the player's flight and the enemies */
  function trailJets() {
    return foes.length ? jets.concat(foes) : jets
  }

  /** a short line between two screen points, behind hills and clouds where the world is nearer */
  function line(xa: number, ya: number, xb: number, yb: number, depth: number, col: number, thick: number) {
    const _fb = fb
    const _zb = zbuf
    const span = Math.max(Math.abs(xb - xa), Math.abs(yb - ya))
    if (span > 400) return
    const steps = Math.max(1, Math.ceil(span))
    for (let k = 0; k <= steps; k++) {
      const x0 = Math.round(xa + ((xb - xa) * k) / steps)
      const y0 = Math.round(ya + ((yb - ya) * k) / steps)
      for (let yy = y0; yy < y0 + thick; yy++) {
        for (let xx = x0; xx < x0 + thick; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
          if (_zb[yy * W + xx] < depth - 1) continue
          _fb[yy * W + xx] = col
        }
      }
    }
  }

  /** a soft round blob blended over the picture (fireballs, smoke) */
  function blob(x: number, y: number, rad: number, depth: number, col: number, alpha: number, solid: boolean) {
    const _fb = fb
    const _zb = zbuf
    const x0 = Math.max(0, Math.floor(x - rad))
    const x1 = Math.min(W - 1, Math.ceil(x + rad))
    const y0 = Math.max(0, Math.floor(y - rad))
    const y1 = Math.min(H - 1, Math.ceil(y + rad))
    const inv = 1 / Math.max(0.25, rad * rad)
    const cr = col & 255
    const cg = (col >> 8) & 255
    const cb = (col >> 16) & 255
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const d2 = ((xx + 0.5 - x) * (xx + 0.5 - x) + (yy + 0.5 - y) * (yy + 0.5 - y)) * inv
        if (d2 > 1) continue
        const at = yy * W + xx
        if (_zb[at] < depth - 1) continue
        if (solid) {
          // fire stays hard-edged like the pixel flames: dithered away as it fades
          if (alpha * 16 > BAYER[((yy & 3) << 2) | (xx & 3)]) _fb[at] = col
          continue
        }
        const k = (alpha * (1 - d2 * 0.6) * 256) | 0
        const bg = _fb[at]
        const r = ((bg & 255) * (256 - k) + cr * k) >> 8
        const g = (((bg >> 8) & 255) * (256 - k) + cg * k) >> 8
        const b = (((bg >> 16) & 255) * (256 - k) + cb * k) >> 8
        _fb[at] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
      }
    }
  }

  const TRACER_OURS = pack(255, 238, 150)
  const TRACER_OURS_TAIL = pack(255, 170, 52)
  const TRACER_THEIRS = pack(255, 92, 70)
  const TRACER_THEIRS_TAIL = pack(190, 40, 40)
  const MISSILE_BODY = pack(236, 240, 246)
  const MISSILE_DARK = pack(120, 128, 140)
  const SPARK_COL = pack(255, 244, 190)
  const LOCK_ON = pack(255, 70, 52)
  const LOCK_SEEK = pack(255, 214, 64)
  const FOE_MARK = pack(255, 96, 72)

  function drawCombat() {
    const sc = jetSize()
    // tracers
    for (let n = 0; n < BUL_N; n++) {
      const o = n * BUL_F
      if (bullets[o + 6] <= 0) continue
      const ours = bullets[o + 7] === 0
      if (!project(bullets[o], bullets[o + 1], bullets[o + 2])) continue
      const hx = prX
      const hy = prY
      const hv = prV
      const thick = prM > 2.2 ? 2 : 1
      const back = 0.024
      if (!project(bullets[o] - bullets[o + 3] * back, bullets[o + 1] - bullets[o + 4] * back, bullets[o + 2] - bullets[o + 5] * back)) continue
      const tx = prX
      const ty = prY
      line(tx, ty, (tx + hx) / 2, (ty + hy) / 2, hv, ours ? TRACER_OURS_TAIL : TRACER_THEIRS_TAIL, thick)
      line((tx + hx) / 2, (ty + hy) / 2, hx, hy, hv, ours ? TRACER_OURS : TRACER_THEIRS, thick)
    }
    // missiles: a white body with a hot tail
    for (let n = 0; n < MSL_N; n++) {
      const o = n * MSL_F
      if (missiles[o + 9] <= 0) continue
      const vx = missiles[o + 3]
      const vy = missiles[o + 4]
      const vz = missiles[o + 5]
      const sp = Math.hypot(vx, vy, vz) || 1
      const L = 5 * sc
      if (!project(missiles[o] + (vx / sp) * L, missiles[o + 1] + (vy / sp) * L, missiles[o + 2] + (vz / sp) * L)) continue
      const nx = prX
      const ny = prY
      const nv = prV
      const thick = prM > 2.2 ? 2 : 1
      if (!project(missiles[o] - (vx / sp) * L, missiles[o + 1] - (vy / sp) * L, missiles[o + 2] - (vz / sp) * L)) continue
      line(prX, prY, nx, ny, nv, MISSILE_DARK, thick + 1)
      line(prX, prY, nx, ny, nv, MISSILE_BODY, thick)
      if (missiles[o + 6] > 0.28) blob(prX, prY, Math.max(1, 1.6 * prM * sc), prV, flamePal[((time * 30) | 0) & 1 ? 0 : 1], 1, true)
    }
    // fire, smoke, sparks and pieces
    for (let n = 0; n < FX_N; n++) {
      const o = n * FX_F
      const life = fx[o + 7]
      if (life <= 0) continue
      const age = time - fx[o + 6]
      if (age < 0 || age >= life) { if (age >= life) fx[o + 7] = 0; continue }
      const u = age / life
      const kind = fx[o + 9]
      let x: number
      let y: number
      let z: number
      if (kind === FX_SPARK || kind === FX_DEBRIS) {
        x = fx[o] + fx[o + 3] * age
        y = fx[o + 1] + fx[o + 4] * age
        z = fx[o + 2] + fx[o + 5] * age - 0.5 * fx[o + 10] * age * age
        if (z < groundAt(x, y)) { fx[o + 7] = 0; continue }
      } else {
        const drag = (1 - Math.exp(-age * 2.4)) / 2.4
        x = fx[o] + fx[o + 3] * drag
        y = fx[o + 1] + fx[o + 4] * drag
        z = fx[o + 2] + fx[o + 5] * drag + (kind === FX_FIRE ? 0 : age * 3)
      }
      if (!project(x, y, z)) continue
      if (kind === FX_SPARK) {
        line(prX, prY, prX, prY, prV, SPARK_COL, prM > 2.2 ? 2 : 1)
      } else if (kind === FX_DEBRIS) {
        line(prX, prY, prX, prY, prV, outlineCol, Math.max(1, Math.round(prM * sc)))
      } else if (kind === FX_FIRE) {
        const rad = fx[o + 8] * (0.55 + 1.1 * Math.sqrt(u)) * prM
        if (rad > 80) continue
        const col = flamePal[Math.min(5, Math.floor(u * 6.5))]
        blob(prX, prY, rad, prV, col, u < 0.6 ? 1 : (1 - u) / 0.4, true)
      } else {
        const rad = fx[o + 8] * (1 + 1.8 * u) * prM
        if (rad > 90) continue
        const white = kind === FX_WHITE
        const shade = white ? 236 - 30 * u : 30 + 60 * u
        const col = pack(shade, shade + (white ? 2 : 1), shade + (white ? 6 : 7))
        const alpha = (white ? 0.62 : 0.72) * (1 - u) * (1 - u) * (u < 0.06 ? u / 0.06 : 1)
        blob(prX, prY, rad, prV, col, alpha, false)
      }
    }
    // the guns' flash
    if (muzzle > 0.4 && leadAlive() && jetFade > 0.5) {
      const lead = jets[0]
      for (const side of [-1, 1]) {
        const m = jetPoint(lead, side * 6, PIV_K * 0.55 + 2, 0)
        if (project(m[0], m[1], m[2])) blob(prX, prY, Math.max(0.8, 1.3 * prM * sc), prV - 4, flamePal[0], 1, true)
      }
    }
  }

  /** brackets round the target, and arrows at the edge pointing to enemies out of the frame */
  function drawMarkers(rolled: boolean) {
    const sc = jetSize()
    if (lockFoe >= 0 && leadAlive()) {
      const f = foes[lockFoe]
      if (f && f.dead < 0 && project(f.x, f.y, f.z)) {
        const locked = lockT >= LOCK_TIME
        if (locked || ((time * 8) | 0) & 1) {
          const r = Math.max(7, Math.round(HIT_R * 0.75 * sc * prM)) + (locked ? 0 : Math.round((1 - lockT / LOCK_TIME) * 6))
          const col = locked ? LOCK_ON : LOCK_SEEK
          const cx = Math.round(prX)
          const cy = Math.round(prY)
          const arm = Math.max(3, r >> 1)
          for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
              const x = cx + sx * r
              const y = cy + sy * r
              line(x, y, x - sx * arm, y, -1e9, col, 1)
              line(x, y, x, y - sy * arm, -1e9, col, 1)
            }
          }
          if (locked) line(cx, cy, cx, cy, -1e9, col, 1)
        }
      }
    }
    if (rolled) return // the cockpit has its radar for that
    const cx = W >> 1
    const cy = H >> 1
    for (const f of foes) {
      if (f.dead >= 0) continue
      let ux: number
      let uy: number
      const dx = f.x - cam.x
      const dy = f.y - cam.y
      if (project(f.x, f.y, f.z)) {
        if (prX >= 2 && prY >= 2 && prX < W - 2 && prY < H - 2) continue
        ux = prX - cx
        uy = prY - cy
      } else {
        ux = dx * vCos - dy * vSin
        uy = Math.abs(dx * vSin + dy * vCos) + 1 // behind the camera: at the bottom edge
      }
      const l = Math.hypot(ux, uy) || 1
      ux /= l
      uy /= l
      // as far out along that line as the frame allows, less a margin
      const m = 7
      const t = Math.min(ux !== 0 ? (cx - m) / Math.abs(ux) : 1e9, uy !== 0 ? (cy - m) / Math.abs(uy) : 1e9)
      const ax = cx + ux * t
      const ay = cy + uy * t
      // a little arrow head pointing out
      for (let k = 0; k < 5; k++) {
        const bx = ax - ux * k
        const by = ay - uy * k
        line(bx - uy * k * 0.7, by + ux * k * 0.7, bx + uy * k * 0.7, by - ux * k * 0.7, -1e9, FOE_MARK, 1)
      }
    }
  }

  /** a red flash round the edge of the frame when the player is hit */
  function drawHurt() {
    if (hurt <= 0.01) return
    const band = Math.max(3, Math.round(Math.min(W, H) * 0.09))
    const _fb = fb
    for (let y = 0; y < H; y++) {
      const ey = Math.min(y, H - 1 - y)
      for (let x = 0; x < W; x++) {
        const e = Math.min(ey, x, W - 1 - x)
        if (e >= band) { if (ey >= band) x = Math.max(x, W - 1 - band); continue }
        const a = hurt * (1 - e / band)
        if (a * 16 > BAYER[((y & 3) << 2) | (x & 3)]) {
          const bg = _fb[y * W + x]
          const r = Math.min(255, (bg & 255) * 0.5 + 150)
          const g = ((bg >> 8) & 255) * 0.35
          const b = ((bg >> 16) & 255) * 0.35
          _fb[y * W + x] = pack(r, g, b)
        }
      }
    }
  }

  function render() {
    if (W === 0) return bytes
    updateView()
    frameH = H
    flameOut.count = 0
    // in the cockpit the view rolls with the jet, so the world goes onto the square sheet first
    const rolled = vK > 0 || vRoll !== 0
    const w0 = W
    const h0 = H
    const f0 = fb
    const c0 = colY
    const m0 = jetMask
    const z0 = zbuf
    const b0 = backdrop
    const y0 = vCy
    if (rolled) {
      W = sheetSide
      H = sheetSide
      fb = sheet
      colY = sheetColY
      jetMask = sheetMask
      zbuf = sheetZ
      backdrop = sheetBackdrop
      const half = sheetSide >> 1
      vCx = half
      vCy = half + (y0 - pivotY)
      // only the part of the sheet the turned frame can see is drawn
      const c = Math.abs(Math.cos(vRoll))
      const s = Math.abs(Math.sin(vRoll))
      colLo = Math.max(0, half - Math.ceil(c * (w0 / 2) + s * Math.max(pivotY, h0 - pivotY)) - 2)
      colHi = Math.min(sheetSide, half + Math.ceil(c * (w0 / 2) + s * Math.max(pivotY, h0 - pivotY)) + 2)
      rowLo = Math.max(0, half - Math.ceil(c * pivotY + s * (w0 / 2)) - 2)
      rowHi = Math.min(sheetSide, half + Math.ceil(c * (h0 - pivotY) + s * (w0 / 2)) + 2)
    } else {
      colLo = 0
      colHi = W
      rowLo = 0
      rowHi = H
    }
    drawWorld()
    drawSky()
    drawTrails()
    drawSmoke()
    drawGameWorld()
    // far jets first; the player is not drawn while shot down, and blinks while coming back
    const blink = shield > 0 && ((time * 12) | 0) & 1
    const order: { j: Jet; i: number; d: number }[] = []
    jets.forEach((j, i) => {
      if (i === 0 && (playerDead >= 0 || blink)) return
      order.push({ j, i, d: (j.x - cam.x) * vSin + (j.y - cam.y) * vCos })
    })
    foes.forEach((j, i) => {
      if (j.dead >= 0) return
      order.push({ j, i: 3 + i, d: (j.x - cam.x) * vSin + (j.y - cam.y) * vCos })
    })
    order.sort((a, b) => a.d - b.d)
    for (const e of order) drawJet(e.j, e.i)
    drawCombat()
    drawGameShots()
    drawMarkers(rolled)
    if (!rolled) drawGameMarkers()
    if (rolled) {
      W = w0
      H = h0
      fb = f0
      colY = c0
      jetMask = m0
      zbuf = z0
      backdrop = b0
      vCx = W >> 1
      vCy = y0
      turnSheet()
      // the smooth flames were placed on the sheet: turn them with it
      const half = sheetSide >> 1
      const rc = Math.cos(vRoll)
      const rs = Math.sin(vRoll)
      for (let i = 0; i < flameOut.count; i++) {
        for (let n = 0; n < 3; n++) {
          const o = i * FLAME_F + n * 2
          const dx = flameData[o] - half
          const dy = flameData[o + 1] - half
          flameData[o] = (W >> 1) + rc * dx + rs * dy
          flameData[o + 1] = pivotY - rs * dx + rc * dy
        }
      }
      drawCockpitView()
    }
    drawHurt()
    return bytes
  }

  return {
    setParams,
    resize,
    pointerMove,
    pointerLeave,
    press,
    release,
    replayIntro,
    toggleView,
    setKeys,
    /** hold the guns down (true) or let go (false) */
    setGuns(on: boolean) { gunHeld = on },
    /** launch one missile: it homes on the locked enemy, or flies straight with no lock */
    fireMissile() { missileQueued = true },
    step,
    render,
    /** start a new game at wave 1 */
    startGame,
    /** stop the game and go back to the jet flying on its own */
    endGame,
    /** between two waves: take an upgrade, and the next wave starts */
    chooseUpgrade,
    /** let go of one bomb */
    dropBomb() { bombQueued = true },
    /** an aileron roll */
    roll() { startRoll() },
    /** fire the guns on their own when an enemy is in front (touch screens) */
    setAutoGuns(on: boolean) { autoGuns = on },
    /** what happened since the last call, for the sounds: 'gun', 'boom', 'hurt', … */
    drainEvents() { const e = events; events = []; return e },
    /** the game, for the screens and the display over the picture */
    get game() {
      const lead = jets[0]
      return {
        phase,
        wave,
        score,
        hull: playerDead >= 0 ? 0 : Math.max(0, Math.round(lead.hp)),
        down: playerDead >= 0,
        bombs: bombsLeft,
        bombsMax: BOMB_MAX,
        bombRegen: bombsLeft === 0 ? bombRegen / BOMB_REGEN : 0,
        missiles: missilesLeft,
        missilesMax: MSL_MAX,
        lock: lockFoe < 0 ? 0 : lockT >= LOCK_TIME ? 2 : 1,
        jets: foeQueue + foes.filter((f) => f.dead < 0).length,
        guns: sites.filter((s) => s.dead < 0 && s.mount < 0).length,
        boss: ship && ship.dead < 0 ? Math.max(0, ship.hp / ship.max) : -1,
        incoming: samWarn < 0.4,
        upgrades: { speed: upSpeed, armor: upArmor, damage: upDamage },
        steps: UPGRADE_STEP,
      }
    },
    /** for the automatic tests and the demo video: where everything is */
    get debug() {
      const lead = jets[0]
      return {
        lead: { x: lead.x, y: lead.y, z: lead.z, yaw: lead.yaw },
        sites: sites.filter((s) => s.dead < 0).map((s) => ({ x: s.x, y: s.y, kind: s.kind })),
        foes: foes.filter((f) => f.dead < 0).map((f) => ({ x: f.x, y: f.y, z: f.z })),
        crates: crates.map((c) => ({ x: c.x, y: c.y })),
        ship: ship && ship.dead < 0 ? { x: ship.x, y: ship.y } : null,
        impact: bombImpact(),
      }
    },
    /** for the tests and the demo video: move the jet (and the camera with it) */
    testWarp(x: number, y: number) {
      const dx = x - jets[0].x
      const dy = y - jets[0].y
      for (const j of jets) { j.x += dx; j.y += dy; j.trailLen = 0; j.lastTrailX = j.x; j.lastTrailY = j.y }
      follow.x += dx
      follow.y += dy
      cam.x += dx
      cam.y += dy
    },
    /** for the tests: win the wave at once, or be shot down */
    testWin() { foeQueue = 0; for (const f of foes) f.dead = 0; for (const x of sites) x.dead = 0; if (ship) ship.dead = 0 },
    testTough() { tough = true },
    testDie() { shield = 0; hitPlayer(999, jets[0].x, jets[0].y, jets[0].z) },
    /** for the tests: jump to a wave */
    testWave(n: number) { if (playing()) { clearBattle(); startWave(n) } },
    /** the score and the weapons, for the display over the picture */
    get combat() {
      const lead = jets[0]
      return {
        kills,
        losses,
        hull: playerDead >= 0 ? 0 : Math.max(0, Math.round(lead.hp)),
        down: playerDead >= 0,
        missiles: missilesLeft,
        missilesMax: MSL_MAX,
        reload: missilesLeft < MSL_MAX ? reload / MSL_RELOAD : 1,
        lock: lockFoe < 0 ? 0 : lockT >= LOCK_TIME ? 2 : 1,
        enemies: foes.filter((f) => f.dead < 0).length,
      }
    },
    get width() { return W },
    get height() { return H },
    /** the smooth flames to lay over this frame (none while the flames are drawn in pixels) */
    get flames() { return flameOut },
    /** the view the camera is in, or heading for */
    get view(): ViewMode { return viewTarget === 2 ? 'cockpit' : viewTarget === 1 ? 'chase' : 'top' },
  }
}

export type Scene = ReturnType<typeof createScene>
