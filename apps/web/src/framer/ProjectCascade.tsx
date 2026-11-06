// @ts-nocheck: verbatim Framer code component (see shim.ts)
import { addPropertyControls, ControlType, useIsStaticRenderer } from "./shim"
import { motion, useReducedMotion } from "framer-motion"
import { useEffect, useRef, useState, startTransition, type CSSProperties } from "react"

/**
 * Project Cascade: projects laid out like a solitaire column, or as a squared-up deck (Layout: Stack). Every card shows its
 * name strip; the last one shows in full. Hover a buried card to pull it out, click to open it.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */

interface Img {
    src: string
    srcSet?: string
    alt?: string
}

const DEFAULTS = [
    { name: "Onebank", number: "002", type: "Rebrand", src: "sacD66kXS3G6cxkYLysKOPt7Myw.jpg", link: "/work/onebank" , color: "#FF4FA3" },
    { name: "Oat & Ember", number: "003", type: "Packaging", src: "43IW7wydYkpuKueecM4DIEgZGn0.jpg", link: "/work/oat-ember" , color: "#FFE800" },
    { name: "Kiln Studio", number: "004", type: "3D identity", src: "avEwSavIsfU7yE7EIZiQClGZI.jpg", link: "/work/kiln-studio" , color: "#FF4FA3" },
    { name: "Fieldnote", number: "005", type: "Product, iOS", src: "MMLF7oOnyDfJdAL1JLkJE0IjqI.jpg", link: "/work/fieldnote" , color: "#3FE0FF" },
    { name: "Salt House", number: "006", type: "Poster series", src: "7hTT5ffw1ElswrBuMxTgHsSng.jpg", link: "/work/salt-house" , color: "#F2F2EE" },
    { name: "Mira Skin", number: "007", type: "Packaging", src: "4MmYJxVMCB4XuAVEjODHnMMUPA.jpg", link: "/work/mira-skin" , color: "#FFE800" },
]

interface Props {
    count: number
    cardHeight: number
    cardFill: string
    ink: string
    edge: string
    accent: string
    muted: string
    [key: string]: any
    style?: CSSProperties
}

