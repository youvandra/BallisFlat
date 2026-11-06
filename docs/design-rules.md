# Design rules (source: the Framer landing, read 2026-11-07)

Every value below was read from the Framer node named next to it. The app follows these rules;
anything not covered here copies the nearest Framer element instead of inventing a new style.

## Type (two families only)
| Role | Font | Size / line / tracking | Weight | Framer preset |
|---|---|---|---|---|
| Display (page titles) | Unbounded | 56px / 1.0 / -0.045em | 700 | Display |
| Heading (section titles, drawer titles, sticky note) | Unbounded | 30px / 1.08 / -0.035em | 700 | Heading |
| Title (card titles, pager names) | Unbounded | 18px / -0.02em | 700 | Title |
| Stat (big numbers) | Unbounded | 34px / 1.0 / -0.04em | 700 | Stat |
| Zone (zone labels, field labels, meta labels) | Unbounded | 12px / 1.4 / -0.01em, pink | 700 | Zone |
| Body Strong (buttons, nav items, values, links) | Geist | 15px / 1.45 / -0.01em | 500 | Body Strong |
| Body | Geist | 15px / 1.55 | 400 | Body |
| Small (captions, helper text, badges) | Geist | 13px / 1.4 | 400 | Small |

- No monospace font anywhere (addresses and hashes use Geist Small).
- No uppercase or letter-spaced labels outside the ported Framer card components.
- Text colours: Ink `#F2F2EE` for primary, Graphite `rgba(242,242,238,.62)` for secondary, pink for Zone labels, Mat `#141416` on pink/cyan/yellow fills.

## Colour
Only the nine Framer colour styles: Mat `#141416`, Card `#1E1E23`, Ink `#F2F2EE`, Graphite, Line `rgba(63,224,255,.4)`, Line Soft `rgba(242,242,238,.12)`, Note `#FFE800`, Pink `#FF4FA3`, Ink 2 (cyan) `#3FE0FF`. Error state only: fill `rgba(220,60,60,.1)` + border `rgba(220,60,60,.5)` (Submit / Error). No greys, no gradients outside card art and foil.

## Surfaces
| Element | Fill | Radius | Shadow | Border | Framer node |
|---|---|---|---|---|---|
| Zone | none | 18px | none | crop marks only | Zone Projects `JdSF3ZoTz` |
| Zone label chip | Mat | none | none | none, padding 0 6px, top -9px left 18px | `aL6r3QLOT` |
| Card / panel / result box | Card | 14px (16px for nav cards) | `4px 4px 0 0` cyan | none | Result `IbA0q8loc`, Pager `fp60Ij9DS` |
| Drawer / sheet / modal | Card | 24px | `8px 8px 0 0` cyan | none, padding 24px 24px 20px | Contact Drawer `mloKxzPfA` |
| Sticky note | Note yellow | 6px | `5px 5px 0 0` cyan | none, padding 30px | `thXoxGcHV` |
| Input / select | Mat | 12px | none | `1px` Line | `iunidSTse` (42px tall, padding 13px 14px, 15px text) |
- Shadows are always hard (no blur, no spread). Cards never get a border.

## Controls
| Control | Spec | Framer node |
|---|---|---|
| Primary button | pill 100px, Pink fill, white Body Strong, padding 14px 22px (full-width: 46-50px tall), shadow `3-4px 3-4px 0` cyan | 404 primary `Zxb9Zrsmt`, Submit `s0MMFx1cl` |
| Secondary button | pill 100px, Card fill, Ink Body Strong, padding 14px 22px, shadow `3px 3px 0` pink | 404 secondary `ZQ6UGv9gO` |
| Loading button | same as primary at 0.6 opacity | Submit / Loading |
| Segmented control (nav, tabs) | Dock style: Mat container, `1.5px` cyan border, pill 100px, padding 5px, gap 2px, shadow `4px 4px 0` pink; items padding 10px 18px Body Strong; active item Pink fill + white text | Dock `j2DqtmR34` |
| Filter chips (filters, sorts) | Quiet row, not a navbar: gap 6px; chip padding 7px 14px, pill 100px, `1px` Line Soft border, Small text in Graphite, no fill or print; active chip Pink fill + white text | App addition (chips in tokens.css) |
| Badge / tag | pill 100px, padding 4px 10px, Small text in Mat colour on Pink or cyan fill | Discipline Badge `YB1nn0ddN` |
| Legend swatch | 12x17px, radius 3px, Pink / cyan / Note fill | Chip `vnKovtIz8` |
| Text link | Body Strong Ink + 14px icon, gap 6px (← back, → in-app, ↗ leaves the app) | `fvu5zS5cG`, `d_eH_ECuS` |
| Meta row | Zone label over Body Strong value, columns gap 28px, padding 18px 0 | Meta `v5YDZoXy5` |

## Layout
Screen padding 95/40/96 (tablet 83/28/92, phone 84/16/100); playmat columns 240 / 1fr / 240 gap 32;
masthead bar padding 28px 40px 0; dock fixed 24px from the bottom. Corner marks: football mark.
