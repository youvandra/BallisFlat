// @ts-nocheck: verbatim Framer code component (see shim.ts)
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "./shim"

/**
 * Turn Phases
 * How a project plays out, as four phases of a card game turn. Click a phase to see it, or
 * press Play a turn to step through all four.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 396
 */

const display = "'Unbounded', system-ui, sans-serif"
const body = "'Geist', system-ui, sans-serif"
const FONTS = `@import url("https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Geist:wght@500;600&display=swap");`

const ICON: Record<string, (c: string) => JSX.Element> = {
    Draw: (c) => (
        <>
            <path d="M8 6h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill={c} fillOpacity={0.55} stroke="none" transform="translate(2 2)" />
            <path d="M8 6h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM10 12h8M10 16h8M10 20h5" />
        </>
    ),
    Plan: (c) => (
        <>
            <circle cx="14" cy="14" r="9" fill={c} fillOpacity={0.55} stroke="none" transform="translate(2 2)" />
            <circle cx="14" cy="14" r="9" />
            <path d="M14 5v18M5 14h18" />
        </>
    ),
    Play: (c) => (
        <>
            <path d="M9 6l14 8-14 8Z" fill={c} fillOpacity={0.6} stroke="none" transform="translate(2 2)" />
            <path d="M9 6l14 8-14 8Z" />
        </>
    ),
    Hand: (c) => (
        <>
            <rect x="5" y="9" width="18" height="13" rx="2" fill={c} fillOpacity={0.55} stroke="none" transform="translate(2 2)" />
            <rect x="5" y="9" width="18" height="13" rx="2" />
            <path d="M10 9V7a4 4 0 0 1 8 0v2M14 14v3" />
        </>
    ),
}
const DEFAULTS = [
    { name: "Draw", time: "Week 1", head: "The brief", text: "A long call and a short workshop. We agree what the brand has to do, who it is for and what done looks like.", get: "One-page brief, Fixed price, Timeline", icon: "Draw", tint: "#FF4FA3" },
    { name: "Plan", time: "Weeks 2 to 4", head: "One system", text: "Two or three directions shown in real use. You pick one and we sharpen it together.", get: "Directions, Name and mark, Type and colour", icon: "Plan", tint: "#3FE0FF" },
    { name: "Play", time: "Weeks 5 to 10", head: "Build and test", text: "The system goes onto every surface: product screens, packaging, print and launch assets, tested at real size.", get: "App UI kit, Packaging, Launch assets", icon: "Play", tint: "#FFE800" },
    { name: "Hand over", time: "Weeks 11 to 14", head: "Yours to run", text: "Clean files, a short guideline and a recorded walkthrough, so your team can keep going without me.", get: "Source files, Guidelines, Walkthrough video", icon: "Hand", tint: "#FF4FA3" },
]