export default function ProjectCascade(props: Props) {
    const {
        count = 6,
        cardHeight = 240,
        cardFill = "#FFFFFF",
        ink = "#2449E8",
        edge = "#2449E8",
        accent = "#FF4FA3",
        muted = "rgba(36, 73, 232, 0.7)",
        style,
    } = props
    const isStatic = useIsStaticRenderer()
    const ref = useRef<HTMLDivElement>(null)
    const [h, setH] = useState(520)
    const [hover, setHover] = useState<number | null>(null)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const m = () => {
            const r = el.getBoundingClientRect()
            if (r.height) setH(r.height)
        }
        m()
        const ro = new ResizeObserver(m)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const n = Math.max(1, Math.min(6, Number(count) || 6))
    const cards = Array.from({ length: n }, (_, i) => {
        const k = i + 1
        const d = DEFAULTS[i]
        const img: Img | undefined = props[`card${k}Image`]
        return {
            name: props[`card${k}Name`] ?? d.name,
            number: props[`card${k}Number`] ?? d.number,
            type: props[`card${k}Type`] ?? d.type,
            image: img?.src ? img : { src: `https://framerusercontent.com/images/${d.src}`, alt: d.name },
            link: props[`card${k}Link`] ?? d.link,
            color: props[`card${k}Color`] ?? (d as any).color,
        }
    })
    // always fit the frame: tighten the strips first, then shorten the open card
    const step = n > 1 ? Math.max(30, Math.min(64, (h - Math.min(cardHeight, h * 0.62) - 6) / (n - 1))) : 0
    const ch = Math.max(120, Math.min(cardHeight, h - (n - 1) * step - 8))

    if (props.layout === "Stack") return <ProjectDeck {...props} cards={cards} isStatic={isStatic} />

    return (
        <div ref={ref} style={{ ...style, position: "relative", width: "100%", height: "100%", overflow: "visible" }}>
            {cards.map((c, i) => {
                const up = hover === i && i < n - 1
                return (
                    <motion.a
                        key={i}
                        href={c.link || undefined}
                        aria-label={`${c.name}, ${c.type}`}
                        onHoverStart={() => !isStatic && startTransition(() => setHover(i))}
                        onHoverEnd={() => !isStatic && startTransition(() => setHover((v) => (v === i ? null : v)))}
                        onFocus={() => startTransition(() => setHover(i))}
                        onBlur={() => startTransition(() => setHover(null))}
                        animate={{ x: up ? 14 : 0, y: up ? -6 : 0, rotate: up ? 1.5 : 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 24 }}
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 6,
                            top: i * step,
                            height: ch,
                            zIndex: up ? 40 : i + 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            padding: "8px 8px 10px 8px",
                            boxSizing: "border-box",
                            borderRadius: 12,
                            background: cardFill,
                            border: `2px solid ${edge}`,
                            boxShadow: `${up ? 7 : 4}px ${up ? 7 : 4}px 0 0 ${up ? accent : edge}`,
                            textDecoration: "none",
                            outlineOffset: 4,
                        }}
                    >
                        {/* the strip you can always read, like the corner of a playing card */}
                        <div style={{ display: "flex", alignItems: "center", gap: 9, height: step > 0 ? Math.min(step - 14, 22) : 22, padding: "0 4px", flexShrink: 0 }}>
                            <span style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 12, color: accent }}>{c.number}</span>
                            <span
                                style={{
                                    flex: 1,
                                    fontFamily: "'Unbounded', system-ui, sans-serif",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    letterSpacing: "-0.02em",
                                    color: ink,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {c.name}
                            </span>
                        </div>
                        <div
                            role="img"
                            aria-label={c.image?.alt || c.name}
                            style={{ flex: 1, minHeight: 0, borderRadius: 7, backgroundImage: `url(${c.image?.src})`, backgroundSize: "cover", backgroundPosition: "center" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px", fontFamily: "'Geist', system-ui, sans-serif", fontSize: 11, color: muted }}>
                            <span>{c.type}</span>
                            <span>Open</span>
                        </div>
                    </motion.a>
                )
            })}
        </div>
    )
}

