// @ts-nocheck: verbatim Framer code component (see shim.ts)
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "./shim"
import { motion, useReducedMotion } from "framer-motion"

/**
 * Missing Card
 * An empty binder slot for the 404 page. Hover or tap it and a card slides into the slot,
 * wobbles as if it does not fit, and drops back out.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 * @framerIntrinsicWidth 220
 * @framerIntrinsicHeight 318
 */

const display = "'Unbounded', system-ui, sans-serif"
const body = "'Geist', system-ui, sans-serif"
const FONTS = `@import url("https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Geist:wght@500;600&display=swap");`

export default function MissingCard(props: any) {
    const { code = "404", label = "Empty slot", hint = "Not this one", line = "rgba(242, 242, 238, 0.32)", ink = "#F2F2EE", muted = "rgba(242, 242, 238, 0.62)", back = "#FF4FA3", edge = "#3FE0FF", dark = "#141416", style } = props
    const isStatic = useIsStaticRenderer()
    const reduce = useReducedMotion()
    const [run, setRun] = React.useState(0)
    const busy = React.useRef(false)
    const go = () => {
        if (isStatic || busy.current) return
        busy.current = true
        setRun((r) => r + 1)
        window.setTimeout(() => (busy.current = false), reduce ? 0 : 1700)
    }
    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`${label}. ${hint}.`}
            onPointerEnter={go}
            onClick={go}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go())}
            style={{ ...style, position: "relative", width: "100%", height: "100%", cursor: "pointer", outlineOffset: 6 }}
        >
            <style>{FONTS}</style>
            {/* the empty slot */}
            <div style={{ position: "absolute", inset: 0, borderRadius: 16, border: `2px dashed ${line}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ fontFamily: display, fontWeight: 800, fontSize: 64, letterSpacing: "-0.06em", lineHeight: 1, color: "transparent", WebkitTextStroke: `1.5px ${ink}` }}>{code}</span>
                <span style={{ fontFamily: body, fontWeight: 600, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: muted }}>{label}</span>
            </div>
            {/* the card that will not fit */}
            <motion.div
                key={run}
                aria-hidden
                initial={{ y: "115%", rotate: 6, opacity: 0 }}
                animate={
                    run && !reduce
                        ? { y: ["115%", "8%", "8%", "8%", "8%", "120%"], rotate: [6, 0, -4, 4, -2, 10], opacity: [0, 1, 1, 1, 1, 0] }
                        : { y: "115%", opacity: 0 }
                }
                transition={{ duration: 1.6, times: [0, 0.3, 0.45, 0.6, 0.72, 1], ease: "easeInOut" }}
                style={{
                    position: "absolute",
                    inset: 10,
                    borderRadius: 12,
                    background: back,
                    backgroundImage: `radial-gradient(${dark}2e 1px, transparent 1.5px)`,
                    backgroundSize: "7px 7px",
                    boxShadow: `5px 5px 0 0 ${edge}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    pointerEvents: "none",
                }}
            >
                <div style={{ width: 74, height: 74, borderRadius: "50%", border: `2px solid ${dark}`, display: "grid", placeItems: "center", fontFamily: display, fontWeight: 800, fontSize: 24, letterSpacing: "-0.05em", color: dark }}>BF</div>
                <span style={{ fontFamily: display, fontWeight: 700, fontSize: 13, color: dark }}>{hint}</span>
            </motion.div>
        </div>
    )
}

addPropertyControls(MissingCard, {
    code: { type: ControlType.String, title: "Code", defaultValue: "404" },
    label: { type: ControlType.String, title: "Label", defaultValue: "Empty slot" },
    hint: { type: ControlType.String, title: "Card Text", defaultValue: "Not this one" },
    line: { type: ControlType.Color, title: "Slot Line", defaultValue: "rgba(242, 242, 238, 0.32)" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#F2F2EE" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "rgba(242, 242, 238, 0.62)" },
    back: { type: ControlType.Color, title: "Card", defaultValue: "#FF4FA3" },
    edge: { type: ControlType.Color, title: "Shadow", defaultValue: "#3FE0FF" },
    dark: { type: ControlType.Color, title: "Dark", defaultValue: "#141416" },
})
