// The BIF match ball for the covers: a white tournament-style ball with three swept panels in the house pink
// and cyan, bonded-panel seams, a fine surface texture, soft studio shading and a dark band that wraps the
// ball on a tilt and carries the BIF mark. Plain SVG, no external assets.
import { logo } from "./brand";

export type BallInks = { pink: string; cyan: string; mat: string };

export function ballSvg(cx: number, cy: number, r: number, ink: BallInks, id = "ball"): string {
  const { pink, cyan, mat } = ink;
  const n = (v: number) => v.toFixed(1);
  // three swept panels, tapered at both ends, each with a darker leading edge for depth
  const blade = (rot: number, fill: string) => `<g transform="rotate(${rot} ${cx} ${cy})">
    <path d="M ${n(cx - r * 0.05)} ${n(cy - r * 0.2)} C ${n(cx + r * 0.25)} ${n(cy - r * 0.78)}, ${n(cx + r * 0.85)} ${n(cy - r * 0.8)}, ${n(cx + r * 1.02)} ${n(cy - r * 0.35)}
      C ${n(cx + r * 0.72)} ${n(cy - r * 0.48)}, ${n(cx + r * 0.32)} ${n(cy - r * 0.42)}, ${n(cx - r * 0.05)} ${n(cy - r * 0.2)} Z" fill="${fill}"/>
    <path d="M ${n(cx - r * 0.05)} ${n(cy - r * 0.2)} C ${n(cx + r * 0.25)} ${n(cy - r * 0.78)}, ${n(cx + r * 0.85)} ${n(cy - r * 0.8)}, ${n(cx + r * 1.02)} ${n(cy - r * 0.35)}" fill="none" stroke="#0b0b14" stroke-opacity="0.35" stroke-width="${n(r * 0.02)}"/>
  </g>`;
  // panel seams: three long curves that meet near the centre, the way thermally bonded panels read
  const seam = (rot: number) =>
    `<path transform="rotate(${rot} ${cx} ${cy})" d="M ${n(cx - r * 0.05)} ${n(cy - r * 0.2)} C ${n(cx - r * 0.55)} ${n(cy - r * 0.25)}, ${n(cx - r * 0.95)} ${n(cy + r * 0.1)}, ${n(cx - r * 1.05)} ${n(cy + r * 0.55)}" fill="none"/>`;
  // the BIF band: wraps the ball on a tilt; its front sits just below the centre
  const tilt = -14,
    y0 = cy - r * 0.2,
    ry = r * 0.38,
    bh = r * 0.2;
  const lw = r * 0.48,
    sc = lw / logo.width,
    lh = logo.height * sc,
    ly = y0 + ry + bh / 2 - lh / 2;
  const band = `<g transform="rotate(${tilt} ${cx} ${cy})">
    <path d="M ${n(cx - r * 1.02)} ${n(y0)} A ${n(r * 1.02)} ${n(ry)} 0 0 0 ${n(cx + r * 1.02)} ${n(y0)} L ${n(cx + r * 1.02)} ${n(y0 + bh)} A ${n(r * 1.02)} ${n(ry)} 0 0 1 ${n(cx - r * 1.02)} ${n(y0 + bh)} Z" fill="${mat}"/>
    <path d="M ${n(cx - r * 1.02)} ${n(y0)} A ${n(r * 1.02)} ${n(ry)} 0 0 0 ${n(cx + r * 1.02)} ${n(y0)}" fill="none" stroke="${pink}" stroke-width="${n(r * 0.022)}"/>
    <path d="M ${n(cx - r * 1.02)} ${n(y0 + bh)} A ${n(r * 1.02)} ${n(ry)} 0 0 0 ${n(cx + r * 1.02)} ${n(y0 + bh)}" fill="none" stroke="${cyan}" stroke-width="${n(r * 0.022)}"/>
    <path transform="translate(${n(cx - lw / 2)} ${n(ly)}) scale(${sc.toFixed(5)})" fill="#ffffff" fill-rule="evenodd" d="${logo.path}"/>
  </g>`;
  return `<defs>
    <radialGradient id="${id}sphere" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#eef0f3"/><stop offset="0.82" stop-color="#bcc1cb"/><stop offset="1" stop-color="#7a8191"/></radialGradient>
    <radialGradient id="${id}shade" cx="0.36" cy="0.3" r="0.82"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0b0b14" stop-opacity="0.6"/></radialGradient>
    <pattern id="${id}grain" width="${n(r * 0.05)}" height="${n(r * 0.05)}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="${n(r * 0.025)}" cy="${n(r * 0.025)}" r="${n(r * 0.008)}" fill="#000" fill-opacity="0.12"/></pattern>
    <clipPath id="${id}clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <filter id="${id}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(r * 0.09)}"/></filter>
    <filter id="${id}soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(r * 0.035)}"/></filter>
  </defs>
  <ellipse cx="${n(cx + r * 0.12)}" cy="${n(cy + r * 1.03)}" rx="${n(r * 0.8)}" ry="${n(r * 0.14)}" fill="#000" opacity="0.6" filter="url(#${id}blur)"/>
  <g clip-path="url(#${id}clip)">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}sphere)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}grain)"/>
    ${blade(0, pink)}${blade(120, cyan)}${blade(240, pink)}
    <g stroke="#1b1d26" stroke-opacity="0.28" stroke-width="${n(r * 0.012)}">${seam(0)}${seam(120)}${seam(240)}</g>
    ${band}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}shade)"/>
    <ellipse cx="${n(cx - r * 0.36)}" cy="${n(cy - r * 0.44)}" rx="${n(r * 0.26)}" ry="${n(r * 0.13)}" transform="rotate(-35 ${n(cx - r * 0.36)} ${n(cy - r * 0.44)})" fill="#ffffff" opacity="0.75" filter="url(#${id}soft)"/>
  </g>
  <path d="M ${n(cx + r * Math.cos(-0.35))} ${n(cy + r * Math.sin(-0.35))} A ${r} ${r} 0 0 1 ${n(cx + r * Math.cos(1.25))} ${n(cy + r * Math.sin(1.25))}" fill="none" stroke="${cyan}" stroke-opacity="0.55" stroke-width="${n(r * 0.025)}" stroke-linecap="round"/>`;
}
