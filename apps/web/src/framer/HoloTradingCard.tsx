// @ts-nocheck: verbatim Framer code component (see shim.ts)
import { addPropertyControls, ControlType, useIsStaticRenderer } from "./shim"
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from "framer-motion"
import { useRef, useState, startTransition, type CSSProperties, type PointerEvent, type ReactNode } from "react"

type Rarity = "common" | "rare" | "epic" | "legendary"

interface Ability {
    name: string
    value: string
    text: string
}

interface Result {
    value: string
    label: string
}

interface Img {
    src: string
    srcSet?: string
    alt?: string
}

interface HoloCardProps {
    name: string
    /** App addition: the full name printed small under the big name. */
    subName?: string
    /** App addition: replaces the rarity and set row at the bottom of the front. */
    footer?: ReactNode
    /** App addition: drawn centred over the art (the shirt number); on a flippable card it keeps a 32px band clear top and bottom, so it stays centred and clear of the Flip pill. */
    artOverlay?: ReactNode
    /** App addition: an action (claim, refund) at the foot of the back; clicking it never flips the card. */
    backAction?: ReactNode
    /** App addition: false drops the position and team row on the front. */
    showType?: boolean
    number: string
    image: Img
    typeLine: string
    year: string
    rarity: Rarity
    rarityLabel: string
    setLabel: string
    abilityCount: number
    ability1Name: string
    ability1Value: string
    ability1Text: string
    ability2Name: string
    ability2Value: string
    ability2Text: string
    flippable: boolean
    backTitle: string
    backSummary: string
    resultCount: number
    result1Value: string
    result1Label: string
    result2Value: string
    result2Label: string
    result3Value: string
    result3Label: string
    linkLabel: string
    link: string
    maxTilt: number
    foilStrength: number
    surface: string
    surfaceEnd: string
    textColor: string
    mutedColor: string
    accent: string
    radius: number
    customFonts: boolean
    titleFont: CSSProperties
    monoFont: CSSProperties
    bodyFont: CSSProperties
    style?: CSSProperties
}

const RAINBOW =
    "linear-gradient(115deg, rgba(0,0,0,0) 18%, rgba(142,246,255,0.85) 28%, rgba(201,167,255,0.85) 38%, rgba(255,179,217,0.85) 48%, rgba(255,241,168,0.85) 58%, rgba(160,255,200,0.85) 68%, rgba(142,246,255,0.85) 76%, rgba(0,0,0,0) 86%)"
const SHINE =
    "repeating-linear-gradient(110deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 36px, rgba(255,255,255,0.42) 52px, rgba(255,255,255,0) 68px)"
const GLITTER = [
    "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.95) 0px, rgba(255,255,255,0) 1.4px)",
    "radial-gradient(circle at 70% 60%, rgba(201,247,255,0.95) 0px, rgba(201,247,255,0) 1.2px)",
    "radial-gradient(circle at 40% 80%, rgba(255,214,240,0.95) 0px, rgba(255,214,240,0) 1.3px)",
].join(", ")

const FOIL_BY_RARITY: Record<Rarity, { rainbow: number; shine: number; glitter: number; glow: number }> = {
    common: { rainbow: 0, shine: 0, glitter: 0, glow: 0 },
    rare: { rainbow: 0, shine: 0.55, glitter: 0, glow: 0.15 },
    epic: { rainbow: 0.55, shine: 0.25, glitter: 0, glow: 0.3 },
    legendary: { rainbow: 0.75, shine: 0.3, glitter: 0.9, glow: 0.55 },
}

const FONT_LINK =
    "https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700;800&family=Geist:wght@400;500;600&display=swap"

