// @ts-nocheck: verbatim Framer code component (see shim.ts)
import * as React from "react"
import { createPortal } from "react-dom"
import { addPropertyControls, ControlType, useIsStaticRenderer, RenderTarget } from "./shim"

/**
 * Hand Cursor
 * A drawn hand that replaces the mouse cursor: a pointing hand by default, an open hand
 * over anything clickable, and a closed fist while the button is held. Touch screens and
 * text fields keep their normal cursor.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 * @framerIntrinsicWidth 40
 * @framerIntrinsicHeight 40
 */

const POINT =
    "M12 3c1.4 0 2.5 1.1 2.5 2.5V13l1-.1v-1.4c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2v1.6l.9.1v-.6c0-1.1.9-2 2-2s2 .9 2 2v2l.4.1c1.1 0 2 .9 2 2V21c0 4.6-3.7 8.5-8.3 8.5h-2.1c-2.7 0-5.2-1.4-6.6-3.7l-3.6-5.9c-.7-1.1-.3-2.6.9-3.2 1-.5 2.3-.2 3 .7l.8 1.1V5.5C9.5 4.1 10.6 3 12 3Z"
const OPEN =
    "M9.5 15V7.8a1.8 1.8 0 0 1 3.6 0V13V5.3a1.8 1.8 0 0 1 3.6 0V13V6.3a1.8 1.8 0 0 1 3.6 0V13.6V9a1.8 1.8 0 0 1 3.6 0V21c0 4.7-3.7 8.5-8.3 8.5h-1.2c-2.9 0-5.4-1.5-6.8-4l-3.6-6.3c-.6-1-.3-2.3.7-2.9.9-.5 2.1-.3 2.8.5L9.5 19Z"
const FIST =
    "M8.5 14.5c0-1.9 1.5-3.4 3.4-3.4h9.6c2.9 0 5.2 2.3 5.2 5.2V21c0 4.6-3.7 8.5-8.3 8.5h-2c-4.4 0-7.9-3.6-7.9-8v-7Z"
const KNUCKLES = "M12.5 11.2v4M16.5 11.2v4M20.5 11.4v3.8"

type Pose = "point" | "open" | "fist"

function Hand({ pose, riso, line, fill, misprint, grab, size }: { pose: Pose; riso: boolean; line: string; fill: string; misprint: string; grab: string; size: number }) {
    const d = pose === "point" ? POINT : pose === "open" ? OPEN : FIST
    const off = pose === "fist" ? grab : misprint
    return (
        <svg width={size} height={size} viewBox="0 0 34 34" style={{ display: "block", overflow: "visible" }} aria-hidden>
            {riso && <path d={d} fill={off} transform="translate(2 2)" />}
            <path d={d} fill={riso ? fill : "rgba(20, 20, 22, 0.45)"} stroke={line} strokeWidth={1.6} strokeLinejoin="round" />
            {pose === "fist" && <path d={KNUCKLES} fill="none" stroke={line} strokeWidth={1.6} strokeLinecap="round" />}
        </svg>
    )
}

const HOT = "a, button, [role='button'], [role='link'], label, summary, [data-cursor], [style*='cursor: pointer'], [style*='cursor: grab']"
const TEXT = "input, textarea, select, [contenteditable='true']"

