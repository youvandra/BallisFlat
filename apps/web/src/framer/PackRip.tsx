// @ts-nocheck: verbatim Framer code component (see shim.ts)
import { addPropertyControls, ControlType, useIsStaticRenderer } from "./shim"
import { motion, useMotionValue, useTransform, useMotionTemplate, animate, useReducedMotion } from "framer-motion"
import { useState, useRef, useEffect, startTransition, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react"
import HoloCard from "./HoloTradingCard"
import { Logo } from "../components/ui/Logo"

/**
 * Pack Rip: a sealed foil booster you tear open by dragging across the top.
 * The legendary card rises out, the pack drops away, and the card stays live (tilt, flip).
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700;800&family=Geist:wght@400;500;600&display=swap"
const HOLO = ["#8EF6FF", "#C9A7FF", "#FFB3D9", "#FFF1A8", "#A0FFC8"]

type CanvasState = "sealed" | "peek" | "revealed"

interface Img {
    src: string
    srcSet?: string
    alt?: string
}

interface PackRipProps {
    foil?: Img
    packTitle: string
    /** Print the BIF logo as the pack title, with packTitle in small type under it. */
    packLogo?: boolean
    packSubtitle: string
    badge: string
    hint: string
    resetLabel: string
    cardImage: Img
    cardName: string
    cardNumber: string
    cardType: string
    cardYear: string
    canvasState: CanvasState
    ink: string
    hintColor: string
    shadow: string
    titleScale: number
    handCount: number
    sound: boolean
    printShadow: string
    printOffset: number
    showReset?: boolean
    cardRarityLabel?: string
    /** App addition: printed over the card art (the binder card's cut-out and shirt number). */
    cardArtOverlay?: ReactNode
    /** App addition: the card's foil and bottom-right set line, so it matches the card it becomes. */
    cardRarity?: "common" | "rare" | "epic" | "legendary"
    cardSetLabel?: string
    finish?: PackFinish
    onReveal?: () => void
    soundPlacement?: "top" | "bottom"
    soundToggle?: boolean
    [key: string]: any
    style?: CSSProperties
}

// zigzag edges for the crimped seals
const teeth = (n: number, y0: number, y1: number, reverse = false) => {
    const pts: string[] = []
    for (let i = 0; i <= n * 2; i++) pts.push(`${(i / (n * 2)) * 100}% ${i % 2 ? y1 : y0}%`)
    return reverse ? pts.reverse() : pts
}
const PACK_CLIP = `polygon(${[...teeth(22, 0, 1.4), ...teeth(22, 100, 98.6, true)].join(", ")})`
// the strip: crimped top, ragged tear along the bottom
const tear = (() => {
    const pts: string[] = []
    const r = [62, 78, 66, 84, 70, 90, 72, 80, 64, 86, 74, 92, 68, 82, 76, 88, 66, 80, 72, 86, 70]
    r.forEach((y, i) => pts.push(`${(i / (r.length - 1)) * 100}% ${y + 8}%`))
    return pts.reverse()
})()
const STRIP_CLIP = `polygon(${[...teeth(22, 0, 12), ...tear].join(", ")})`

// deterministic sparkle burst
const SPARKS = Array.from({ length: 38 }, (_, i) => {
    const a = (-90 + (((i * 47) % 160) - 80)) * (Math.PI / 180)
    const d = 140 + ((i * 89) % 260)
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 4 + ((i * 7) % 7), c: HOLO[i % HOLO.length], delay: (i % 6) * 0.025 }
})

type Rarity = "common" | "rare" | "epic" | "legendary"
const HAND: { name: string; number: string; type: string; year: string; rarity: Rarity; label: string; src: string; link: string }[] = [
    { name: "Onebank", number: "002/100", type: "Rebrand", year: "2026", rarity: "legendary", label: "★★★ Legendary", src: "sacD66kXS3G6cxkYLysKOPt7Myw.jpg", link: "/work/onebank" },
    { name: "Oat & Ember", number: "003/100", type: "Packaging", year: "2026", rarity: "rare", label: "★ Rare", src: "43IW7wydYkpuKueecM4DIEgZGn0.jpg", link: "/work/oat-ember" },
    { name: "Kiln Studio", number: "004/100", type: "3D identity", year: "2025", rarity: "epic", label: "★★ Epic", src: "avEwSavIsfU7yE7EIZiQClGZI.jpg", link: "/work/kiln-studio" },
    { name: "Fieldnote", number: "005/100", type: "Product, iOS", year: "2025", rarity: "epic", label: "★★ Epic", src: "MMLF7oOnyDfJdAL1JLkJE0IjqI.jpg", link: "/work/fieldnote" },
    { name: "Salt House", number: "006/100", type: "Poster series", year: "2024", rarity: "rare", label: "★ Rare", src: "7hTT5ffw1ElswrBuMxTgHsSng.jpg", link: "/work/salt-house" },
    { name: "Mira Skin", number: "007/100", type: "Packaging", year: "2025", rarity: "common", label: "Common", src: "4MmYJxVMCB4XuAVEjODHnMMUPA.jpg", link: "/work/mira-skin" },
]
// fan slots, inside out: right, left, right, left...
const SLOT = [1, -1, 2, -2, 3, -3]

