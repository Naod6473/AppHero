import { useEffect, useRef, useState } from 'react'
import { createScene, DEFAULT_PARAMS } from '../lib/scene'
import type { Scene, SceneParams, ViewMode } from '../lib/scene'
import { createFlameLayer } from '../lib/flame-layer'
import type { FlameLayer } from '../lib/flame-layer'
import { createSound } from '../lib/sound'
import { cleanName, fetchTop, readName, readRecord, saveRecord, sendScore } from '../lib/scores'
import type { Entry } from '../lib/scores'

// Jet Flight : le jeu autour de la scène. Écran titre, vagues, améliorations, fin de partie.

type Game = Scene['game']
type Upgrade = 'speed' | 'armor' | 'damage'

const PARAMS: SceneParams = { ...DEFAULT_PARAMS, enemies: 0, intro: true }
const SHARE_URL = 'https://apphero.cloud/30'

const VIEW_NAMES: Record<ViewMode, string> = { top: 'Vue de dessus', chase: 'Vue de poursuite', cockpit: 'Vue cockpit' }

// les touches qui pilotent : tourner, monter / descendre, le boost
const FLY: Record<string, 'left' | 'right' | 'up' | 'down' | 'boost'> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  TouchBoost: 'boost',
}
const GUN_KEYS = new Set(['KeyJ'])
const BOMB_KEYS = new Set(['KeyK', 'KeyB'])
const MISSILE_KEYS = new Set(['KeyL'])

const gameKey = (g: Game) =>
  [g.phase, g.wave, g.score, g.hull, g.down, g.bombs, Math.floor(g.bombRegen * 8), g.missiles, g.lock, g.jets, g.guns, Math.round(g.boss * 50), g.incoming,
    g.upgrades.speed, g.upgrades.armor, g.upgrades.damage].join('|')

const fmt = (n: number) => n.toLocaleString('fr-FR')