/* the same projects as a squared-up deck: tap the top card for the next one, Open goes to the case */
function ProjectDeck(props: any) {
    const { cards, isStatic, cardHeight = 240, hint = "Tap for next", openLabel = "Open case", cardFill = "#FFFFFF", ink = "#2449E8", edge = "#2449E8", accent = "#FF4FA3", muted = "rgba(36, 73, 232, 0.7)", style } = props
    const reduce = useReducedMotion()
    const n = cards.length
    const [order, setOrder] = useState<number[]>(() => cards.map((_: any, i: number) => i))
    const [leaving, setLeaving] = useState<number | null>(null)
    const ord = order.filter((i) => i < n).concat(cards.map((_: any, i: number) => i).filter((i: number) => !order.includes(i)))

    const next = () => {
        if (isStatic || leaving !== null) return
        const top = ord[0]
        startTransition(() => setLeaving(top))
        window.setTimeout(
            () =>
                startTransition(() => {
                    setOrder([...ord.slice(1), top])
                    setLeaving(null)
                }),
            reduce ? 0 : 260
        )
        // App addition: report the card now on top, so the page can follow the deck.
        props.onIndexChange?.(ord.length > 1 ? ord[1] : top)
    }

    return (
        <div style={{ ...style, position: "relative", width: "100%", height: "100%", overflow: "visible" }}>
            {ord.map((ci, depth) => {
                const c = cards[ci]
                const isTop = depth === 0
                const out = leaving === ci
                const d = Math.min(depth, 4)
                return (
                    <motion.div
                        key={ci}
                        role={isTop ? "button" : undefined}
                        tabIndex={isTop ? 0 : -1}
                        aria-label={isTop ? `${c.name}, ${c.type}. ${hint}` : undefined}
                        onClick={isTop ? next : undefined}
                        onKeyDown={(e) => isTop && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), next())}
                        initial={false}
                        animate={out ? { x: "62%", y: -18, rotate: 12, opacity: 0 } : { x: d * 5, y: d * 5, rotate: d % 2 ? 1.6 : -1.2 * (d > 0 ? 1 : 0), opacity: 1 }}
                        whileHover={isTop && !isStatic ? { y: -4, rotate: -1.5 } : undefined}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            right: 22,
                            height: `min(${Number(cardHeight) || 240}px, calc(100% - 22px))`,
                            zIndex: n - depth,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            padding: "10px 10px 12px 10px",
                            boxSizing: "border-box",
                            borderRadius: 14,
                            background: cardFill,
                            border: `2px solid ${edge}`,
                            boxShadow: isTop ? `5px 5px 0 0 ${edge}` : "none",
                            cursor: isTop ? "pointer" : "default",
                            outlineOffset: 4,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 4px 0 4px", flexShrink: 0 }}>
                            <span style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 12, color: accent }}>{c.number}</span>
                            <span style={{ flex: 1, fontFamily: "'Unbounded', system-ui, sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "-0.025em", color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                        </div>
                        <div role="img" aria-label={c.image?.alt || c.name} style={{ position: "relative", flex: 1, minHeight: 0, borderRadius: 8, backgroundImage: `url(${c.image?.src})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                            <span style={{ position: "absolute", left: 8, bottom: 8, padding: "4px 8px", borderRadius: 100, background: c.color || cardFill, fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 11, color: c.color ? "#141416" : ink }}>{c.type}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "0 4px", fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, color: muted }}>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{isTop ? hint : `${ci + 1} of ${n}`}</span>
                            {/* App addition: an empty Open Label leaves the deck without a link (the landing). */}
                            {!openLabel ? null : isTop ? (
                                <a
                                    href={c.link || undefined}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 12, color: accent, textDecoration: "none", whiteSpace: "nowrap" }}
                                >
                                    {openLabel}
                                </a>
                            ) : (
                                <span>{openLabel}</span>
                            )}
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}

const cardControls: Record<string, any> = {}
for (let k = 1; k <= 6; k++) {
    const d = DEFAULTS[k - 1]
    const hidden = (p: any) => (Number(p.count) || 6) < k
    cardControls[`card${k}Image`] = { type: ControlType.ResponsiveImage, title: `Card ${k} Art`, hidden }
    cardControls[`card${k}Name`] = { type: ControlType.String, title: `Card ${k} Name`, defaultValue: d.name, hidden }
    cardControls[`card${k}Number`] = { type: ControlType.String, title: `Card ${k} No.`, defaultValue: d.number, hidden }
    cardControls[`card${k}Type`] = { type: ControlType.String, title: `Card ${k} Type`, defaultValue: d.type, hidden }
    cardControls[`card${k}Color`] = { type: ControlType.Color, title: `Card ${k} Colour`, defaultValue: (d as any).color, hidden }
    cardControls[`card${k}Link`] = { type: ControlType.Link, title: `Card ${k} Link`, defaultValue: d.link, hidden }
}

addPropertyControls(ProjectCascade, {
    layout: { type: ControlType.Enum, title: "Layout", options: ["Cascade", "Stack"], defaultValue: "Cascade", displaySegmentedControl: true },
    hint: { type: ControlType.String, title: "Hint", defaultValue: "Tap for next", hidden: (p: any) => p.layout !== "Stack" },
    // App addition: the label of the link on the top card. (onIndexChange(index) is code-only.)
    openLabel: { type: ControlType.String, title: "Open Label", defaultValue: "Open case", hidden: (p: any) => p.layout !== "Stack" },
    count: { type: ControlType.Number, title: "Cards", defaultValue: 6, min: 1, max: 6, step: 1, displayStepper: true },
    cardHeight: { type: ControlType.Number, title: "Card Height", defaultValue: 240, min: 140, max: 420, unit: "px" },
    cardFill: { type: ControlType.Color, title: "Card", defaultValue: "#FFFFFF" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#2449E8" },
    edge: { type: ControlType.Color, title: "Edge", defaultValue: "#2449E8" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: "#FF4FA3" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "rgba(36, 73, 232, 0.7)" },
    ...cardControls,
})