/* ---------- sound: everything is synthesised, no files to load ---------- */
let audio: AudioContext | null = null
const ctx = () => {
    if (typeof window === "undefined") return null
    if (!audio) {
        const C = (window as any).AudioContext || (window as any).webkitAudioContext
        audio = C ? new C() : null
    }
    if (audio && audio.state === "suspended") audio.resume()
    return audio
}
const noise = (c: AudioContext, dur: number) => {
    const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = b
    return src
}
const env = (c: AudioContext, t: number, peak: number, attack: number, decay: number) => {
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    return g
}
const SFX = {
    tear() {
        const c = ctx()
        if (!c) return
        const t = c.currentTime
        const n = noise(c, 0.5)
        const bp = c.createBiquadFilter()
        bp.type = "bandpass"
        bp.Q.value = 0.8
        bp.frequency.setValueAtTime(700, t)
        bp.frequency.exponentialRampToValueAtTime(6000, t + 0.4)
        n.connect(bp).connect(env(c, t, 0.45, 0.02, 0.42)).connect(c.destination)
        n.start(t)
        n.stop(t + 0.5)
    },
    shimmer() {
        const c = ctx()
        if (!c) return
        const t = c.currentTime
        ;[1568, 2093, 2637, 3136, 3951, 4699].forEach((f, i) => {
            const o = c.createOscillator()
            o.type = "sine"
            o.frequency.value = f
            o.connect(env(c, t + i * 0.055, 0.07, 0.01, 0.7)).connect(c.destination)
            o.start(t + i * 0.055)
            o.stop(t + i * 0.055 + 0.8)
        })
    },
    tick(delay = 0) {
        const c = ctx()
        if (!c) return
        const t = c.currentTime + delay
        const n = noise(c, 0.05)
        const hp = c.createBiquadFilter()
        hp.type = "highpass"
        hp.frequency.value = 2400
        n.connect(hp).connect(env(c, t, 0.22, 0.003, 0.05)).connect(c.destination)
        n.start(t)
        n.stop(t + 0.06)
    },
}
const SOUND_KEY = "nv-playmat-sound"

const SILVER = "linear-gradient(160deg, #F4F5FA 0%, #B9BFCC 18%, #EEF0F5 36%, #969DAF 58%, #E8EAF0 78%, #A9B0BF 100%)"
// App addition: the Framer project's "finish" control (Silver, Gold, Diamond) for the Hunt's pack tiers.
// Values copied from the Framer landing's PackRip (project XEtKsUwoOQ3RKoCtLUyn, Foil): Gold and Diamond
// each have their own base and sheen at 0.38; Silver keeps the rainbow at 0.62.
const GOLD = "linear-gradient(160deg, #FFF6CD 0%, #D5AC42 18%, #FFF0A4 36%, #A7791F 58%, #FFE8A0 78%, #C99A33 100%)"
const DIAMOND = "linear-gradient(160deg, #FFFFFF 0%, #B9E5F2 18%, #EDF8FF 36%, #83ACCD 58%, #F5FFFF 78%, #B9CFEA 100%)"
const GOLD_SHEEN = "repeating-linear-gradient(115deg, #FFF4BF 0%, #E1B849 14%, #FFF9DF 28%, #DCA944 35%)"
const DIAMOND_SHEEN = "repeating-conic-gradient(from 30deg, #D8FFFF 0deg 60deg, #BBD9FF 60deg 120deg, #FFFFFF 120deg 180deg)"
export type PackFinish = "Silver" | "Gold" | "Diamond"
const RAINBOW = "repeating-linear-gradient(115deg, #FFB3D9 0%, #8EF6FF 7%, #C9A7FF 14%, #FFF1A8 21%, #A0FFC8 28%, #FFB3D9 35%)"
const FINISHES: Record<PackFinish, { base: string; sheen: string; opacity: number }> = {
    Silver: { base: SILVER, sheen: RAINBOW, opacity: 0.62 },
    Gold: { base: GOLD, sheen: GOLD_SHEEN, opacity: 0.38 },
    Diamond: { base: DIAMOND, sheen: DIAMOND_SHEEN, opacity: 0.38 },
}
const CRIMP = "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 2px, rgba(10,11,18,0.16) 2px, rgba(10,11,18,0.16) 6px)"