const UPGRADES: { key: Upgrade; name: string; text: string; icon: string }[] = [
  { key: 'speed', name: 'Vitesse', text: 'Ton avion vole plus vite.', icon: 'M4 12h10M4 7h7M4 17h7M14 6l6 6-6 6' },
  { key: 'armor', name: 'Armure', text: 'Ta coque encaisse mieux les coups.', icon: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z' },
  { key: 'damage', name: 'Dégâts', text: 'Tes balles et tes bombes frappent plus fort.', icon: 'M13 2 4 14h7l-1 8 9-12h-7z' },
]

export default function JetFlight() {
  const [noFire, setNoFire] = useState(false)
  const [fingerScreen, setFingerScreen] = useState(false)
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) setFingerScreen(true)
  }, [])
  const [game, setGame] = useState<Game | null>(null)
  const [view, setView] = useState<ViewMode>('top')
  const [viewNote, setViewNote] = useState(0)
  const [banner, setBanner] = useState<{ text: string; sub?: string; id: number } | null>(null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [boosting, setBoosting] = useState(false)
  const [firing, setFiring] = useState(false)
  const [record, setRecord] = useState(readRecord)
  const [newRecord, setNewRecord] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fireRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const soundRef = useRef(createSound())
  const pausedRef = useRef(false)
  const scaleRef = useRef(4)
  const heldRef = useRef(new Set<string>())
  const gunsRef = useRef(new Set<string>())
  const sendKeysRef = useRef<() => void>(() => {})
  const mouseButtonsRef = useRef(0)
  const steerRef = useRef<{ id: number; t: number; x: number; y: number; moved: boolean } | null>(null)
  const phaseRef = useRef<Game['phase']>('demo')
  const actionsRef = useRef({ start: () => {}, pause: (_on: boolean) => {}, upgrade: (_k: Upgrade) => {}, menu: () => {} })

  useEffect(() => setMuted(soundRef.current.muted), [])
  const buttons = fingerScreen
  useEffect(() => sceneRef.current?.setAutoGuns(buttons), [buttons])

  const sendGuns = () => sceneRef.current?.setGuns(gunsRef.current.size > 0)
  const say = (text: string, sub?: string) => setBanner({ text, sub, id: Math.random() })
  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(null), 2200)
    return () => window.clearTimeout(t)
  }, [banner])
  useEffect(() => {
    if (!viewNote) return
    const t = window.setTimeout(() => setViewNote(0), 1600)
    return () => window.clearTimeout(t)
  }, [viewNote])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scene = createScene(PARAMS)
    sceneRef.current = scene
    if (new URLSearchParams(location.search).has('test')) (window as unknown as { jf: Scene }).jf = scene
    scene.setAutoGuns(window.matchMedia?.('(pointer: coarse)').matches ?? false)
    const sound = soundRef.current
    let image: ImageData | null = null
    const fire = fireRef.current
    let layer: FlameLayer | null = null
    let fireDead = false
    const onFireLost = (e: Event) => {
      e.preventDefault()
      layer = null
      fireDead = true
      setNoFire(true)
    }
    fire?.addEventListener('webglcontextlost', onFireLost)

    const layout = () => {
      const cw = wrap.clientWidth
      const ch = wrap.clientHeight
      if (!cw || !ch) return
      const px = Math.min(12, Math.max(2, Math.round(Math.sqrt((cw * ch) / 100000))))
      const lw = Math.ceil(cw / px)
      const lh = Math.ceil(ch / px)
      if (canvas.width !== lw || canvas.height !== lh) {
        canvas.width = lw
        canvas.height = lh
        scene.resize(lw, lh)
        image = null
      }
      canvas.style.width = lw * px + 'px'
      canvas.style.height = lh * px + 'px'
      canvas.style.left = Math.round((cw - lw * px) / 2) + 'px'
      canvas.style.top = Math.round((ch - lh * px) / 2) + 'px'
      if (fire) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const fw = Math.round(lw * px * dpr)
        const fh = Math.round(lh * px * dpr)
        if (fire.width !== fw || fire.height !== fh) {
          fire.width = fw
          fire.height = fh
        }
        fire.style.width = canvas.style.width
        fire.style.height = canvas.style.height
        fire.style.left = canvas.style.left
        fire.style.top = canvas.style.top
      }
      scaleRef.current = px
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(wrap)

    let raf = 0
    let last = performance.now()
    let lastStats = 0
    let statsKey = ''
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      if (!scene.width) return
      if (!pausedRef.current) scene.step(dt)
      const bytes = scene.render()
      if (!image) image = new ImageData(bytes as unknown as Uint8ClampedArray<ArrayBuffer>, scene.width, scene.height)
      ctx.putImageData(image, 0, 0)
      const flames = scene.flames
      if (fire && flames.count > 0 && !layer && !fireDead) {
        layer = createFlameLayer(fire)
        if (!layer) {
          fireDead = true
          setNoFire(true)
        }
      }
      if (fire && layer) layer.draw(flames.count, flames.data, fire.width / scene.width, now / 1000)
      // the sounds, and the moments the screens care about
      for (const e of scene.drainEvents()) {
        sound.play(e)
        const g = scene.game
        if (e === 'wave') say(`Vague ${g.wave}`, g.wave % 5 === 0 ? 'Un navire de guerre approche !' : g.wave === 1 ? 'Abats les jets, bombarde la DCA' : undefined)
        else if (e === 'pick-repair') say('Réparation', '+35 % de coque')
        else if (e === 'pick-bombs') say('Bombes', '+3 bombes')
        else if (e === 'pick-missiles') say('Missiles', '+2 missiles')
        else if (e === 'over') {
          const best = saveRecord(g.score, g.wave)
          setNewRecord(best)
          setRecord(readRecord())
        }
      }
      if (now - lastStats > 90) {
        lastStats = now
        const g = scene.game
        phaseRef.current = g.phase
        const key = gameKey(g)
        if (key !== statsKey) {
          statsKey = key
          setGame(g)
        }
      }
    }
    raf = requestAnimationFrame(frame)

    const held = heldRef.current
    held.clear()
    const guns = gunsRef.current
    guns.clear()
    const sendKeys = () => {
      let turn = 0
      let climb = 0
      let boost = false
      held.forEach((code) => {
        const k = FLY[code]
        if (k === 'left') turn -= 1
        else if (k === 'right') turn += 1
        else if (k === 'up') climb += 1
        else if (k === 'down') climb -= 1
        else if (k === 'boost') boost = true
      })
      scene.setKeys(turn, climb, boost)
    }
    sendKeysRef.current = sendKeys
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el && el !== wrap && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
    }
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const phase = phaseRef.current
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (phase === 'wave' || phase === 'between') actionsRef.current.pause(!pausedRef.current)
        return
      }
      if (phase === 'demo' && (e.code === 'Enter' || e.code === 'NumpadEnter')) { e.preventDefault(); actionsRef.current.start(); return }
      if (phase === 'over' && (e.code === 'Enter' || e.code === 'NumpadEnter') && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); actionsRef.current.start(); return }
      if (phase === 'between' && /^(Digit|Numpad)[123]$/.test(e.code)) {
        actionsRef.current.upgrade(UPGRADES[Number(e.code.slice(-1)) - 1].key)
        return
      }
      if (e.code === 'Space' || e.key === ' ') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return
        e.preventDefault()
        if (e.repeat) return
        scene.toggleView()
        setView(scene.view)
        setViewNote(Math.random())
        return
      }
      if (GUN_KEYS.has(e.code)) { guns.add(e.code); scene.setGuns(true); return }
      if (BOMB_KEYS.has(e.code)) { if (!e.repeat) scene.dropBomb(); return }
      if (MISSILE_KEYS.has(e.code)) { if (!e.repeat) scene.fireMissile(); return }
      if (e.code === 'KeyR') { if (!e.repeat) scene.roll(); return }
      if (FLY[e.code]) {
        if (e.code.startsWith('Arrow')) e.preventDefault()
        held.add(e.code)
        sendKeys()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (held.delete(e.code)) sendKeys()
      if (guns.delete(e.code)) scene.setGuns(guns.size > 0)
    }
    const onBlur = () => {
      held.clear()
      sendKeys()
      guns.clear()
      scene.setGuns(false)
      mouseButtonsRef.current = 0
      setBoosting(false)
      setFiring(false)
      const phase = phaseRef.current
      if (phase === 'wave' || phase === 'between') actionsRef.current.pause(true)
    }
    const onHide = () => { if (document.hidden) onBlur() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onHide)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onHide)
      fire?.removeEventListener('webglcontextlost', onFireLost)
      layer?.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    if (noFire) sceneRef.current?.setParams({ ...PARAMS, flameStyle: 'pixel' })
  }, [noFire])

  // ── what the screens do
  const focusGame = () => wrapRef.current?.focus({ preventScroll: true })
  const start = () => {
    const scene = sceneRef.current
    if (!scene) return
    soundRef.current.unlock()
    soundRef.current.play('click')
    setPaused(false)
    pausedRef.current = false
    setNewRecord(false)
    setShowHelp(false)
    scene.startGame()
    phaseRef.current = 'wave'
    focusGame()
  }
  const pause = (on: boolean) => {
    pausedRef.current = on
    setPaused(on)
    if (on) {
      gunsRef.current.clear()
      sendGuns()
    } else focusGame()
  }
  const upgrade = (k: Upgrade) => {
    soundRef.current.play('click')
    sceneRef.current?.chooseUpgrade(k)
    focusGame()
  }
  const menu = () => {
    setPaused(false)
    pausedRef.current = false
    sceneRef.current?.endGame()
    phaseRef.current = 'demo'
  }
  actionsRef.current = { start, pause, upgrade, menu }
  const toggleMute = () => {
    soundRef.current.unlock()
    soundRef.current.setMuted(!soundRef.current.muted)
    setMuted(soundRef.current.muted)
  }
  const nextView = () => {
    const scene = sceneRef.current
    if (!scene) return
    scene.toggleView()
    setView(scene.view)
    setViewNote(Math.random())
    focusGame()
  }

  const phase = game?.phase ?? 'demo'
  const inGame = phase === 'wave' || phase === 'between'

  // ── the mouse: left button holds the guns, right drops a bomb, middle launches a missile
  const toScene = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / scaleRef.current, (e.clientY - r.top) / scaleRef.current] as const
  }
  const mouseButtons = (e: React.PointerEvent) => {
    const scene = sceneRef.current
    if (!scene) return
    const now = e.buttons
    const was = mouseButtonsRef.current
    mouseButtonsRef.current = now
    const down = (bit: number) => (was & bit) === 0 && (now & bit) !== 0
    const up = (bit: number) => (was & bit) !== 0 && (now & bit) === 0
    if (!inGame || paused) {
      gunsRef.current.delete('Mouse')
      sendGuns()
      return
    }
    if (down(1)) { gunsRef.current.add('Mouse'); sendGuns() }
    if (up(1)) { gunsRef.current.delete('Mouse'); sendGuns() }
    if (down(2)) scene.dropBomb()
    if (down(4)) scene.fireMissile()
  }
  const mouseGone = () => {
    mouseButtonsRef.current = 0
    if (gunsRef.current.delete('Mouse')) sendGuns()
    sceneRef.current?.pointerLeave()
  }

  // ── fingers: one steers (a quick tap rolls), the buttons do the rest
  const byFinger = (e: React.PointerEvent) => e.pointerType === 'touch'
  const endFinger = (e: React.PointerEvent, tap: boolean) => {
    const s = steerRef.current
    if (!s || s.id !== e.pointerId) return
    steerRef.current = null
    const scene = sceneRef.current
    if (!scene) return
    if (tap && !s.moved && performance.now() - s.t < 260 && inGame) scene.roll()
    scene.pointerLeave()
  }
  const mine = (e: React.SyntheticEvent) => e.stopPropagation()
  const capture = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* déjà fini */ }
  }
  const boostOn = (e: React.PointerEvent<HTMLButtonElement>) => {
    capture(e)
    heldRef.current.add('TouchBoost')
    sendKeysRef.current()
    setBoosting(true)
  }
  const boostOff = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    heldRef.current.delete('TouchBoost')
    sendKeysRef.current()
    setBoosting(false)
  }
  const fireOn = (e: React.PointerEvent<HTMLButtonElement>) => {
    capture(e)
    gunsRef.current.add('TouchFire')
    sendGuns()
    setFiring(true)
  }
  const fireOff = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    gunsRef.current.delete('TouchFire')
    sendGuns()
    setFiring(false)
  }

  const pad = (side: 'left' | 'right', n: number) => `calc(max(14px, env(safe-area-inset-${side})) + ${n}px)`
  const low = (n: number) => `calc(max(14px, env(safe-area-inset-bottom)) + ${n}px)`
  const touchBtn =
    'absolute flex flex-col cursor-pointer select-none items-center justify-center rounded-2xl border-[3px] font-mono text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-white outline-none transition-colors duration-100'
  const glass = 'border-white/40 bg-[#0b1a33]/55'
  const hudText = 'font-mono text-[11px] uppercase leading-none tracking-[0.14em] text-white/90'

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      className="relative h-screen min-h-[320px] w-full touch-none select-none overflow-hidden bg-[#2468b4] outline-none"
      style={{ cursor: inGame && !paused ? 'crosshair' : 'default', height: '100dvh', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => {
        if (byFinger(e)) {
          const s = steerRef.current
          if (!s || s.id !== e.pointerId) return
          if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) s.moved = true
        }
        const [x, y] = toScene(e)
        sceneRef.current?.pointerMove(x, y)
        if (!byFinger(e)) mouseButtons(e)
      }}
      onPointerDown={(e) => {
        const [x, y] = toScene(e)
        if (byFinger(e)) {
          if (!fingerScreen) setFingerScreen(true)
          if (steerRef.current) return
          steerRef.current = { id: e.pointerId, t: performance.now(), x: e.clientX, y: e.clientY, moved: false }
          sceneRef.current?.pointerMove(x, y)
        } else {
          if (e.button === 1) e.preventDefault()
          sceneRef.current?.pointerMove(x, y)
          mouseButtons(e)
        }
        focusGame()
      }}
      onPointerUp={(e) => {
        if (byFinger(e)) endFinger(e, true)
        else mouseButtons(e)
      }}
      onPointerLeave={(e) => {
        if (byFinger(e)) endFinger(e, false)
        else mouseGone()
      }}
      onPointerCancel={(e) => {
        if (byFinger(e)) endFinger(e, false)
        else mouseGone()
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Jet Flight : un avion de chasse en pixel art au-dessus des îles, face aux jets ennemis et à la DCA."
        role="img"
        className="absolute block"
        style={{ imageRendering: 'pixelated' }}
      />
      <canvas ref={fireRef} aria-hidden="true" className="pointer-events-none absolute block" />

      {/* ── en vol : score, coque, armes */}
      {game && phase !== 'demo' && (
        <div
          className="pointer-events-none absolute flex flex-col gap-1.5 rounded-[4px] bg-[#0b1a33]/60 px-2.5 py-2"
          style={{ left: 'max(12px, env(safe-area-inset-left))', top: 'max(12px, env(safe-area-inset-top))', textShadow: '0 1px 0 rgba(0,0,0,.45)' }}
        >
          <div className={`${hudText} flex items-baseline gap-3`}>
            <span>Score <b className="font-bold text-white">{fmt(game.score)}</b></span>
            <span className="text-[#ffd640]">Vague {game.wave}</span>
          </div>
          <div className={`${hudText} flex items-center gap-2`}>
            <span className="w-[4.7rem]">{game.down ? 'Abattu' : 'Coque'}</span>
            <span className="relative h-[7px] w-24 bg-white/15">
              <span className="absolute inset-y-0 left-0" style={{ width: `${game.hull}%`, backgroundColor: game.hull > 50 ? '#7fe08a' : game.hull > 25 ? '#ffd24a' : '#ff5a44' }} />
            </span>
          </div>
          <div className={`${hudText} flex items-center gap-2`}>
            <span className="w-[4.7rem]">Bombes</span>
            <span className="flex gap-[3px]">
              {Array.from({ length: Math.max(game.bombsMax, game.bombs) }, (_, i) => (
                <span key={i} className="h-[8px] w-[8px] rounded-full" style={{ backgroundColor: i < game.bombs ? '#ffd640' : i === 0 && game.bombRegen > 0 ? `rgba(255,214,64,${0.15 + game.bombRegen * 0.6})` : 'rgba(255,255,255,.15)' }} />
              ))}
            </span>
          </div>
          <div className={`${hudText} flex items-center gap-2`}>
            <span className="w-[4.7rem]">Missiles</span>
            <span className="flex gap-[3px]">
              {Array.from({ length: game.missilesMax }, (_, i) => (
                <span key={i} className="h-[9px] w-[4px]" style={{ backgroundColor: i < game.missiles ? '#eef2f8' : 'rgba(255,255,255,.15)' }} />
              ))}
            </span>
            {game.lock > 0 && <span className={game.lock === 2 ? 'font-bold text-[#ff6a52]' : 'text-[#ffd640]'}>{game.lock === 2 ? 'Verrouillé' : 'Visée'}</span>}
          </div>
          {phase === 'wave' && (
            <div className={`${hudText} flex items-center gap-3 text-white/75`}>
              <span>Jets <b className="text-white">{game.jets}</b></span>
              <span>DCA <b className="text-[#ffb020]">{game.guns}</b></span>
            </div>
          )}
        </div>
      )}

      {/* le navire de guerre */}
      {game && game.boss >= 0 && phase === 'wave' && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: buttons ? 'max(12px, env(safe-area-inset-top))' : 'max(14px, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 rounded-[4px] bg-[#0b1a33]/60 px-3 py-2" style={{ marginTop: buttons ? 0 : 0 }}>
            <span className={`${hudText} text-[#ffb020]`}>Navire</span>
            <span className="relative h-[8px] w-36 bg-white/15 sm:w-56">
              <span className="absolute inset-y-0 left-0 bg-[#ff5a44]" style={{ width: `${game.boss * 100}%` }} />
            </span>
          </div>
        </div>
      )}

      {/* messages au centre */}
      {inGame && game?.incoming && !game.down && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: '22%' }}>
          <p className="animate-pulse rounded-[4px] bg-[#c0261a]/85 px-3 py-2 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white">Missile en approche ! Vire fort</p>
        </div>
      )}
      {banner && inGame && (
        <div key={banner.id} className="jf-banner pointer-events-none absolute inset-x-0 flex flex-col items-center gap-1 px-4" style={{ top: '30%' }}>
          <p className="jf-title text-center text-[44px] leading-none text-white sm:text-[64px]">{banner.text}</p>
          {banner.sub && <p className="rounded-[4px] bg-[#0b1a33]/60 px-3 py-1.5 text-center font-mono text-[12px] uppercase tracking-[0.14em] text-white">{banner.sub}</p>}
        </div>
      )}
      {viewNote !== 0 && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: buttons ? low(150) : '18px' }}>
          <p className={`${hudText} rounded-[4px] bg-[#0b1a33]/60 px-3 py-2`}>{VIEW_NAMES[view]}</p>
        </div>
      )}

      {/* son et pause */}
      <div className="absolute flex gap-2" style={{ right: 'max(12px, env(safe-area-inset-right))', top: 'max(12px, env(safe-area-inset-top))' }} onPointerDown={mine} onPointerUp={mine} onPointerMove={mine}>
        <button type="button" className="jf-icon" onClick={toggleMute} aria-label={muted ? 'Remettre le son' : 'Couper le son'} title={muted ? 'Remettre le son' : 'Couper le son'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
            {muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
          </svg>
        </button>
        {inGame && (
          <button type="button" className="jf-icon" onClick={() => pause(!paused)} aria-label="Pause" title="Pause (Échap)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          </button>
        )}
      </div>

      {/* ── les boutons tactiles */}
      {buttons && inGame && !paused && (
        <>
          <button type="button" aria-label="Changer de vue" className={`${touchBtn} ${glass} h-14 w-16 active:bg-[#0b1a33]/90`} style={{ left: pad('left', 0), bottom: low(74), touchAction: 'none' }}
            onClick={nextView} onPointerDown={mine} onPointerMove={mine} onPointerUp={mine}>Vue</button>
          <button type="button" aria-label="Boost : maintenir" aria-pressed={boosting} className={`${touchBtn} h-16 w-16 ${boosting ? 'border-white bg-[#f0580e]' : glass}`} style={{ left: pad('left', 0), bottom: low(0), touchAction: 'none' }}
            onPointerDown={boostOn} onPointerMove={mine} onPointerUp={boostOff} onPointerCancel={boostOff} onLostPointerCapture={boostOff} onContextMenu={(e) => e.preventDefault()}>Boost</button>
          <button type="button" aria-label="Tir : maintenir" aria-pressed={firing} className={`${touchBtn} h-20 w-20 rounded-full ${firing ? 'border-white bg-[#ffd640]/90 text-[#0b1a33]' : glass}`} style={{ right: pad('right', 0), bottom: low(0), touchAction: 'none' }}
            onPointerDown={fireOn} onPointerMove={mine} onPointerUp={fireOff} onPointerCancel={fireOff} onLostPointerCapture={fireOff} onContextMenu={(e) => e.preventDefault()}>Feu</button>
          <button type="button" aria-label={`Lâcher une bombe (${game?.bombs ?? 0})`} disabled={!game || game.bombs === 0} className={`${touchBtn} ${glass} h-16 w-16 gap-1 active:bg-[#ffd640]/80 disabled:opacity-40`} style={{ right: pad('right', 92), bottom: low(0), touchAction: 'none' }}
            onPointerDown={(e) => { e.stopPropagation(); sceneRef.current?.dropBomb() }} onPointerMove={mine} onPointerUp={mine} onContextMenu={(e) => e.preventDefault()}>Bombe<span className="text-[13px] text-[#ffd640]">{game?.bombs ?? 0}</span></button>
          <button type="button" aria-label={`Lancer un missile (${game?.missiles ?? 0})`} disabled={!game || game.missiles === 0} className={`${touchBtn} h-14 w-16 gap-1 ${game?.lock === 2 ? 'border-[#ff6a52] bg-[#ff6a52]/40' : glass} active:bg-[#0b1a33]/90 disabled:opacity-40`} style={{ right: pad('right', 8), bottom: low(96), touchAction: 'none' }}
            onPointerDown={(e) => { e.stopPropagation(); sceneRef.current?.fireMissile() }} onPointerMove={mine} onPointerUp={mine} onContextMenu={(e) => e.preventDefault()}>Missile<span className="text-[13px]">{game?.missiles ?? 0}</span></button>
        </>
      )}

      {/* ── écran titre */}
      {phase === 'demo' && (
        <Overlay>
          <div className="jf-card w-full max-w-[460px] text-center">
            <p className="jf-tag">Apphéro · App 30/30 · La finale</p>
            <h1 className="jf-title mt-3 text-[64px] leading-[0.9] text-[#f0580e] sm:text-[84px]">Jet Flight</h1>
            <p className="mx-auto mt-4 max-w-[34ch] text-[17px] font-medium leading-snug text-[#15112b]">
              Abats les jets ennemis, bombarde la DCA sur les îles et tiens le plus de vagues possible.
            </p>
            <div className="mt-6"><button type="button" className="jf-cta" onClick={start} autoFocus>Décoller</button></div>
            {record.score > 0 && <p className="mt-4 text-[15px] font-bold text-[#15112b]">Ton record : {fmt(record.score)} pts · vague {record.wave}</p>}
            <button type="button" className="jf-link mt-3" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>{showHelp ? 'Masquer les commandes' : 'Les commandes'}</button>
            {showHelp && <Controls touch={buttons} />}
            <p className="mt-5 text-[14px]">
              <a className="jf-link" href="../">← La présentation de l'app</a>
            </p>
          </div>
        </Overlay>
      )}

      {/* ── entre deux vagues : une amélioration */}
      {phase === 'between' && game && !paused && (
        <Overlay>
          <div className="jf-card w-full max-w-[720px] text-center">
            <p className="jf-tag">Vague {game.wave} terminée · +{fmt(300 * game.wave)} pts · coque réparée</p>
            <h2 className="jf-title mt-3 text-[34px] leading-none text-[#15112b] sm:text-[52px]">Choisis une amélioration</h2>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
              {UPGRADES.map((u, i) => (
                <button key={u.key} type="button" className="jf-upgrade" onClick={() => upgrade(u.key)} autoFocus={i === 0}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={u.icon} /></svg>
                  <span className="jf-title text-[20px] leading-none sm:text-[28px]">{u.name}</span>
                  <span className="text-[20px] font-extrabold text-[#f0580e] sm:text-[24px]">+{game.steps[u.key]} %</span>
                  <span className="hidden text-[14px] leading-snug sm:block">{u.text}</span>
                  <span className="mt-1 text-[12px] font-bold leading-tight opacity-70 sm:text-[13px]">{game.upgrades[u.key] > 0 ? `Déjà +${game.upgrades[u.key]} %` : 'Pas encore pris'}</span>
                  {!buttons && <span className="jf-key">{i + 1}</span>}
                </button>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {/* ── pause */}
      {paused && inGame && (
        <Overlay>
          <div className="jf-card w-full max-w-[420px] text-center">
            <h2 className="jf-title text-[52px] leading-none text-[#15112b]">Pause</h2>
            <p className="mt-2 text-[15px] font-bold">Score {fmt(game?.score ?? 0)} · vague {game?.wave}</p>
            <button type="button" className="jf-cta mt-5" onClick={() => pause(false)} autoFocus>Reprendre</button>
            <div className="mt-4 flex justify-center gap-4">
              <button type="button" className="jf-link" onClick={() => setShowHelp((v) => !v)}>Les commandes</button>
              <button type="button" className="jf-link" onClick={menu}>Abandonner</button>
            </div>
            {showHelp && <Controls touch={buttons} />}
          </div>
        </Overlay>
      )}

      {/* ── fin de partie */}
      {phase === 'over' && game && (
        <Overlay>
          <GameOver score={game.score} wave={game.wave} record={record} newRecord={newRecord} onAgain={start} onMenu={menu} />
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-[#0b1a33]/35 p-4"
      style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', touchAction: 'pan-y', cursor: 'default' }}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
      onContextMenu={stop}
    >
      <div className="m-auto flex w-full justify-center">{children}</div>
    </div>
  )
}

function Controls({ touch }: { touch: boolean }) {
  const rows = touch
    ? [
        ['Diriger', 'Ton doigt sur l\'écran'],
        ['Tirer', 'Feu (et tir tout seul quand un jet est en face)'],
        ['Bombarder', 'Bombe : elle tombe sur la croix jaune'],
        ['Missile', 'Missile : il suit le jet verrouillé'],
        ['Accélérer', 'Boost'],
        ['Tonneau', 'Une petite tape'],
        ['Changer de vue', 'Vue'],
      ]
    : [
        ['Diriger', 'Souris, flèches ou ZQSD'],
        ['Tirer', 'Clic gauche maintenu ou J'],
        ['Bombarder', 'Clic droit ou K : la bombe tombe sur la croix jaune'],
        ['Missile', 'Clic molette ou L : il suit le jet verrouillé'],
        ['Accélérer', 'Maj'],
        ['Tonneau', 'R'],
        ['Changer de vue', 'Espace'],
        ['Pause', 'Échap'],
      ]
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border-[3px] border-[#15112b] bg-white p-3 text-left text-[14px] leading-snug">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-extrabold">{k}</dt>
          <dd className="m-0">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function GameOver({ score, wave, record, newRecord, onAgain, onMenu }: {
  score: number; wave: number; record: { score: number; wave: number }; newRecord: boolean; onAgain: () => void; onMenu: () => void
}) {
  const [top, setTop] = useState<Entry[] | null | undefined>(undefined)
  const [name, setName] = useState(readName)
  const [sent, setSent] = useState<{ rank?: number } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let alive = true
    fetchTop().then((t) => { if (alive) setTop(t) })
    return () => { alive = false }
  }, [])
  const canSend = top !== null && top !== undefined && score > 0 && !sent
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = cleanName(name)
    if (n.length !== 3) { setError('3 lettres ou chiffres, par exemple ACE.'); return }
    setSending(true)
    setError('')
    const r = await sendScore(n, score, wave)
    setSending(false)
    if (!r.ok) { setError(r.error || 'Envoi impossible.'); return }
    setSent({ rank: r.rank })
    if (r.scores) setTop(r.scores)
  }
  const share = async () => {
    const text = `J'ai tenu ${wave} vague${wave > 1 ? 's' : ''} dans Jet Flight, avec ${fmt(score)} points. À toi !`
    try {
      if (navigator.share) { await navigator.share({ title: 'Jet Flight', text, url: SHARE_URL }); return }
    } catch { return }
    try {
      await navigator.clipboard.writeText(`${text} ${SHARE_URL}`)
      setCopied(true)
    } catch { /* presse-papiers indisponible */ }
  }
  const me = cleanName(name)
  return (
    <div className="jf-card w-full max-w-[480px] text-center">
      <p className="jf-tag">Vague {wave}</p>
      <h2 className="jf-title mt-3 text-[56px] leading-none text-[#f0580e]">Abattu !</h2>
      <p className="mt-3 text-[40px] font-extrabold leading-none text-[#15112b]">{fmt(score)} <span className="text-[18px]">pts</span></p>
      <p className="mt-2 text-[15px] font-bold">{newRecord ? 'Nouveau record !' : `Ton record : ${fmt(record.score)} pts · vague ${record.wave}`}</p>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button type="button" className="jf-cta" onClick={onAgain} autoFocus>Rejouer</button>
        <button type="button" className="jf-btn" onClick={share}>{copied ? 'Lien copié' : 'Partager'}</button>
      </div>

      <div className="mt-6 rounded-xl border-[3px] border-[#15112b] bg-white p-3 text-left">
        <h3 className="jf-title text-[24px] leading-none">Le classement</h3>
        {top === undefined && <p className="mt-2 text-[14px]">Chargement…</p>}
        {top === null && <p className="mt-2 text-[14px]">Le classement en ligne n'est pas disponible ici.</p>}
        {canSend && (
          <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={send}>
            <label className="text-[14px] font-bold" htmlFor="jf-name">Tes initiales</label>
            <input
              id="jf-name"
              className="w-[5.5ch] rounded-lg border-[3px] border-[#15112b] px-2 py-1 text-center font-mono text-[20px] font-bold uppercase"
              value={name}
              maxLength={3}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => setName(cleanName(e.target.value))}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button type="submit" className="jf-btn" disabled={sending}>{sending ? 'Envoi…' : 'Envoyer'}</button>
          </form>
        )}
        {error && <p className="mt-2 text-[14px] font-bold text-[#c0261a]">{error}</p>}
        {sent && <p className="mt-2 text-[14px] font-bold">{sent.rank ? `Tu es ${sent.rank === 1 ? '1er' : `${sent.rank}e`} du classement !` : 'Score envoyé.'}</p>}
        {top && top.length > 0 && (
          <ol className="mt-3 grid gap-1 text-[15px]">
            {top.slice(0, 10).map((r, i) => (
              <li key={i} className={`flex items-baseline gap-3 rounded-md px-2 py-0.5 ${sent && r.name === me && r.score === score ? 'bg-[#ffd83d]' : ''}`}>
                <span className="w-6 text-right font-bold opacity-60">{i + 1}</span>
                <span className="w-12 font-mono font-bold">{r.name}</span>
                <span className="flex-1 text-right font-bold">{fmt(r.score)}</span>
                <span className="w-16 text-right text-[13px] opacity-70">vague {r.wave}</span>
              </li>
            ))}
          </ol>
        )}
        {top && top.length === 0 && <p className="mt-2 text-[14px]">Personne pour l'instant. À toi la première place !</p>}
      </div>

      <div className="mt-4 flex justify-center gap-4 text-[14px]">
        <button type="button" className="jf-link" onClick={onMenu}>Menu</button>
        <a className="jf-link" href="../">La présentation de l'app</a>
      </div>
    </div>
  )
}
