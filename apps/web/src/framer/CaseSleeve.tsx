// @ts-nocheck: verbatim Framer code component (see shim.ts)
import * as React from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "./shim"

/**
 * Case Sleeve
 * The project's card on its case page, in the same sleeve style as the Work grid: cover,
 * discipline badge, number and title. It tilts toward the pointer with a soft glare.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 * @framerIntrinsicWidth 260
 * @framerIntrinsicHeight 390
 */

const display = "'Unbounded', system-ui, sans-serif"
const body = "'Geist', system-ui, sans-serif"
const FONTS = `@import url("https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Geist:wght@500;600&display=swap");`

export default function CaseSleeve(props: any) {
    const { image, title = "Onebank", number = "002", type = "Rebrand", discipline = "Identity", color = "#FF4FA3", year = "2026", card = "#1E1E23", ink = "#F2F2EE", muted = "rgba(242, 242, 238, 0.62)", line = "rgba(242, 242, 238, 0.14)", edge = "#3FE0FF", dark = "#141416", tilt = true, style } = props
    const isStatic = useIsStaticRenderer()
    const [t, setT] = React.useState({ rx: 0, ry: 0, mx: 50, my: 30, on: false })
    const src = (image && image.src) || ""
    const move = (e: React.PointerEvent) => {
        if (!tilt || isStatic) return
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width
        const y = (e.clientY - r.top) / r.height
        setT({ rx: (0.5 - y) * 12, ry: (x - 0.5) * 14, mx: x * 100, my: y * 100, on: true })
    }
    return (
        <div style={{ ...style, width: "100%", height: "100%", perspective: 900 }} onPointerMove={move} onPointerLeave={() => setT({ rx: 0, ry: 0, mx: 50, my: 30, on: false })}>
            <style>{FONTS}</style>
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 8,
                    boxSizing: "border-box",
                    borderRadius: 16,
                    background: card,
                    border: `1.5px solid ${line}`,
                    boxShadow: `6px 6px 0 0 ${edge}`,
                    transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)`,
                    transition: t.on ? "transform .15s ease-out" : "transform .6s cubic-bezier(.2,.8,.2,1)",
                    overflow: "hidden",
                }}
            >
                <div role="img" aria-label={(image && image.alt) || title} style={{ position: "relative", flex: 1, minHeight: 0, borderRadius: 10, background: `${dark} center / cover no-repeat`, backgroundImage: src ? `url(${src})` : undefined }}>
                    <span style={{ position: "absolute", top: 10, right: 10, padding: "4px 9px", borderRadius: 100, background: color, fontFamily: display, fontWeight: 700, fontSize: 11, color: dark }}>{discipline}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "0 6px" }}>
                    <span style={{ fontFamily: display, fontWeight: 800, fontSize: 19, letterSpacing: "-0.035em", color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                    <span style={{ fontFamily: body, fontSize: 12, color: muted }}>{number}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0 6px 6px", fontFamily: body, fontSize: 12, color: muted }}>
                    <span>{type}</span>
                    <span>{year}</span>
                </div>
                <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(circle at ${t.mx}% ${t.my}%, rgba(255,255,255,0.22), rgba(255,255,255,0) 50%)`, mixBlendMode: "overlay", opacity: t.on ? 1 : 0, transition: "opacity .3s" }} />
            </div>
        </div>
    )
}

addPropertyControls(CaseSleeve, {
    image: { type: ControlType.ResponsiveImage, title: "Cover" },
    title: { type: ControlType.String, title: "Title", defaultValue: "Onebank" },
    number: { type: ControlType.String, title: "Number", defaultValue: "002" },
    type: { type: ControlType.String, title: "Type", defaultValue: "Rebrand" },
    year: { type: ControlType.String, title: "Year", defaultValue: "2026" },
    discipline: { type: ControlType.String, title: "Discipline", defaultValue: "Identity" },
    color: { type: ControlType.Color, title: "Discipline Colour", defaultValue: "#FF4FA3" },
    tilt: { type: ControlType.Boolean, title: "Tilt", defaultValue: true },
    card: { type: ControlType.Color, title: "Card", defaultValue: "#1E1E23" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#F2F2EE" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "rgba(242, 242, 238, 0.62)" },
    line: { type: ControlType.Color, title: "Line", defaultValue: "rgba(242, 242, 238, 0.14)" },
    edge: { type: ControlType.Color, title: "Shadow", defaultValue: "#3FE0FF" },
    dark: { type: ControlType.Color, title: "Dark", defaultValue: "#141416" },
})