/** App addition: one finish as a single CSS background (sheen over the base), for still pack tiles. */
export function packFoil(finish: PackFinish): string {
    const look = FINISHES[finish] ?? FINISHES.Silver
    const sheen = look.sheen.replace(/#([0-9A-F]{6})/gi, (hex) => `${hex}${Math.round(look.opacity * 0.55 * 255).toString(16).padStart(2, "0")}`)
    return `${sheen}, ${look.base}`
}

function Foil({ pos, glare, image, finish = "Silver" }: { pos: any; glare: any; image?: string; finish?: PackFinish }) {
    const look = FINISHES[finish] ?? FINISHES.Silver
    return (
        <>
            <div style={{ position: "absolute", inset: 0, background: look.base }} />
            <motion.div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: look.sheen,
                    backgroundSize: "320% 320%",
                    backgroundPosition: pos,
                    mixBlendMode: "multiply",
                    opacity: look.opacity,
                }}
            />
            {image ? (
                <motion.div
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${image})`,
                        backgroundSize: "260%",
                        backgroundPosition: pos,
                        mixBlendMode: "soft-light",
                        opacity: 0.7,
                    }}
                />
            ) : null}
            <motion.div style={{ position: "absolute", inset: 0, background: glare, mixBlendMode: "overlay" }} />
        </>
    )
}

export default function PackRip(props: PackRipProps) {
    const {
        foil,
        packTitle = "Noa Varela",
        packLogo = false,
        packSubtitle = "First edition, 2026",
        badge = "One legendary in every pack",
        hint = "Drag across the top to open",
        resetLabel = "Seal it again",
        cardImage = { src: "https://framerusercontent.com/images/WmmtYXv040mrNDtGH00wittBofI.jpg", alt: "Portrait of Noa Varela" },
        cardName = "Noa Varela",
        cardNumber = "001/100",
        cardType = "Brand & product designer",
        cardYear = "Copenhagen",
        canvasState = "peek",
        ink = "#0A0B12",
        hintColor = "rgba(244, 245, 250, 0.6)",
        shadow = "rgba(0, 0, 0, 0.55)",
        titleScale = 1,
        handCount = 6,
        sound = true,
        printShadow = "rgba(0, 0, 0, 0)",
        printOffset = 14,
        // App additions: hide the reset, name the revealed card's rarity, report the reveal, move the sound toggle.
        showReset = true,
        cardRarityLabel = "MVP",
        // App addition: foil finish (the Framer "finish" control).
        finish = "Silver",
        onReveal,
        soundPlacement = "bottom",
        // App addition: the app keeps one Sound toggle in the masthead, so the pack can hide its own.
        soundToggle = true,
        style,
    } = props
    const hand = Array.from({ length: Math.max(0, Math.min(6, Number(handCount) || 0)) }, (_, i) => {
        const k = i + 1
        const d = HAND[i]
        const img = props[`hand${k}Image`]
        return {
            name: props[`hand${k}Name`] ?? d.name,
            number: props[`hand${k}Number`] ?? d.number,
            type: props[`hand${k}Type`] ?? d.type,
            year: props[`hand${k}Year`] ?? d.year,
            rarity: (props[`hand${k}Rarity`] ?? d.rarity) as Rarity,
            label: props[`hand${k}RarityLabel`] ?? d.label,
            image: img?.src ? img : { src: `https://framerusercontent.com/images/${d.src}`, alt: d.name },
            link: props[`hand${k}Link`] ?? d.link,
        }
    })

    const isStatic = useIsStaticRenderer()
    const reduce = useReducedMotion()
    const initial: CanvasState = isStatic ? canvasState : "sealed"

    const [phase, setPhase] = useState<"sealed" | "opening" | "revealed">(initial === "revealed" ? "revealed" : "sealed")
    const [cardFront, setCardFront] = useState(initial === "revealed")
    const [burst, setBurst] = useState(false)
    const [dealt, setDealt] = useState(initial === "revealed")
    const [soundOn, setSoundOn] = useState(sound)
    useEffect(() => {
        const sync = () => {
            try {
                const v = window.localStorage.getItem(SOUND_KEY)
                if (v !== null) setSoundOn(v === "1")
            } catch {}
        }
        sync()
        // App addition: follow the preference when the masthead toggle changes it.
        window.addEventListener(SOUND_KEY, sync)
        window.addEventListener("storage", sync)
        return () => {
            window.removeEventListener(SOUND_KEY, sync)
            window.removeEventListener("storage", sync)
        }
    }, [])
    const toggleSound = () =>
        startTransition(() =>
            setSoundOn((v) => {
                try {
                    window.localStorage.setItem(SOUND_KEY, v ? "0" : "1")
                } catch {}
                if (!v) SFX.tick()
                return !v
            })
        )
    const play = (k: keyof typeof SFX, delay?: number) => {
        if (soundOn && !isStatic) (SFX[k] as any)(delay)
    }

    // the card is always laid out at its design size (270 x 392) and scaled to fit,
    // so its internals never squash on small screens
    const rootRef = useRef<HTMLDivElement>(null)
    const [box, setBox] = useState({ w: 1000, h: 700 })
    useEffect(() => {
        const el = rootRef.current
        if (!el) return
        const measure = () => {
            const r = el.getBoundingClientRect()
            if (r.width && r.height) setBox({ w: r.width, h: r.height })
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
    const geo = (() => {
        const packH = Math.min(0.76 * box.h, 740, (box.w * 0.9) / 0.62)
        const slotH = 0.774 * packH
        const hasHand = hand.length > 0
        const revealH = Math.max(slotH, Math.min((hasHand ? 0.7 : 0.8) * box.h, hasHand ? 520 : 600, (box.w * (hasHand ? 0.62 : 0.9) * 392) / 270))
        const centre = packH / 2 - 0.05 * box.h // card centre in rig coordinates, a little above the field centre
        const hH = revealH * 0.62
        const hS = hH / 392
        const narrow = box.w < 520
        const rotStep = narrow ? 6 : 9
        const playerW = (revealH * 270) / 392
        const maxDeg = rotStep * 3 * (Math.PI / 180)
        const dxMax = Math.max(playerW * 0.15, box.w / 2 - (hH * 270) / 392 / 2 - Math.sin(maxDeg) * hH * 0.85 - 8)
        const dxMin = playerW * 0.1
        const handBottom = centre + revealH / 2 - revealH * 0.05
        const fan = SLOT.map((k) => {
            const a = Math.abs(k)
            return {
                x: Math.sign(k) * (dxMin + ((a - 1) / 2) * (dxMax - dxMin)),
                y: handBottom - a * 5 - 0.96 * packH,
                rotate: k * rotStep,
                z: 4 - a,
            }
        })
        return {
            packH,
            hS,
            fan,
            base: slotH / 392,
            reveal: revealH / 392,
            yPeek: -0.41 * slotH,
            yRise: -1.04 * slotH,
            yReveal: centre + revealH / 2 - 0.96 * packH,
        }
    })()
    const geoRef = useRef(geo)
    geoRef.current = geo

    const cardY = useMotionValue(0)
    const cardScale = useMotionValue(geo.base)
    const cardO = useMotionValue(1)
    const packY = useMotionValue(initial === "revealed" ? 130 : 0)
    const packO = useMotionValue(initial === "revealed" ? 0 : 1)
    const pull = useMotionValue(0)
    const light = useMotionValue(0)
    const haloO = useMotionValue(0)
    const haloS = useMotionValue(0.6)
    const cardRot = useMotionValue(0)
    const fly = useMotionValue(initial === "sealed" ? 0 : 1)
    const packYp = useTransform(packY, (v) => `${v}%`)
    const stripRot = useTransform([pull, fly], ([p, f]: number[]) => -p * 16 - f * 30)
    const stripY = useTransform([pull, fly], ([p, f]: number[]) => `${-p * 18 - f * 420}%`)
    const stripX = useTransform(fly, (f) => `${f * 70}%`)
    const stripO = useTransform(fly, [0, 0.7, 1], [1, 1, 0])
    const slit = useTransform(pull, (p) => `${p * 100}%`)

    // foil shine follows the pointer
    const mx = useMotionValue(0.3)
    const my = useMotionValue(0.3)
    const foilPos = useMotionTemplate`${useTransform(mx, (v) => v * 100)}% ${useTransform(my, (v) => v * 100)}%`
    const glare = useMotionTemplate`radial-gradient(60% 40% at ${useTransform(mx, (v) => v * 100)}% ${useTransform(my, (v) => v * 100)}%, rgba(255,255,255,0.9), rgba(255,255,255,0) 70%)`

    const onMove = (e: RPointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width)
        my.set((e.clientY - r.top) / r.height)
    }

    useEffect(() => {
        if (phase === "opening") return
        if (phase === "revealed") {
            cardY.set(geo.yReveal)
            cardScale.set(geo.reveal)
        } else {
            cardY.set(initial === "peek" ? geo.yPeek : 0)
            cardScale.set(geo.base)
        }
    }, [phase, geo.yReveal, geo.reveal, geo.base, geo.yPeek])

    const d = reduce ? 0 : 1
    const open = async () => {
        if (phase !== "sealed") return
        startTransition(() => setPhase("opening"))
        play("tear")
        const g = geoRef.current
        const smooth = [0.22, 1, 0.36, 1] as const
        // 1. the top tears off and light leaks out of the slit
        animate(pull, 1, { duration: 0.22 * d, ease: [0.3, 0, 0.2, 1] })
        animate(fly, 1, { duration: 0.75 * d, ease: smooth })
        animate(light, [0, 1, 0.85], { duration: 0.55 * d, times: [0, 0.45, 1], ease: "easeOut" })
        // 2. the pack sinks away while the card glides up out of it
        animate(packY, 130, { duration: 1.05 * d, delay: 0.32 * d, ease: [0.55, 0, 0.3, 1] })
        animate(packO, 0, { duration: 0.6 * d, delay: 0.62 * d, ease: "easeIn" })
        animate(light, 0, { duration: 0.5 * d, delay: 0.7 * d, ease: "easeOut" })
        cardRot.set(reduce ? 0 : -5)
        await animate(cardY, g.yRise, { duration: 0.95 * d, delay: 0.18 * d, ease: smooth })
        // 3. the card comes forward, settles and a holo halo blooms behind it
        startTransition(() => {
            setCardFront(true)
            setBurst(true)
            setDealt(true)
        })
        play("shimmer")
        haloS.set(0.6)
        animate(haloO, [0, 1, 0], { duration: 1.5 * d, times: [0, 0.25, 1], ease: "easeOut" })
        animate(haloS, 1.6, { duration: 1.5 * d, ease: smooth })
        animate(cardRot, 0, { duration: 1.1 * d, ease: smooth })
        animate(cardScale, g.reveal, { duration: 1.0 * d, ease: smooth })
        hand.forEach((_, i) => play("tick", 0.08 + i * 0.07))
        await animate(cardY, g.yReveal, { duration: 1.0 * d, ease: smooth })
        startTransition(() => setPhase("revealed"))
        onReveal?.()
    }

    const reset = async () => {
        startTransition(() => setDealt(false))
        await animate(cardO, 0, { duration: 0.25 * d })
        startTransition(() => {
            setCardFront(false)
            setBurst(false)
        })
        cardY.set(0)
        cardScale.set(geoRef.current.base)
        cardRot.set(0)
        haloO.set(0)
        light.set(0)
        pull.set(0)
        fly.set(0)
        animate(packO, 1, { duration: 0.3 * d })
        await animate(packY, 0, reduce ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 18 })
        cardO.set(1)
        startTransition(() => setPhase("sealed"))
    }

    // drag across the strip to tear it
    let startX = 0
    let width = 1
    let moved = false
    const onStripDown = (e: RPointerEvent<HTMLDivElement>) => {
        if (phase !== "sealed") return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        startX = e.clientX
        width = e.currentTarget.getBoundingClientRect().width
        moved = false
    }
    const onStripMove = (e: RPointerEvent<HTMLDivElement>) => {
        if (phase !== "sealed" || !e.currentTarget.hasPointerCapture(e.pointerId)) return
        const p = Math.max(0, Math.min(1, (e.clientX - startX) / (width * 0.8)))
        if (p > 0.02) moved = true
        pull.set(p)
        if (p >= 0.98) open()
    }
    const onStripUp = (e: RPointerEvent<HTMLDivElement>) => {
        if (phase !== "sealed") return
        e.currentTarget.releasePointerCapture(e.pointerId)
        if (!moved || pull.get() > 0.45) open()
        else animate(pull, 0, { type: "spring", stiffness: 300, damping: 20 })
    }

    const display = "'Unbounded', system-ui, sans-serif"
    const body = "'Geist', system-ui, sans-serif"
    const sealed = phase === "sealed"
    const showHint = !isStatic && sealed

    return (
        <div
            ref={rootRef}
            onPointerMove={onMove}
            style={{
                ...style,
                position: "relative",
                width: "100%",
                height: "100%",
                ...({ containerType: "size" } as any),
                overflow: "visible",
                userSelect: "none",
                WebkitUserSelect: "none",
            }}
        >
            <link href={FONT_LINK} rel="stylesheet" />
            {!isStatic && soundToggle && (
                <button
                    onClick={toggleSound}
                    aria-pressed={soundOn}
                    style={{
                        all: "unset",
                        position: "absolute",
                        right: 16,
                        ...(soundPlacement === "top" ? { top: 14 } : { bottom: 14 }),
                        zIndex: 9,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        fontFamily: "'Geist', system-ui, sans-serif",
                        fontSize: 13,
                        color: hintColor,
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke={hintColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6 H4.5 L8 3 V13 L4.5 10 H2 Z" fill={hintColor} />
                        {soundOn ? (
                            <>
                                <path d="M10.5 5.8 Q12 8 10.5 10.2" />
                                <path d="M12.5 4 Q15 8 12.5 12" />
                            </>
                        ) : (
                            <path d="M10.5 6 L14.5 10 M14.5 6 L10.5 10" />
                        )}
                    </svg>
                    {soundOn ? "Sound On" : "Sound Off"}
                </button>
            )}
            {/* rig is sized like the pack; everything inside is relative to it */}
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    top: "52%",
                    height: geo.packH,
                    aspectRatio: "0.62",
                    transform: "translate(-50%, -50%)",
                }}
            >
                {/* the hand: project cards fanned out behind the player card */}
                {hand.map((c, i) => {
                    const f = geo.fan[i]
                    return (
                        <motion.div
                            key={i}
                            initial={false}
                            animate={
                                dealt
                                    ? { x: f.x, y: f.y, rotate: f.rotate, scale: geo.hS, opacity: 1 }
                                    : { x: 0, y: geo.yRise * 0.6, rotate: 0, scale: geo.hS * 0.7, opacity: 0 }
                            }
                            transition={reduce ? { duration: 0 } : dealt ? { type: "spring", stiffness: 140, damping: 17, delay: 0.08 + i * 0.07 } : { duration: 0.2 }}
                            whileHover={dealt ? { zIndex: 8 } : undefined}
                            style={{
                                position: "absolute",
                                left: "50%",
                                marginLeft: -135,
                                top: geo.packH * 0.96 - 392,
                                width: 270,
                                height: 392,
                                transformOrigin: "50% 100%",
                                zIndex: f.z,
                                pointerEvents: dealt ? "auto" : "none",
                            }}
                        >
                            <motion.a
                                href={c.link || undefined}
                                aria-label={`${c.name}, ${c.type}`}
                                whileHover={{ y: -70 }}
                                whileFocus={{ y: -70 }}
                                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                onHoverStart={() => play("tick")}
                                style={{ display: "block", width: "100%", height: "100%", textDecoration: "none", outlineOffset: 6 }}
                            >
                                <HoloCard
                                    image={c.image}
                                    name={c.name}
                                    number={c.number}
                                    typeLine={c.type}
                                    year={c.year}
                                    rarity={c.rarity}
                                    rarityLabel={c.label}
                                    abilityCount={0}
                                    flippable={false}
                                    maxTilt={6}
                                    style={{ width: "100%", height: "100%" }}
                                />
                            </motion.a>
                        </motion.div>
                    )
                })}

                {/* the card */}
                <motion.div
                    style={{
                        position: "absolute",
                        left: "50%",
                        marginLeft: -135,
                        top: geo.packH * 0.96 - 392,
                        width: 270,
                        height: 392,
                        transformOrigin: "50% 100%",
                        y: cardY,
                        scale: cardScale,
                        rotate: cardRot,
                        opacity: cardO,
                        zIndex: cardFront ? 5 : 1,
                    }}
                >
                    <motion.div
                        aria-hidden
                        style={{
                            position: "absolute",
                            inset: "-38%",
                            borderRadius: "50%",
                            background:
                                "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(201,247,255,0.6) 30%, rgba(201,167,255,0.4) 48%, rgba(255,179,217,0.28) 60%, rgba(255,255,255,0) 74%)",
                            opacity: haloO,
                            scale: haloS,
                            zIndex: -1,
                            pointerEvents: "none",
                        }}
                    />
                    <HoloCard
                        image={cardImage}
                        name={cardName}
                        number={cardNumber}
                        typeLine={cardType}
                        year={cardYear}
                        rarity={props.cardRarity ?? "legendary"}
                        rarityLabel={cardRarityLabel}
                        subName={props.cardSubName}
                        artOverlay={props.cardArtOverlay}
                        {...(props.cardSetLabel ? { setLabel: props.cardSetLabel } : {})}
                        abilityCount={0}
                        flippable={false}
                        maxTilt={phase === "revealed" ? 10 : 0}
                        style={{ width: "100%", height: "100%" }}
                    />
                </motion.div>

                {/* sparkles */}
                {burst &&
                    SPARKS.map((s, i) => (
                        <motion.span
                            key={i}
                            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 45 }}
                            animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.3, rotate: 225 }}
                            transition={{ duration: reduce ? 0 : 1.2, ease: [0.1, 0.8, 0.3, 1], delay: s.delay }}
                            style={{
                                position: "absolute",
                                left: "50%",
                                top: "6%",
                                width: s.s,
                                height: s.s,
                                background: s.c,
                                boxShadow: `0 0 12px ${s.c}`,
                                zIndex: 6,
                                pointerEvents: "none",
                            }}
                        />
                    ))}

                {/* the pack */}
                <motion.div
                    style={{
                        position: "absolute",
                        inset: 0,
                        y: packYp,
                        opacity: packO,
                        zIndex: 3,
                        filter: /rgba\([^)]*,\s*0\)|transparent/.test(String(shadow)) ? undefined : `drop-shadow(0px 40px 50px ${shadow})`,
                        willChange: "transform",
                        pointerEvents: phase === "revealed" ? "none" : "auto",
                    }}
                    animate={sealed && !isStatic && !reduce ? { rotate: [-1.2, 1.2] } : { rotate: 0 }}
                    transition={{ duration: 3.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
                >
                    <div
                        aria-hidden
                        style={{
                            position: "absolute",
                            inset: 0,
                            clipPath: PACK_CLIP,
                            background: printShadow,
                            transform: `translate(${printOffset}px, ${printOffset}px)`,
                        }}
                    />
                    <motion.div style={{ position: "absolute", inset: 0, clipPath: PACK_CLIP }}>
                        <Foil pos={foilPos} glare={glare} image={foil?.src} finish={finish} />
                        {/* crimp texture top and bottom */}
                        {["0%", "auto"].map((top, i) => (
                            <div
                                key={i}
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    top: i === 0 ? 0 : "auto",
                                    bottom: i === 1 ? 0 : "auto",
                                    height: "6%",
                                    background:
                                        "repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 2px, rgba(10,11,18,0.18) 2px, rgba(10,11,18,0.18) 6px)",
                                }}
                            />
                        ))}
                        {/* the opened slit glows as you pull */}
                        <motion.div
                            style={{
                                position: "absolute",
                                left: 0,
                                top: "10.5%",
                                height: 3,
                                width: slit,
                                background: "linear-gradient(90deg, #fff, #C9F7FF)",
                                boxShadow: "0 0 18px 4px rgba(201,247,255,0.8)",
                            }}
                        />
                        {/* face */}
                        <div
                            style={{
                                position: "absolute",
                                inset: "16% 9% 9% 9%",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "space-between",
                                textAlign: "center",
                                color: ink,
                            }}
                        >
                            <div style={{ fontFamily: body, fontWeight: 500, fontSize: Math.max(11, geo.packH * 0.027), opacity: 0.75 }}>{packSubtitle}</div>
                            {packLogo ? (
                                <h1 style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: geo.packH * 0.025 }}>
                                    <Logo title="Ball is Flat" style={{ width: "92%", height: "auto", color: ink }} />
                                    <span
                                        style={{
                                            fontFamily: display,
                                            fontWeight: 800,
                                            fontSize: Math.max(12, geo.packH * 0.036),
                                            letterSpacing: "-0.02em",
                                        }}
                                    >
                                        {packTitle}
                                    </span>
                                </h1>
                            ) : (
                                <h1
                                    style={{
                                        fontFamily: display,
                                        fontWeight: 800,
                                        fontSize: Math.max(20, geo.packH * 0.135) * titleScale,
                                        lineHeight: 0.92,
                                        letterSpacing: "-0.05em",
                                        overflowWrap: "normal",
                                        margin: 0,
                                    }}
                                >
                                    {packTitle}
                                </h1>
                            )}
                            <div
                                style={{
                                    fontFamily: body,
                                    fontWeight: 600,
                                    fontSize: Math.max(11, geo.packH * 0.026),
                                    padding: "0.75em 1.3em",
                                    borderRadius: 100,
                                    background: ink,
                                    color: "#F4F5FA",
                                }}
                            >
                                {badge}
                            </div>
                        </div>
                    </motion.div>

                    {/* light leaking out of the torn top */}
                    <motion.div
                        aria-hidden
                        style={{
                            position: "absolute",
                            left: "-6%",
                            right: "-6%",
                            top: "6%",
                            height: "16%",
                            borderRadius: "50%",
                            background: "radial-gradient(closest-side, rgba(255,255,255,1), rgba(201,247,255,0.7) 40%, rgba(255,255,255,0) 75%)",
                            filter: "blur(4px)",
                            opacity: light,
                            zIndex: 5,
                            pointerEvents: "none",
                        }}
                    />

                    {/* tear strip */}
                    <motion.div
                        role="button"
                        tabIndex={sealed ? 0 : -1}
                        aria-label={hint}
                        onPointerDown={onStripDown}
                        onPointerMove={onStripMove}
                        onPointerUp={onStripUp}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                open()
                            }
                        }}
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 0,
                            height: "13%",
                            transformOrigin: "100% 100%",
                            rotate: stripRot,
                            y: stripY,
                            x: stripX,
                            opacity: stripO,
                            cursor: sealed ? "grab" : "default",
                            touchAction: "none",
                            zIndex: 4,
                            outline: "none",
                        }}
                    >
                        <div style={{ position: "absolute", inset: 0, clipPath: STRIP_CLIP }}>
                            <Foil pos={foilPos} glare={glare} finish={finish} />
                            <div style={{ position: "absolute", inset: 0, background: CRIMP, opacity: 0.7 }} />
                        </div>
                        {/* ghost finger showing the gesture */}
                        {showHint && (
                            <motion.div
                                animate={reduce ? {} : { left: ["8%", "86%"], opacity: [0, 1, 1, 0] }}
                                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: [0.4, 0, 0.2, 1] }}
                                style={{
                                    position: "absolute",
                                    top: "38%",
                                    left: "8%",
                                    width: 16,
                                    height: 16,
                                    marginTop: -8,
                                    borderRadius: 100,
                                    background: "#fff",
                                    boxShadow: "0 0 0 6px rgba(255,255,255,0.25), 0 0 24px 6px rgba(201,247,255,0.7)",
                                    pointerEvents: "none",
                                }}
                            />
                        )}
                    </motion.div>
                </motion.div>

                {/* hint + reset under the rig */}
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: "calc(100% + 3.2cqh)",
                        transform: "translateX(-50%)",
                        whiteSpace: "nowrap",
                        fontFamily: body,
                        fontSize: 14,
                        color: hintColor,
                        zIndex: 6,
                    }}
                >
                    {phase === "revealed" ? (showReset ? (
                        <button
                            onClick={reset}
                            style={{
                                all: "unset",
                                cursor: "pointer",
                                color: hintColor,
                                textDecoration: "underline",
                                textUnderlineOffset: 4,
                            }}
                        >
                            {resetLabel}
                        </button>
                    ) : null) : sealed && !isStatic ? (
                        hint
                    ) : null}
                </div>
            </div>
        </div>
    )
}

