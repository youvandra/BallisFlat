// @ts-nocheck: verbatim Framer code component (see shim.ts)
import { addPropertyControls, ControlType, useIsStaticRenderer } from "./shim"
import { motion, useReducedMotion } from "framer-motion"
import { useEffect, useRef, useState, startTransition, type CSSProperties } from "react"

/**
 * Skill Stack: ability cards in a squared-up deck. Tap the top card to send it to the
 * back and bring up the next skill.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */

const DEFAULTS = [
    { name: "Brand identity", power: "98", text: "Names, marks and systems that hold up at 16 pixels and on a billboard.", tag: "Strategy", icon: "Brand" },
    { name: "Product design", power: "94", text: "Apps and sites that feel obvious the first time you use them.", tag: "Interface", icon: "Product" },
    { name: "Packaging", power: "91", text: "Boxes, pouches and labels that earn their place on the shelf.", tag: "Print", icon: "Packaging" },
    { name: "Art direction", power: "89", text: "Shoots, 3D and campaigns that look like the brand, not like a trend.", tag: "Image", icon: "Art" },
    { name: "Motion", power: "82", text: "Small moves that make an interface feel alive.", tag: "Interface", icon: "Motion" },
]

/* riso-style ability icons: a flat second-ink fill, printed slightly off register under the ink line */
const ICONS: Record<string, { fill: JSX.Element; line: JSX.Element }> = {
    Brand: {
        fill: <circle cx="19" cy="22" r="12" />,
        line: (
            <>
                <circle cx="19" cy="22" r="12" />
                <rect x="22" y="18" width="18" height="18" rx="2.5" />
                <path d="M33 8 L34.6 11.4 L38 13 L34.6 14.6 L33 18 L31.4 14.6 L28 13 L31.4 11.4 Z" />
            </>
        ),
    },
    Product: {
        fill: <rect x="9" y="7" width="26" height="34" rx="4" />,
        line: (
            <>
                <rect x="9" y="7" width="26" height="34" rx="4" />
                <path d="M9 14 H35 M15 21 H29 M15 26 H24" />
                <path d="M29 27 L41 32 L36 34 L33.5 39 Z" />
            </>
        ),
    },
    Packaging: {
        fill: <path d="M24 6 L40 14 L24 22 L8 14 Z" />,
        line: (
            <>
                <path d="M24 6 L40 14 L40 34 L24 42 L8 34 L8 14 Z" />
                <path d="M8 14 L24 22 L40 14 M24 22 V42" />
                <path d="M16 10 L32 18 V24" />
            </>
        ),
    },
    Art: {
        fill: <path d="M7 34 L18 24 L26 30 L32 25 L41 32 V37 H7 Z" />,
        line: (
            <>
                <rect x="7" y="10" width="34" height="27" rx="3" />
                <circle cx="17" cy="18" r="3.5" />
                <path d="M7 32 L18 24 L26 30 L32 25 L41 32" />
            </>
        ),
    },
    Motion: {
        fill: <circle cx="33" cy="24" r="9" />,
        line: (
            <>
                <circle cx="33" cy="24" r="9" />
                <path d="M5 17 H19 M9 24 H21 M5 31 H19" />
            </>
        ),
    },
    Spark: {
        fill: <path d="M24 6 L28 20 L42 24 L28 28 L24 42 L20 28 L6 24 L20 20 Z" />,
        line: <path d="M24 6 L28 20 L42 24 L28 28 L24 42 L20 28 L6 24 L20 20 Z" />,
    },
}
const ICON_KEYS = Object.keys(ICONS)

function SkillIcon({ icon, band, ink, size = 72, weight = 2 }: { icon: string; band: string; ink: string; size?: number; weight?: number }) {
    const ic = ICONS[icon] || ICONS.Spark
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ display: "block", overflow: "visible" }}>
            <g transform="translate(2.5 2.5)" fill={band} fillOpacity={0.55} stroke="none">
                {ic.fill}
            </g>
            <g fill="none" stroke={ink} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
                {ic.line}
            </g>
        </svg>
    )
}

interface Props {
    count: number
    hint: string
    cardFill: string
    ink: string
    edge: string
    muted: string
    band1: string
    band2: string
    band3: string
    [key: string]: any
    style?: CSSProperties
}