/**
 * Holo Card: a collectible trading card with cursor-tracked 3D tilt,
 * rarity-based holographic foil and an optional flip to a case-study back.
 *
 * @framerIntrinsicWidth 300
 * @framerIntrinsicHeight 430
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export default function HoloCard(props: HoloCardProps) {
    const {
        name = "Noa Varela",
        number = "001/100",
        image = {
            src: "https://framerusercontent.com/images/GfGkADagM4KEibNcIiRUWlfrR0.jpg",
            alt: "Card art",
        },
        typeLine = "Brand & product designer",
        year = "Copenhagen",
        rarity = "legendary",
        rarityLabel = "★★★★ Legendary",
        setLabel = "BIF-26 ◆ 1st ED.",
        abilityCount = 2,
        ability1Name = "Systems thinking",
        ability1Value = "120",
        ability1Text = "Turns chaos into a design system.",
        ability2Name = "Knows when to stop",
        ability2Value = "∞",
        ability2Text = "Ships the version you actually need.",
        flippable = true,
        backTitle = "Case file",
        backSummary = "",
        resultCount = 3,
        result1Value = "32",
        result1Label = "Clients",
        result2Value = "09",
        result2Label = "Countries",
        result3Value = "03",
        result3Label = "SOTD",
        linkLabel = "View case study",
        link = "",
        maxTilt = 14,
        foilStrength = 1,
        surface = "#222639",
        surfaceEnd = "#10111A",
        textColor = "#F4F5FA",
        mutedColor = "rgba(244, 245, 250, 0.55)",
        accent = "#C9F7FF",
        radius = 20,
        customFonts = false,
        titleFont,
        monoFont,
        bodyFont,
        subName = "",
        footer,
        backAction,
        artOverlay,
        showType = true,
    } = props

    const abilities: Ability[] = [
        { name: ability1Name, value: ability1Value, text: ability1Text },
        { name: ability2Name, value: ability2Value, text: ability2Text },
    ].slice(0, Math.max(0, Math.min(2, Number(abilityCount) || 0)))
    const results: Result[] = [
        { value: result1Value, label: result1Label },
        { value: result2Value, label: result2Label },
        { value: result3Value, label: result3Label },
    ].slice(0, Math.max(0, Math.min(3, Number(resultCount) || 0)))

    const isStatic = useIsStaticRenderer()
    const ref = useRef<HTMLDivElement>(null)
    const [flipped, setFlipped] = useState(false)

    // pointer position in 0..1, resting slightly top-left so the foil reads in static previews
    const px = useMotionValue(0.32)
    const py = useMotionValue(0.26)
    const active = useMotionValue(0.15)
    const spring = { stiffness: 180, damping: 18, mass: 0.6 }
    const sx = useSpring(px, spring)
    const sy = useSpring(py, spring)
    const sActive = useSpring(active, { stiffness: 120, damping: 20 })

    const rotateX = useTransform(sy, (v) => (isStatic ? 0 : (0.5 - v) * 2 * maxTilt))
    const rotateY = useTransform(sx, (v) => (isStatic ? 0 : (v - 0.5) * 2 * maxTilt))
    const gx = useTransform(sx, (v) => v * 100)
    const gy = useTransform(sy, (v) => v * 100)
    const fx = useTransform(sx, (v) => 20 + v * 60)
    const fy = useTransform(sy, (v) => 20 + v * 60)

    const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 22%, rgba(0,0,0,0) 55%)`
    const foilPos = useMotionTemplate`${fx}% ${fy}%`
    const glitterPos = useMotionTemplate`${gx}px ${gy}px, ${fy}px ${fx}px, ${gy}px ${fx}px`

    const foil = FOIL_BY_RARITY[String(rarity).toLowerCase() as Rarity] ?? FOIL_BY_RARITY.common
    const rainbowOpacity = useTransform(sActive, (a) => foil.rainbow * foilStrength * (0.12 + a * 0.88))
    const shineOpacity = useTransform(sActive, (a) => foil.shine * foilStrength * (0.15 + a * 0.85))
    const glitterOpacity = useTransform(sActive, (a) => foil.glitter * foilStrength * (0.15 + a * 0.85))
    const glareOpacity = useTransform(sActive, (a) => 0.05 + a * 0.65)

    const T: CSSProperties = customFonts && titleFont ? titleFont : { fontFamily: '"Unbounded", sans-serif', fontWeight: 700 }
    const M: CSSProperties = customFonts && monoFont ? monoFont : { fontFamily: '"Geist", system-ui, sans-serif', fontWeight: 500 }
    const B: CSSProperties = customFonts && bodyFont ? bodyFont : { fontFamily: '"Geist", system-ui, sans-serif', fontWeight: 400 }

    function onMove(e: PointerEvent<HTMLDivElement>) {
        if (isStatic || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        px.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
        py.set(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)))
        active.set(1)
    }
    function onLeave() {
        px.set(0.32)
        py.set(0.26)
        active.set(0.15)
    }
    function onClick() {
        if (!flippable || isStatic) return
        startTransition(() => setFlipped((f) => !f))
    }

    const faceBase: CSSProperties = {
        position: "absolute",
        inset: 0,
        borderRadius: radius,
        overflow: "hidden",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        background: `linear-gradient(160deg, ${surface} 0%, ${surfaceEnd} 100%)`,
        border: `1px solid ${String(rarity).toLowerCase() === "legendary" ? "rgba(201, 247, 255, 0.45)" : "rgba(255, 255, 255, 0.16)"}`,
        color: textColor,
        boxSizing: "border-box",
    }
    const layer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none", borderRadius: radius }
    const label: CSSProperties = { ...M, fontSize: 10, lineHeight: "1.2em", textTransform: "uppercase", letterSpacing: "0.07em" }

    const foilLayers = (strength: number) => (
        <div style={{ ...layer, opacity: strength }}>
            {foil.shine > 0 && (
                <motion.div style={{ ...layer, backgroundImage: SHINE, backgroundSize: "220% 220%", backgroundPosition: foilPos, mixBlendMode: "color-dodge", opacity: shineOpacity }} />
            )}
            {foil.rainbow > 0 && (
                <motion.div style={{ ...layer, backgroundImage: RAINBOW, backgroundSize: "300% 300%", backgroundPosition: foilPos, mixBlendMode: "color-dodge", opacity: rainbowOpacity }} />
            )}
            {foil.glitter > 0 && (
                <motion.div style={{ ...layer, backgroundImage: GLITTER, backgroundSize: "37px 37px, 53px 53px, 71px 71px", backgroundPosition: glitterPos, mixBlendMode: "color-dodge", opacity: glitterOpacity }} />
            )}
            <motion.div style={{ ...layer, background: glare, mixBlendMode: "overlay", opacity: glareOpacity }} />
        </div>
    )

    return (
        <div
            ref={ref}
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            onClick={onClick}
            role={flippable ? "button" : undefined}
            aria-pressed={flippable ? flipped : undefined}
            aria-label={flippable ? `${name} card, click to flip` : `${name} card`}
            tabIndex={flippable ? 0 : undefined}
            onKeyDown={(e) => {
                if (flippable && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault()
                    onClick()
                }
            }}
            style={{
                ...props.style,
                position: "relative",
                width: "100%",
                height: "100%",
                perspective: 1000,
                containerType: "inline-size",
                cursor: flippable ? "pointer" : "default",
                userSelect: "none",
            }}
        >
            <link href={FONT_LINK} rel="stylesheet" />
            <motion.div
                style={{
                    position: "absolute",
                    inset: 0,
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d",
                    borderRadius: radius,
                    boxShadow:
                        foil.glow > 0
                            ? `0 40px 80px -24px rgba(0,0,0,0.75), 0 0 60px -12px rgba(130,210,255,${foil.glow})`
                            : "0 30px 60px -20px rgba(0,0,0,0.7)",
                }}
            >
                <motion.div
                    animate={{ rotateY: flipped ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 140, damping: 18 }}
                    style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}
                >
                    {/* FRONT */}
                    {/* App change: holo-* class names let a narrow card (phone grid) drop the type row in CSS. */}
                    <div className="holo-front" style={{ ...faceBase, display: "flex", flexDirection: "column", gap: 10, padding: "10px 10px 14px 10px" }}>
                        {/* App change: the name never truncates. It shrinks to fit the card width (container
                            units), and with a subName the number moves to the line under it. */}
                        {subName ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "2px 4px 0 4px" }}>
                                <span style={{ ...T, fontSize: `min(19px, 11cqi, calc((100cqi - 30px) / ${Math.max(4, String(name).length) * 0.92}))`, lineHeight: "1.1em", letterSpacing: "-0.01em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{name}</span>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                                    <span style={{ ...M, fontSize: 10.5, lineHeight: "1.25em", color: mutedColor, minWidth: 0, overflowWrap: "anywhere" }}>{subName}</span>
                                    <span style={{ ...label, color: String(rarity).toLowerCase() === "legendary" ? accent : mutedColor, whiteSpace: "nowrap" }}>{number}</span>
                                </div>
                            </div>
                        ) : number ? (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 0 4px", gap: 8 }}>
                                <span style={{ ...T, fontSize: `min(15px, calc((100cqi - 90px) / ${Math.max(4, String(name).length) * 0.92}))`, lineHeight: "1.15em", letterSpacing: "-0.01em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{name}</span>
                                <span style={{ ...label, color: String(rarity).toLowerCase() === "legendary" ? accent : mutedColor, whiteSpace: "nowrap" }}>{number}</span>
                            </div>
                        ) : (
                            /* App addition: no number, so the name takes the whole width. */
                            <div style={{ padding: "2px 4px 0 4px" }}>
                                <span style={{ ...T, display: "block", fontSize: `min(19px, 11cqi, calc((100cqi - 30px) / ${Math.max(4, String(name).length) * 0.92}))`, lineHeight: "1.15em", letterSpacing: "-0.01em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{name}</span>
                            </div>
                        )}
                        <div
                            role="img"
                            aria-label={image?.alt || name}
                            className="holo-art"
                            style={{
                                position: "relative",
                                flex: 1,
                                minHeight: "38%",
                                flexShrink: 0,
                                borderRadius: Math.max(0, radius - 8),
                                overflow: "hidden",
                                border: "1px solid rgba(255,255,255,0.14)",
                                backgroundImage: image?.src ? `url(${image.src})` : undefined,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                backgroundColor: "#1a1c28",
                            }}
                        >
                            {artOverlay ? (
                                <div className="holo-art-overlay" style={{ position: "absolute", inset: flippable ? "32px 0" : 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>{artOverlay}</div>
                            ) : null}
                            {foilLayers(1)}
                            {flippable && (
                                <span style={{ ...label, position: "absolute", right: 8, top: 8, padding: "4px 7px", borderRadius: 100, background: "rgba(10,11,18,0.55)", color: textColor, backdropFilter: "blur(6px)" }}>↻ Flip</span>
                            )}
                        </div>
                        {showType && <div className="holo-type" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.07)", gap: 8 }}>
                            <span style={{ ...label, color: textColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{typeLine}</span>
                            <span style={{ ...label, color: mutedColor, whiteSpace: "nowrap" }}>{year}</span>
                        </div>}
                        {abilities.map((a, i) => (
                            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 6px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                    <span style={{ ...T, fontSize: 12, fontWeight: 600, lineHeight: "1.2em" }}>◆ {a.name}</span>
                                    <span style={{ ...T, fontSize: 16, fontWeight: 800, lineHeight: "1em", color: accent }}>{a.value}</span>
                                </div>
                                <span style={{ ...M, fontSize: 10, fontWeight: 400, lineHeight: "1.3em", color: mutedColor }}>{a.text}</span>
                            </div>
                        ))}
                        {footer ?? (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 0 6px", borderTop: abilities.length ? "1px solid rgba(255,255,255,0.1)" : "none", gap: 8 }}>
                                <span style={{ ...label, fontWeight: 600, color: accent, whiteSpace: "nowrap" }}>{rarityLabel}</span>
                                <span style={{ ...label, color: mutedColor, whiteSpace: "nowrap" }}>{setLabel}</span>
                            </div>
                        )}
                        {foilLayers(0.3)}
                    </div>

                    {/* BACK */}
                    {/* App change: the back only exists on a flippable card, so a card that never flips never
                        carries the Framer template copy (Case file, Clients 32, View case study) in its DOM. */}
                    {/* App change: every size on the back scales with the card (container units, floored for
                        legibility) and a narrow card drops the results row, so nothing is ever clipped. */}
                    {flippable && (
                    <div
                        className="holo-back"
                        // App change: the back is inert until the card is flipped, so its link and action are not tabbable from the front.
                        inert={!flipped}
                        style={{
                            ...faceBase,
                            transform: "rotateY(180deg)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "clamp(6px, 4.2cqi, 14px)",
                            padding: "clamp(10px, 6cqi, 18px)",
                            backgroundImage: `repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 10px), linear-gradient(160deg, ${surface} 0%, ${surfaceEnd} 100%)`,
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                            <span style={{ ...label, fontSize: "clamp(8.5px, 3.4cqi, 10px)", color: accent, whiteSpace: "nowrap" }}>Card · {number}</span>
                            <span className="holo-back-hint" style={{ ...label, fontSize: "clamp(8.5px, 3.4cqi, 10px)", color: mutedColor, whiteSpace: "nowrap" }}>↻ Flip back</span>
                        </div>
                        <span style={{ ...T, fontSize: "clamp(12px, 7.3cqi, 22px)", lineHeight: "1.08em", letterSpacing: "-0.02em", textTransform: "uppercase", overflowWrap: "anywhere" }}>{backTitle || name}</span>
                        <span style={{ ...B, fontSize: "clamp(10px, 4.4cqi, 13px)", lineHeight: "1.4em", color: mutedColor }}>{backSummary}</span>
                        <div style={{ flex: 1 }} />
                        {results.length > 0 && (
                            <div className="holo-back-results" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, results.length)}, minmax(0, 1fr))`, gap: "clamp(4px, 2.7cqi, 8px)" }}>
                                {results.slice(0, 3).map((r, i) => (
                                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "clamp(6px, 3.3cqi, 10px) clamp(4px, 2.7cqi, 8px)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", minWidth: 0 }}>
                                        <span style={{ ...T, fontSize: "clamp(12px, 6cqi, 18px)", fontWeight: 800, lineHeight: "1em", color: accent, whiteSpace: "nowrap" }}>{r.value}</span>
                                        <span style={{ ...M, fontSize: "clamp(8px, 3cqi, 9px)", lineHeight: "1.3em", textTransform: "uppercase", color: mutedColor }}>{r.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {link ? (
                            <a
                                href={link}
                                {...(/^https?:/.test(link) ? { target: "_blank", rel: "noreferrer" } : {})}
                                onClick={(e) => e.stopPropagation()}
                                style={{ ...label, fontSize: "clamp(9.5px, 3.7cqi, 11px)", fontWeight: 600, color: "#0A0B12", background: textColor, borderRadius: 100, padding: "clamp(7px, 3.7cqi, 11px) 10px", textAlign: "center", textDecoration: "none" }}
                            >
                                {linkLabel} ↗
                            </a>
                        ) : (
                            <span style={{ ...label, fontSize: "clamp(9.5px, 3.7cqi, 11px)", fontWeight: 600, color: "#0A0B12", background: textColor, borderRadius: 100, padding: "clamp(7px, 3.7cqi, 11px) 10px", textAlign: "center" }}>{linkLabel}</span>
                        )}
                        {backAction ? (
                            // biome-ignore lint/a11y/noStaticElementInteractions: stops the card flipping when its action is used.
                            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ position: "relative", zIndex: 1 }}>
                                {backAction}
                            </div>
                        ) : null}
                        {foilLayers(0.3)}
                    </div>
                    )}
                </motion.div>
            </motion.div>
        </div>
    )
}

addPropertyControls(HoloCard, {
    name: { type: ControlType.String, title: "Name", defaultValue: "Noa Varela" },
    number: { type: ControlType.String, title: "Number", defaultValue: "001/100" },
    image: { type: ControlType.ResponsiveImage, title: "Art" },
    typeLine: { type: ControlType.String, title: "Type", defaultValue: "Brand & product designer" },
    year: { type: ControlType.String, title: "Year", defaultValue: "Copenhagen" },
    rarity: {
        type: ControlType.Enum,
        title: "Rarity",
        options: ["common", "rare", "epic", "legendary"],
        optionTitles: ["Common", "Rare", "Epic", "Legendary"],
        defaultValue: "legendary",
    },
    rarityLabel: { type: ControlType.String, title: "Rarity Label", defaultValue: "★★★★ Legendary" },
    setLabel: { type: ControlType.String, title: "Set Label", defaultValue: "BIF-26 ◆ 1st ED." },
    abilityCount: {
        type: ControlType.Enum,
        title: "Abilities",
        options: [0, 1, 2],
        optionTitles: ["None", "One", "Two"],
        defaultValue: 2,
        displaySegmentedControl: true,
    },
    ability1Name: { type: ControlType.String, title: "Ability 1", defaultValue: "Systems thinking", hidden: (p) => (p.abilityCount ?? 0) < 1 },
    ability1Value: { type: ControlType.String, title: "Ability 1 Value", defaultValue: "120", hidden: (p) => (p.abilityCount ?? 0) < 1 },
    ability1Text: { type: ControlType.String, title: "Ability 1 Text", defaultValue: "Turns chaos into a design system.", hidden: (p) => (p.abilityCount ?? 0) < 1 },
    ability2Name: { type: ControlType.String, title: "Ability 2", defaultValue: "Knows when to stop", hidden: (p) => (p.abilityCount ?? 0) < 2 },
    ability2Value: { type: ControlType.String, title: "Ability 2 Value", defaultValue: "∞", hidden: (p) => (p.abilityCount ?? 0) < 2 },
    ability2Text: { type: ControlType.String, title: "Ability 2 Text", defaultValue: "Ships the version you actually need.", hidden: (p) => (p.abilityCount ?? 0) < 2 },
    flippable: { type: ControlType.Boolean, title: "Flip on Click", defaultValue: true },
    backTitle: { type: ControlType.String, title: "Back Title", defaultValue: "The brief", hidden: (p) => !p.flippable },
    backSummary: {
        type: ControlType.String,
        title: "Back Summary",
        displayTextArea: true,
        defaultValue: "Ten years of brand and product work for founders, banks and bakeries. Flip any card in the collection to read its case file.",
        hidden: (p) => !p.flippable,
    },
    resultCount: {
        type: ControlType.Enum,
        title: "Results",
        options: [0, 1, 2, 3],
        optionTitles: ["0", "1", "2", "3"],
        defaultValue: 3,
        displaySegmentedControl: true,
        hidden: (p) => !p.flippable,
    },
    result1Value: { type: ControlType.String, title: "Result 1", defaultValue: "32", hidden: (p) => !p.flippable || (p.resultCount ?? 0) < 1 },
    result1Label: { type: ControlType.String, title: "Result 1 Label", defaultValue: "Clients", hidden: (p) => !p.flippable || (p.resultCount ?? 0) < 1 },
    result2Value: { type: ControlType.String, title: "Result 2", defaultValue: "09", hidden: (p) => !p.flippable || (p.resultCount ?? 0) < 2 },
    result2Label: { type: ControlType.String, title: "Result 2 Label", defaultValue: "Countries", hidden: (p) => !p.flippable || (p.resultCount ?? 0) < 2 },
    result3Value: { type: ControlType.String, title: "Result 3", defaultValue: "03", hidden: (p) => !p.flippable || (p.resultCount ?? 0) < 3 },
    result3Label: { type: ControlType.String, title: "Result 3 Label", defaultValue: "SOTD", hidden: (p) => !p.flippable || (p.resultCount ?? 0) < 3 },
    linkLabel: { type: ControlType.String, title: "Link Label", defaultValue: "View case study", hidden: (p) => !p.flippable },
    link: { type: ControlType.Link, title: "Link", hidden: (p) => !p.flippable },
    maxTilt: { type: ControlType.Number, title: "Max Tilt", defaultValue: 14, min: 0, max: 30, step: 1, unit: "°" },
    foilStrength: { type: ControlType.Number, title: "Foil", defaultValue: 1, min: 0, max: 1.5, step: 0.05 },
    surface: { type: ControlType.Color, title: "Surface", defaultValue: "#222639" },
    surfaceEnd: { type: ControlType.Color, title: "Surface End", defaultValue: "#10111A" },
    textColor: { type: ControlType.Color, title: "Text", defaultValue: "#F4F5FA" },
    mutedColor: { type: ControlType.Color, title: "Muted", defaultValue: "rgba(244, 245, 250, 0.55)" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: "#C9F7FF" },
    radius: { type: ControlType.Number, title: "Radius", defaultValue: 20, min: 0, max: 40, step: 1, unit: "px" },
    customFonts: { type: ControlType.Boolean, title: "Custom Fonts", defaultValue: false },
    titleFont: {
        type: ControlType.Font,
        title: "Title Font",
        controls: "extended",
        defaultFontType: "sans-serif",
        defaultValue: { variant: "Bold", letterSpacing: "-0.01em", lineHeight: "1.15em" },
        hidden: (p) => !p.customFonts,
    },
    monoFont: {
        type: ControlType.Font,
        title: "Label Font",
        controls: "extended",
        defaultFontType: "sans-serif",
        defaultValue: { variant: "Medium", lineHeight: "1.2em", letterSpacing: "0.07em" },
        hidden: (p) => !p.customFonts,
    },
    bodyFont: {
        type: ControlType.Font,
        title: "Body Font",
        controls: "extended",
        defaultFontType: "sans-serif",
        defaultValue: { variant: "Regular", lineHeight: "1.5em" },
        hidden: (p) => !p.customFonts,
    },
})
