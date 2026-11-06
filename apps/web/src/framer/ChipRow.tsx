// @ts-nocheck: verbatim Framer code component (see shim.ts)
import * as React from "react"
import { addPropertyControls, ControlType } from "./shim"

/**
 * Chip Row
 * Turns a comma separated list (for example a CMS "Services" field) into a row of chips.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 396
 */

const body = "'Geist', system-ui, sans-serif"

export default function ChipRow(props: any) {
    const { items = "Naming, Identity, Card design, App UI kit, Launch campaign", ink = "#F2F2EE", fill = "#1E1E23", line = "rgba(242, 242, 238, 0.14)", style } = props
    const list = String(items || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    return (
        <div style={{ ...style, display: "flex", flexWrap: "wrap", gap: 6, width: "100%" }}>
            {list.map((s, i) => (
                <span key={i} style={{ padding: "5px 11px", borderRadius: 100, background: fill, border: `1px solid ${line}`, fontFamily: body, fontWeight: 500, fontSize: 12.5, color: ink, whiteSpace: "nowrap" }}>
                    {s}
                </span>
            ))}
        </div>
    )
}

addPropertyControls(ChipRow, {
    items: { type: ControlType.String, title: "Items", defaultValue: "Naming, Identity, Card design, App UI kit, Launch campaign", description: "Comma separated" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#F2F2EE" },
    fill: { type: ControlType.Color, title: "Fill", defaultValue: "#1E1E23" },
    line: { type: ControlType.Color, title: "Line", defaultValue: "rgba(242, 242, 238, 0.14)" },
})