export default function SkillStack(props: Props) {
    const {
        count = 5,
        hint = "Tap to shuffle",
        cardFill = "#FFFFFF",
        ink = "#2449E8",
        edge = "#2449E8",
        muted = "rgba(36, 73, 232, 0.7)",
        band1 = "#FF4FA3",
        band2 = "#2449E8",
        band3 = "#FFE800",
        style,
    } = props
    const isStatic = useIsStaticRenderer()
    const reduce = useReducedMotion()
    const n = Math.max(1, Math.min(5, Number(count) || 5))
    const skills = Array.from({ length: n }, (_, i) => {
        const k = i + 1
        const d = DEFAULTS[i]
        return {
            name: props[`skill${k}Name`] ?? d.name,
            power: props[`skill${k}Power`] ?? d.power,
            text: props[`skill${k}Text`] ?? d.text,
            tag: props[`skill${k}Tag`] ?? d.tag,
            icon: props[`skill${k}Icon`] ?? d.icon,
            band: [band1, band2, band3][i % 3],
        }
    })
    const [order, setOrder] = useState(() => skills.map((_, i) => i))
    const [leaving, setLeaving] = useState<number | null>(null)
    const ord = order.filter((i) => i < n).concat(skills.map((_, i) => i).filter((i) => !order.includes(i)))

    const shuffle = () => {
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
    }

    if (props.layout === "Cascade") return <SkillCascade {...props} skills={skills} isStatic={isStatic} />

    return (
        <div style={{ ...style, position: "relative", width: "100%", height: "100%", overflow: "visible" }}>
            {ord.map((si, depth) => {
                const s = skills[si]
                const isTop = depth === 0
                const out = leaving === si
                const d = Math.min(depth, 4)
                return (
                    <motion.div
                        key={si}
                        role={isTop ? "button" : undefined}
                        tabIndex={isTop ? 0 : -1}
                        aria-label={isTop ? `${s.name}. ${hint}` : undefined}
                        onClick={isTop ? shuffle : undefined}
                        onKeyDown={(e) => isTop && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), shuffle())}
                        initial={false}
                        animate={
                            out
                                ? { x: "62%", y: -18, rotate: 12, opacity: 0.0 }
                                : { x: d * 7, y: d * 7, rotate: d % 2 ? 1.6 : -1.2 * (d > 0 ? 1 : 0), opacity: 1 }
                        }
                        whileHover={isTop && !isStatic ? { y: -4, rotate: -1.5 } : undefined}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            right: 30,
                            bottom: 30,
                            zIndex: n - depth,
                            display: "flex",
                            flexDirection: "column",
                            borderRadius: 14,
                            background: cardFill,
                            border: `2px solid ${edge}`,
                            boxShadow: isTop ? `5px 5px 0 0 ${edge}` : "none",
                            overflow: "hidden",
                            cursor: isTop ? "pointer" : "default",
                            outlineOffset: 4,
                        }}
                    >
                        <div style={{ background: s.band, padding: "9px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                            <span style={{ fontFamily: "'Unbounded', system-ui, sans-serif", fontWeight: 700, fontSize: 11, color: s.band === band3 ? "#1B1B1F" : cardFill }}>Ability</span>
                            <span style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 11, color: s.band === band3 ? "#1B1B1F" : cardFill }}>
                                {si + 1} of {n}
                            </span>
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: "14px 14px 12px 14px", minHeight: 0 }}>
                            <div style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 500, fontSize: 12, color: muted }}>{s.tag}</div>
                            <div style={{ fontFamily: "'Unbounded', system-ui, sans-serif", fontWeight: 700, fontSize: 20, lineHeight: 1.1, letterSpacing: "-0.03em", color: ink }}>{s.name}</div>
                            <div style={{ fontFamily: "'Geist', system-ui, sans-serif", fontSize: 13, lineHeight: 1.45, color: muted }}>{s.text}</div>
                            <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><SkillIcon icon={s.icon} band={s.band} ink={ink} size={76} /></div>
                            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: `1.5px solid ${edge}`, paddingTop: 10 }}>
                                <div>
                                    <div style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 500, fontSize: 11, color: muted }}>Power</div>
                                    <div style={{ fontFamily: "'Unbounded', system-ui, sans-serif", fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: "-0.04em", color: ink }}>{s.power}</div>
                                </div>
                                {isTop && <div style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 500, fontSize: 12, color: muted }}>{hint}</div>}
                            </div>
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}