const handControls: Record<string, any> = {}
for (let k = 1; k <= 6; k++) {
    const d = HAND[k - 1]
    const hidden = (p: any) => (Number(p.handCount) || 0) < k
    handControls[`hand${k}Image`] = { type: ControlType.ResponsiveImage, title: `Hand ${k} Art`, hidden }
    handControls[`hand${k}Name`] = { type: ControlType.String, title: `Hand ${k} Name`, defaultValue: d.name, hidden }
    handControls[`hand${k}Number`] = { type: ControlType.String, title: `Hand ${k} No.`, defaultValue: d.number, hidden }
    handControls[`hand${k}Type`] = { type: ControlType.String, title: `Hand ${k} Type`, defaultValue: d.type, hidden }
    handControls[`hand${k}Year`] = { type: ControlType.String, title: `Hand ${k} Detail`, defaultValue: d.year, hidden }
    handControls[`hand${k}Rarity`] = { type: ControlType.Enum, title: `Hand ${k} Rarity`, options: ["common", "rare", "epic", "legendary"], optionTitles: ["Common", "Rare", "Epic", "Legendary"], defaultValue: d.rarity, hidden }
    handControls[`hand${k}RarityLabel`] = { type: ControlType.String, title: `Hand ${k} Label`, defaultValue: d.label, hidden }
    handControls[`hand${k}Link`] = { type: ControlType.Link, title: `Hand ${k} Link`, defaultValue: d.link, hidden }
}

