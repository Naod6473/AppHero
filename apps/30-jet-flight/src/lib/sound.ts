// Les sons du jeu, fabriqués à la volée avec Web Audio : aucun fichier à charger.
// Chaque événement du moteur ('gun', 'boom', 'hurt'…) joue un petit son synthétisé.

type Sound = {
  play(event: string): void
  unlock(): void
  setMuted(muted: boolean): void
  readonly muted: boolean
}

const KEY = 'jetflight-son'

export function createSound(): Sound {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noise: AudioBuffer | null = null
  let muted = false
  try { muted = localStorage.getItem(KEY) === 'off' } catch { /* stockage indisponible */ }
  const last: Record<string, number> = {}

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.55
      // un compresseur doux, pour que les explosions en série ne saturent pas
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.ratio.value = 6
      master.connect(comp)
      comp.connect(ctx.destination)
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const d = noise.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') void ctx.resume()
  }

  /** a burst of noise through a filter, with a quick attack and a decay */
  function hiss(opts: { dur: number; vol: number; type: BiquadFilterType; from: number; to?: number; q?: number; delay?: number }) {
    if (!ctx || !master || !noise) return
    const t = ctx.currentTime + (opts.delay || 0)
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const f = ctx.createBiquadFilter()
    f.type = opts.type
    f.Q.value = opts.q ?? 0.8
    f.frequency.setValueAtTime(opts.from, t)
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.vol, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
    src.connect(f)
    f.connect(g)
    g.connect(master)
    src.start(t, Math.random() * 1.5)
    src.stop(t + opts.dur + 0.05)
  }

  /** a tone that slides from one pitch to another */
  function tone(opts: { dur: number; vol: number; type: OscillatorType; from: number; to?: number; delay?: number }) {
    if (!ctx || !master) return
    const t = ctx.currentTime + (opts.delay || 0)
    const o = ctx.createOscillator()
    o.type = opts.type
    o.frequency.setValueAtTime(opts.from, t)
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
    o.connect(g)
    g.connect(master)
    o.start(t)
    o.stop(t + opts.dur + 0.05)
  }

  const notes = (freqs: number[], step: number, type: OscillatorType, vol: number, len = step * 1.6) =>
    freqs.forEach((f, i) => tone({ dur: len, vol, type, from: f, delay: i * step }))

  function play(event: string) {
    if (!ctx || muted) return
    // the same sound too often is just noise
    const now = ctx.currentTime
    const gap = event === 'gun' ? 0.06 : event === 'hit' ? 0.05 : event === 'flak' || event === 'flak-fire' ? 0.08 : 0.03
    if (now - (last[event] || 0) < gap) return
    last[event] = now
    switch (event) {
      case 'gun':
        hiss({ dur: 0.05, vol: 0.22, type: 'bandpass', from: 2200, q: 1.2 })
        tone({ dur: 0.04, vol: 0.12, type: 'square', from: 160, to: 70 })
        break
      case 'hit':
        tone({ dur: 0.04, vol: 0.08, type: 'square', from: 1400, to: 900 })
        break
      case 'boom-s':
        hiss({ dur: 0.4, vol: 0.4, type: 'lowpass', from: 1500, to: 120 })
        break
      case 'boom':
        hiss({ dur: 0.75, vol: 0.6, type: 'lowpass', from: 1200, to: 80 })
        tone({ dur: 0.5, vol: 0.45, type: 'sine', from: 110, to: 38 })
        break
      case 'boom-big':
        hiss({ dur: 1.3, vol: 0.8, type: 'lowpass', from: 1800, to: 60 })
        tone({ dur: 0.9, vol: 0.6, type: 'sine', from: 90, to: 30 })
        hiss({ dur: 0.5, vol: 0.3, type: 'highpass', from: 3000, delay: 0.05 })
        break
      case 'flak':
        hiss({ dur: 0.35, vol: 0.45, type: 'lowpass', from: 700, to: 90 })
        break
      case 'flak-fire':
        hiss({ dur: 0.12, vol: 0.12, type: 'lowpass', from: 500, to: 150 })
        break
      case 'bomb':
        tone({ dur: 0.08, vol: 0.15, type: 'square', from: 220, to: 120 })
        tone({ dur: 1.0, vol: 0.06, type: 'sine', from: 1500, to: 520, delay: 0.05 })
        break
      case 'splash':
        hiss({ dur: 0.6, vol: 0.4, type: 'highpass', from: 900, to: 400 })
        break
      case 'sam':
        notes([988, 740, 988, 740], 0.11, 'square', 0.09, 0.09)
        break
      case 'hurt':
        tone({ dur: 0.16, vol: 0.18, type: 'sawtooth', from: 140, to: 70 })
        break
      case 'dead':
        hiss({ dur: 1.6, vol: 0.9, type: 'lowpass', from: 2000, to: 50 })
        tone({ dur: 1.4, vol: 0.25, type: 'triangle', from: 440, to: 55, delay: 0.2 })
        break
      case 'pick-repair':
      case 'pick-bombs':
      case 'pick-missiles':
        notes([523, 659, 784, 1047], 0.07, 'triangle', 0.22)
        break
      case 'wave':
        notes([392, 523], 0.16, 'square', 0.1, 0.22)
        break
      case 'clear':
        notes([523, 659, 784, 659, 1047], 0.11, 'square', 0.1)
        break
      case 'over':
        notes([392, 330, 262], 0.22, 'triangle', 0.22, 0.3)
        break
      case 'click':
        tone({ dur: 0.05, vol: 0.12, type: 'square', from: 660 })
        break
    }
  }

  return {
    play,
    unlock,
    setMuted(m: boolean) {
      muted = m
      try { localStorage.setItem(KEY, m ? 'off' : 'on') } catch { /* stockage indisponible */ }
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02)
    },
    get muted() { return muted },
  }
}