/* the same skills as a solitaire column: every band shows the skill and its power, hover pulls a card out */
function SkillCascade(props: any) {
    const { skills, isStatic, cardFill = "#FFFFFF", ink = "#2449E8", edge = "#2449E8", muted = "rgba(36, 73, 232, 0.7)", style } = props
    const ref = useRef<HTMLDivElement>(null)
    const [h, setH] = useState(440)
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
    const n = skills.length
    // always fit the frame: tighten the bands first, then shorten the open card
    const ch = Math.max(120, Math.min(Number(props.cardHeight) || 250, h - (n - 1) * 28 - 8))
    const step = n > 1 ? Math.min(46, Math.max(28, (h - ch - 8) / (n - 1))) : 0

    return (
        <div ref={ref} style={{ ...style, position: "relative", width: "100%", height: "100%", overflow: "visible" }}>
            {skills.map((s: any, i: number) => {
                const up = hover === i && i < n - 1
                return (
                    <motion.div
                        key={i}
                        tabIndex={0}
                        aria-label={`${s.name}, power ${s.power}. ${s.text}`}
                        onHoverStart={() => !isStatic && startTransition(() => setHover(i))}
                        onHoverEnd={() => !isStatic && startTransition(() => setHover((v) => (v === i ? null : v)))}
                        onFocus={() => startTransition(() => setHover(i))}
                        onBlur={() => startTransition(() => setHover(null))}
                        animate={{ x: up ? 14 : 0, y: up ? -6 : 0, rotate: up ? 1.5 : 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 24 }}
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 22,
                            top: i * step,
                            height: ch,
                            zIndex: up ? 40 : i + 1,
                            display: "flex",
                            flexDirection: "column",
                            boxSizing: "border-box",
                            borderRadius: 12,
                            background: cardFill,
                            border: `2px solid ${edge}`,
                            boxShadow: `${up ? 7 : 4}px ${up ? 7 : 4}px 0 0 ${up ? s.band : edge}`,
                            overflow: "hidden",
                            outlineOffset: 4,
                        }}
                    >
                        {/* the band you can always read */}
                        <div style={{ display: "flex", alignItems: "center", gap: 7, height: step > 0 ? Math.max(28, Math.min(step - 2, 44)) : 32, padding: "0 10px", flexShrink: 0 }}>
                            <span style={{ flexShrink: 0, display: "flex" }}>
                                <SkillIcon icon={s.icon} band={s.band} ink={ink} size={17} weight={3} />
                            </span>
                            <span style={{ flex: 1, fontFamily: "'Unbounded', system-ui, sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "-0.03em", color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                            <span style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 12, color: muted, fontVariantNumeric: "tabular-nums" }}>{s.power}</span>
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: "6px 12px 12px 12px", minHeight: 0 }}>
                            <div style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 500, fontSize: 12, color: muted }}>{s.tag}</div>
                            <div style={{ fontFamily: "'Geist', system-ui, sans-serif", fontSize: 13, lineHeight: 1.45, color: ink }}>{s.text}</div>
                            <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}><SkillIcon icon={s.icon} band={s.band} ink={ink} size={ch > 260 ? 96 : ch > 200 ? 64 : 0} /></div>
                            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                                <div style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 500, fontSize: 11, color: muted }}>Power</div>
                                <div style={{ fontFamily: "'Unbounded', system-ui, sans-serif", fontWeight: 800, fontSize: 26, lineHeight: 1, letterSpacing: "-0.04em", color: ink }}>{s.power}</div>
                            </div>
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}

const skillControls: Record<string, any> = {}
for (let k = 1; k <= 5; k++) {
    const d = DEFAULTS[k - 1]
    const hidden = (p: any) => (Number(p.count) || 5) < k
    skillControls[`skill${k}Name`] = { type: ControlType.String, title: `Skill ${k}`, defaultValue: d.name, hidden }
    skillControls[`skill${k}Tag`] = { type: ControlType.String, title: `Skill ${k} Tag`, defaultValue: d.tag, hidden }
    skillControls[`skill${k}Power`] = { type: ControlType.String, title: `Skill ${k} Power`, defaultValue: d.power, hidden }
    skillControls[`skill${k}Icon`] = { type: ControlType.Enum, title: `Skill ${k} Icon`, options: ICON_KEYS, optionTitles: ["Mark", "Screen", "Box", "Frame", "Motion", "Spark"], defaultValue: d.icon, hidden }
    skillControls[`skill${k}Text`] = { type: ControlType.String, title: `Skill ${k} Text`, defaultValue: d.text, displayTextArea: true, hidden }
}

addPropertyControls(SkillStack, {
    layout: { type: ControlType.Enum, title: "Layout", options: ["Stack", "Cascade"], defaultValue: "Stack", displaySegmentedControl: true },
    cardHeight: { type: ControlType.Number, title: "Card Height", defaultValue: 250, min: 140, max: 420, unit: "px", hidden: (p: any) => p.layout !== "Cascade" },
    count: { type: ControlType.Number, title: "Skills", defaultValue: 5, min: 1, max: 5, step: 1, displayStepper: true },
    hint: { type: ControlType.String, title: "Hint", defaultValue: "Tap to shuffle", hidden: (p: any) => p.layout === "Cascade" },
    cardFill: { type: ControlType.Color, title: "Card", defaultValue: "#FFFFFF" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#2449E8" },
    edge: { type: ControlType.Color, title: "Edge", defaultValue: "#2449E8" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "rgba(36, 73, 232, 0.7)" },
    band1: { type: ControlType.Color, title: "Band 1", defaultValue: "#FF4FA3" },
    band2: { type: ControlType.Color, title: "Band 2", defaultValue: "#2449E8" },
    band3: { type: ControlType.Color, title: "Band 3", defaultValue: "#FFE800" },
    ...skillControls,
})