addPropertyControls(PackRip, {
    foil: { type: ControlType.ResponsiveImage, title: "Foil Texture" },
    packTitle: { type: ControlType.String, title: "Pack Title", defaultValue: "Noa Varela" },
    packSubtitle: { type: ControlType.String, title: "Subtitle", defaultValue: "First edition, 2026" },
    badge: { type: ControlType.String, title: "Badge", defaultValue: "One legendary in every pack" },
    hint: { type: ControlType.String, title: "Hint", defaultValue: "Drag across the top to open" },
    resetLabel: { type: ControlType.String, title: "Reset Label", defaultValue: "Seal it again" },
    cardImage: { type: ControlType.ResponsiveImage, title: "Card Art" },
    cardName: { type: ControlType.String, title: "Card Name", defaultValue: "Noa Varela" },
    cardNumber: { type: ControlType.String, title: "Card Number", defaultValue: "001/100" },
    cardType: { type: ControlType.String, title: "Card Type", defaultValue: "Brand & product designer" },
    cardYear: { type: ControlType.String, title: "Card City", defaultValue: "Copenhagen" },
    canvasState: {
        type: ControlType.Enum,
        title: "Canvas State",
        options: ["sealed", "peek", "revealed"],
        optionTitles: ["Sealed", "Peek", "Revealed"],
        defaultValue: "peek",
        displaySegmentedControl: true,
    },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#0A0B12" },
    hintColor: { type: ControlType.Color, title: "Hint Color", defaultValue: "rgba(244, 245, 250, 0.6)" },
    shadow: { type: ControlType.Color, title: "Shadow", defaultValue: "rgba(0, 0, 0, 0.55)" },
    titleScale: { type: ControlType.Number, title: "Title Size", defaultValue: 1, min: 0.4, max: 1.4, step: 0.05 },
    printShadow: { type: ControlType.Color, title: "Print Shadow", defaultValue: "rgba(0, 0, 0, 0)", description: "A hard offset shadow behind the pack, like a second ink." },
    printOffset: { type: ControlType.Number, title: "Print Offset", defaultValue: 14, min: 0, max: 40, unit: "px" },
    sound: { type: ControlType.Boolean, title: "Sound", defaultValue: true, description: "Starting state. Visitors can turn it off and the choice is remembered." },
    handCount: { type: ControlType.Number, title: "Hand", defaultValue: 6, min: 0, max: 6, step: 1, displayStepper: true, description: "Project cards dealt out behind the player card." },
    ...handControls,
})