export default function HandCursor(props: any) {
    const { variant = "Riso", line = "#F2F2EE", fill = "#141416", misprint = "#FF4FA3", grab = "#3FE0FF", size = 34, style } = props
    const riso = variant === "Riso"
    const isStatic = useIsStaticRenderer()
    const ref = React.useRef<HTMLDivElement>(null)
    const [pose, setPose] = React.useState<Pose>("point")
    const [on, setOn] = React.useState(false)
    const [mounted, setMounted] = React.useState(false)
    // App addition: a modal <dialog> sits in the browser's top layer, above any z-index, so the hand would
    // slide under it. While one is open the hand is portalled into the topmost open dialog instead.
    const [host, setHost] = React.useState<HTMLElement | null>(null)
    const last = React.useRef({ x: -100, y: -100 })
    React.useEffect(() => {
        if (isStatic || typeof document === "undefined") return
        const pickHost = () => {
            const open = Array.from(document.querySelectorAll("dialog[open]")) as HTMLElement[]
            const top = open.filter((d) => d.matches(":modal")).pop() ?? null
            setHost((current) => (current === top ? current : top))
        }
        pickHost()
        const observer = new MutationObserver(pickHost)
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] })
        return () => observer.disconnect()
    }, [isStatic])

    React.useEffect(() => {
        if (isStatic || typeof window === "undefined") return
        if (!window.matchMedia("(pointer: fine)").matches) return
        setMounted(true)
        const css = document.createElement("style")
        css.id = "hand-cursor-css"
        css.textContent = `@media (pointer: fine) { html, body, body * { cursor: none !important; } ${TEXT} { cursor: auto !important; } }`
        document.head.appendChild(css)
        let hot = false
        let down = false
        let text = false
        let shown = false
        const pick = () => setPose(down ? "fist" : hot ? "open" : "point")
        const move = (e: PointerEvent) => {
            if (e.pointerType !== "mouse") return
            const el = ref.current
            last.current = { x: e.clientX, y: e.clientY }
            if (el) el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`
            const t = e.target as Element | null
            text = !!(t && t.closest && t.closest(TEXT))
            const h = !!(t && t.closest && t.closest(HOT))
            if (h !== hot) {
                hot = h
                pick()
            }
            if (shown !== !text) {
                shown = !text
                setOn(shown)
            }
        }
        const press = () => {
            down = true
            pick()
        }
        const release = () => {
            down = false
            pick()
        }
        const leave = () => {
            shown = false
            setOn(false)
        }
        window.addEventListener("pointermove", move, { passive: true })
        window.addEventListener("pointerdown", press)
        window.addEventListener("pointerup", release)
        document.documentElement.addEventListener("mouseleave", leave)
        return () => {
            window.removeEventListener("pointermove", move)
            window.removeEventListener("pointerdown", press)
            window.removeEventListener("pointerup", release)
            document.documentElement.removeEventListener("mouseleave", leave)
            css.remove()
        }
    }, [isStatic])

    // on the canvas: show what it looks like
    const onCanvas = RenderTarget.current() === RenderTarget.canvas
    if (!onCanvas && !mounted) return <div style={{ ...style, pointerEvents: "none" }} />
    if (onCanvas)
        return (
            <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Hand pose="point" riso={riso} line={line} fill={fill} misprint={misprint} grab={grab} size={size} />
            </div>
        )

    return createPortal(
        <div
            ref={ref}
            aria-hidden
            style={{
                position: "fixed",
                left: 0,
                top: 0,
                zIndex: 2147483647,
                pointerEvents: "none",
                // App addition: a remount (moving into or out of a dialog) starts at the last pointer spot.
                transform: `translate3d(${last.current.x}px, ${last.current.y}px, 0)`,
                opacity: on ? 1 : 0,
                transition: "opacity 0.15s",
                willChange: "transform",
            }}
        >
            {/* the hotspot is the fingertip of the pointing hand */}
            <div
                style={{
                    marginLeft: -(12 / 34) * size,
                    marginTop: -(3 / 34) * size,
                    transform: `scale(${pose === "fist" ? 0.92 : 1}) rotate(${pose === "open" ? -6 : 0}deg)`,
                    transformOrigin: "35% 10%",
                    transition: "transform 0.18s cubic-bezier(.2,.8,.2,1)",
                }}
            >
                <Hand pose={pose} riso={riso} line={line} fill={fill} misprint={misprint} grab={grab} size={size} />
            </div>
        </div>,
        host ?? document.body
    )
}

addPropertyControls(HandCursor, {
    variant: { type: ControlType.Enum, title: "Style", options: ["Riso", "Line"], defaultValue: "Riso", displaySegmentedControl: true },
    size: { type: ControlType.Number, title: "Size", defaultValue: 34, min: 20, max: 56, unit: "px" },
    line: { type: ControlType.Color, title: "Line", defaultValue: "#F2F2EE" },
    fill: { type: ControlType.Color, title: "Fill", defaultValue: "#141416", hidden: (p: any) => p.variant === "Line" },
    misprint: { type: ControlType.Color, title: "Misprint", defaultValue: "#FF4FA3", hidden: (p: any) => p.variant === "Line" },
    grab: { type: ControlType.Color, title: "Grab Misprint", defaultValue: "#3FE0FF", hidden: (p: any) => p.variant === "Line" },
})