export default function TurnPhases(props: any) {
    const { summary = "A typical project takes 6 to 14 weeks", playLabel = "Play a turn", showPlay = true, ink = "#F2F2EE", muted = "rgba(242, 242, 238, 0.62)", card = "#1E1E23", panel = "#26262C", line = "rgba(242, 242, 238, 0.12)", accent = "#FF4FA3", edge = "#3FE0FF", dark = "#141416", style } = props
    const isStatic = useIsStaticRenderer()
    const phases = DEFAULTS.map((d, i) => {
        const k = i + 1
        return {
            name: props[`phase${k}Name`] ?? d.name,
            time: props[`phase${k}Time`] ?? d.time,
            head: props[`phase${k}Head`] ?? d.head,
            text: props[`phase${k}Text`] ?? d.text,
            get: String(props[`phase${k}Get`] ?? d.get).split(",").map((s) => s.trim()).filter(Boolean),
            icon: d.icon,
            tint: d.tint,
        }
    })
    const [cur, setCur] = React.useState(0)
    const [playing, setPlaying] = React.useState(false)
    React.useEffect(() => {
        if (!playing || isStatic) return
        if (cur >= phases.length - 1) {
            setPlaying(false)
            return
        }
        const t = window.setTimeout(() => setCur((c) => c + 1), 2400)
        return () => window.clearTimeout(t)
    }, [playing, cur, isStatic])
    const p = phases[cur]

    return (
        <div style={{ ...style, display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
            <style>{FONTS}</style>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))`, gap: 8 }}>
                {phases.map((ph, i) => {
                    const on = i === cur
                    return (
                        <button
                            key={i}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                                setPlaying(false)
                                setCur(i)
                            }}
                            style={{
                                all: "unset",
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                                padding: "10px 10px 12px",
                                borderRadius: 10,
                                background: card,
                                border: `1.5px solid ${on ? accent : line}`,
                                boxShadow: on ? `4px 4px 0 0 ${accent}` : "none",
                                transform: on ? "translateY(-3px)" : "none",
                                transition: "border-color .25s, transform .25s, box-shadow .25s",
                                minWidth: 0,
                                outlineOffset: 3,
                            }}
                        >
                            <svg width="30" height="30" viewBox="0 0 28 28" fill="none" stroke={ink} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                {ICON[ph.icon](ph.tint)}
                            </svg>
                            <span style={{ fontFamily: display, fontWeight: 700, fontSize: 12.5, letterSpacing: "-0.02em", color: ink }}>{ph.name}</span>
                            <span style={{ fontFamily: body, fontSize: 11, color: muted }}>{ph.time}</span>
                        </button>
                    )
                })}
            </div>
            <div aria-live="polite" style={{ padding: "14px 16px", borderRadius: 12, background: panel, border: `1px solid ${line}`, minHeight: 132 }}>
                <span style={{ fontFamily: body, fontWeight: 600, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: accent }}>
                    Phase {cur + 1} of {phases.length}, {p.time}
                </span>
                <div style={{ margin: "6px 0", fontFamily: display, fontWeight: 700, fontSize: 18, lineHeight: 1.1, letterSpacing: "-0.03em", color: ink }}>{p.head}</div>
                <p style={{ margin: 0, fontFamily: body, fontSize: 13.5, lineHeight: 1.5, color: muted }}>{p.text}</p>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {p.get.map((g: string, i: number) => (
                        <span key={i} style={{ padding: "4px 9px", borderRadius: 100, background: dark, border: `1px solid ${line}`, fontFamily: body, fontSize: 11.5, color: ink }}>
                            {g}
                        </span>
                    ))}
                </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontFamily: body, fontSize: 12, color: muted }}>{summary}</span>
                {/* App addition: showPlay={false} hides the autoplay control. */}
                {showPlay && <button
                    type="button"
                    onClick={() => {
                        if (playing) return setPlaying(false)
                        setCur(0)
                        setPlaying(true)
                    }}
                    style={{ all: "unset", cursor: "pointer", padding: "8px 14px", borderRadius: 100, background: accent, color: dark, fontFamily: body, fontWeight: 600, fontSize: 13, boxShadow: `3px 3px 0 0 ${edge}`, outlineOffset: 3, whiteSpace: "nowrap" }}
                >
                    {playing ? "Pause" : playLabel}
                </button>}
            </div>
        </div>
    )
}

const pc: Record<string, any> = {}
for (let k = 1; k <= 4; k++) {
    const d = DEFAULTS[k - 1]
    pc[`phase${k}Name`] = { type: ControlType.String, title: `Phase ${k}`, defaultValue: d.name }
    pc[`phase${k}Time`] = { type: ControlType.String, title: `Phase ${k} Time`, defaultValue: d.time }
    pc[`phase${k}Head`] = { type: ControlType.String, title: `Phase ${k} Heading`, defaultValue: d.head }
    pc[`phase${k}Text`] = { type: ControlType.String, title: `Phase ${k} Text`, defaultValue: d.text, displayTextArea: true }
    pc[`phase${k}Get`] = { type: ControlType.String, title: `Phase ${k} You get`, defaultValue: d.get, description: "Comma separated" }
}
addPropertyControls(TurnPhases, {
    summary: { type: ControlType.String, title: "Summary", defaultValue: "A typical project takes 6 to 14 weeks" },
    playLabel: { type: ControlType.String, title: "Play Label", defaultValue: "Play a turn" },
    ...pc,
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#F2F2EE" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "rgba(242, 242, 238, 0.62)" },
    card: { type: ControlType.Color, title: "Card", defaultValue: "#1E1E23" },
    panel: { type: ControlType.Color, title: "Panel", defaultValue: "#26262C" },
    line: { type: ControlType.Color, title: "Line", defaultValue: "rgba(242, 242, 238, 0.12)" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: "#FF4FA3" },
    edge: { type: ControlType.Color, title: "Edge", defaultValue: "#3FE0FF" },
    dark: { type: ControlType.Color, title: "Dark", defaultValue: "#141416" },
})
