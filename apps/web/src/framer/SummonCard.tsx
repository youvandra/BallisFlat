// @ts-nocheck: verbatim Framer code component (see shim.ts)
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "./shim"
import { Logo } from "../components/ui/Logo"
import { motion, useReducedMotion } from "framer-motion"

/**
 * Summon Card
 * A face-down card in the booking zone. Tap it to summon: it flares, flips and shows how to
 * book you, with a button through to the contact page.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 * @framerIntrinsicWidth 216
 * @framerIntrinsicHeight 400
 */

const display = "'Unbounded', system-ui, sans-serif"
const body = "'Geist', system-ui, sans-serif"

export default function SummonCard(props: any) {
    const {
        title = "Summon a project",
        cost = "2 slots left",
        prompt = "Tap to summon",
        heading = "Start a project",
        rows = "Booking from:March\nProjects from:€4,800\nTimeline:6 to 14 weeks\nReplies:Within 2 days",
        cta = "Summon Noa",
        link = "/contact",
        back = "#FF4FA3",
        edge = "#3FE0FF",
        card = "#1E1E23",
        ink = "#F2F2EE",
        muted = "rgba(242, 242, 238, 0.62)",
        dark = "#141416",
        rule = "rgba(242, 242, 238, 0.14)",
        accent = back,
        onAccent = dark,
        startRevealed = false,
        style,
    } = props
    const isStatic = useIsStaticRenderer()
    const reduce = useReducedMotion()
    const [open, setOpen] = React.useState(!!startRevealed)
    const [flare, setFlare] = React.useState(0)
    React.useEffect(() => setOpen(!!startRevealed), [startRevealed])
    const list = String(rows)
        .split("\n")
        .map((r) => r.split(":"))
        .filter((r) => r[0])

    const summon = () => {
        if (open || isStatic) return
        setFlare((f) => f + 1)
        setOpen(true)
    }
    const face: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        borderRadius: 14,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        overflow: "hidden",
        boxSizing: "border-box",
    }

    return (
        <div style={{ ...style, position: "relative", width: "100%", height: "100%", perspective: 1000 }}>
            <style>{`@import url("https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Geist:wght@500;600&display=swap");`}</style>
            {/* summoning flare behind the card */}
            <motion.div
                key={flare}
                aria-hidden
                initial={{ opacity: 0, scale: 0.6 }}
                animate={flare ? { opacity: [0, 0.95, 0], scale: [0.6, 1.25, 1.5] } : { opacity: 0 }}
                transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    position: "absolute",
                    inset: "-18%",
                    borderRadius: "50%",
                    background: `radial-gradient(closest-side, rgba(255,255,255,0.9), ${edge}99 35%, ${back}55 60%, rgba(0,0,0,0) 75%)`,
                    pointerEvents: "none",
                }}
            />
            {/* idle pulse while face down */}
            {!open && !isStatic && !reduce && (
                <motion.div
                    aria-hidden
                    animate={{ opacity: [0.25, 0.6, 0.25], scale: [0.98, 1.04, 0.98] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                    style={{ position: "absolute", inset: -6, borderRadius: 20, boxShadow: `0 0 28px 4px ${back}88`, pointerEvents: "none" }}
                />
            )}
            <motion.div
                role={open ? undefined : "button"}
                tabIndex={open ? -1 : 0}
                aria-label={open ? undefined : `${title}. ${prompt}`}
                onClick={summon}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), summon())}
                initial={false}
                animate={{ rotateY: open ? 180 : 0, y: open ? 0 : [0, -5, 0] }}
                whileHover={!open && !isStatic ? { y: -8, rotate: -1.5 } : undefined}
                transition={{
                    rotateY: { duration: reduce ? 0 : 0.85, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.12 },
                    y: open ? { duration: 0.3 } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
                    default: { type: "spring", stiffness: 260, damping: 22 },
                }}
                style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", cursor: open ? "default" : "pointer", outlineOffset: 4 }}
            >
                {/* back: face down */}
                <div style={{ ...face, background: back, backgroundImage: `radial-gradient(${dark}2e 1px, transparent 1.5px)`, backgroundSize: "7px 7px", boxShadow: `6px 6px 0 0 ${edge}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "18px 16px 18px" }}>
                    <div style={{ alignSelf: "stretch", display: "flex", justifyContent: "space-between", fontFamily: body, fontWeight: 600, fontSize: 11, color: dark }}>
                        <span>Kickoff</span>
                        <span style={{ padding: "3px 8px", borderRadius: 100, background: dark, color: back }}>{cost}</span>
                    </div>
                    <div style={{ position: "relative", width: "62%", aspectRatio: "1", display: "grid", placeItems: "center" }}>
                        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${dark}` }} />
                        <div style={{ position: "absolute", inset: "14%", borderRadius: "50%", border: `2px dashed ${dark}`, opacity: 0.6 }} />
                        <Logo style={{ width: "74%", height: "auto", color: dark }} />
                    </div>
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 17, lineHeight: 1.05, letterSpacing: "-0.035em", color: dark }}>{title}</div>
                        <div style={{ fontFamily: body, fontWeight: 500, fontSize: 12, color: dark, opacity: 0.7, marginTop: 6 }}>{prompt}</div>
                    </div>
                </div>
                {/* front: how to book */}
                <div style={{ ...face, transform: "rotateY(180deg)", background: card, border: `1.5px solid ${edge}`, boxShadow: `6px 6px 0 0 ${back}`, display: "flex", flexDirection: "column", padding: "0 0 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: back, padding: "9px 14px", fontFamily: display, fontWeight: 700, fontSize: 11, color: dark }}>
                        <span>Summoned</span>
                        <span style={{ fontFamily: body, fontWeight: 600 }}>{cost}</span>
                    </div>
                    <div style={{ padding: "14px 14px 0", fontFamily: display, fontWeight: 800, fontSize: 20, lineHeight: 1.05, letterSpacing: "-0.035em", color: ink }}>{heading}</div>
                    <div style={{ padding: "10px 14px 0", flex: 1 }}>
                        {list.map(([k, v], i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${rule}`, fontFamily: body, fontSize: 12.5 }}>
                                <span style={{ color: muted }}>{k}</span>
                                <span style={{ color: ink, fontWeight: 600, textAlign: "right" }}>{v}</span>
                            </div>
                        ))}
                    </div>
                    <a
                        href={link || undefined}
                        tabIndex={open ? 0 : -1}
                        style={{ margin: "0 14px", padding: "11px 14px", borderRadius: 100, background: accent, color: onAccent, textDecoration: "none", textAlign: "center", fontFamily: body, fontWeight: 600, fontSize: 14, boxShadow: `3px 3px 0 0 ${edge}` }}
                    >
                        {cta} →
                    </a>
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setOpen(false)
                        }}
                        tabIndex={open ? 0 : -1}
                        style={{ all: "unset", alignSelf: "center", marginTop: 9, fontFamily: body, fontSize: 11.5, color: muted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                    >
                        Return to deck
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

addPropertyControls(SummonCard, {
    title: { type: ControlType.String, title: "Title", defaultValue: "Summon a project" },
    cost: { type: ControlType.String, title: "Cost", defaultValue: "2 slots left" },
    prompt: { type: ControlType.String, title: "Prompt", defaultValue: "Tap to summon" },
    heading: { type: ControlType.String, title: "Heading", defaultValue: "Start a project" },
    rows: { type: ControlType.String, title: "Rows", displayTextArea: true, defaultValue: "Booking from:March\nProjects from:€4,800\nTimeline:6 to 14 weeks\nReplies:Within 2 days", description: "One row per line, label:value" },
    cta: { type: ControlType.String, title: "Button", defaultValue: "Summon Noa" },
    link: { type: ControlType.Link, title: "Link", defaultValue: "/contact" },
    startRevealed: { type: ControlType.Boolean, title: "Start Revealed", defaultValue: false },
    back: { type: ControlType.Color, title: "Card Back", defaultValue: "#FF4FA3" },
    edge: { type: ControlType.Color, title: "Edge", defaultValue: "#3FE0FF" },
    card: { type: ControlType.Color, title: "Card", defaultValue: "#1E1E23" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#F2F2EE" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "rgba(242, 242, 238, 0.62)" },
    dark: { type: ControlType.Color, title: "Dark", defaultValue: "#141416" },
    rule: { type: ControlType.Color, title: "Rule", defaultValue: "rgba(242, 242, 238, 0.14)" },
})
