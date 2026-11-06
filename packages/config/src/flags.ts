// National flag patterns for the match covers, drawn as plain SVG shapes in a w x h box. Flags are public
// national symbols; federation crests are trademarks and are never drawn. Northern Ireland has no flag in
// common use for its football team, so it gets the green-and-white of its kit instead.

type Draw = (w: number, h: number) => string;

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

const horizontal =
  (...bands: [string, number][]): Draw =>
  (w, h) => {
    const total = bands.reduce((sum, [, share]) => sum + share, 0);
    let y = 0;
    return bands
      .map(([fill, share]) => {
        const band = (h * share) / total;
        const out = rect(0, y, w, band + 1, fill);
        y += band;
        return out;
      })
      .join("");
  };

const vertical =
  (...bands: [string, number][]): Draw =>
  (w, h) => {
    const total = bands.reduce((sum, [, share]) => sum + share, 0);
    let x = 0;
    return bands
      .map(([fill, share]) => {
        const band = (w * share) / total;
        const out = rect(x, 0, band + 1, h, fill);
        x += band;
        return out;
      })
      .join("");
  };

const flags: Record<string, Draw> = {
  ENG: (w, h) => {
    const bar = Math.min(w, h) * 0.2;
    return `${rect(0, 0, w, h, "#ffffff")}${rect(0, (h - bar) / 2, w, bar, "#ce1124")}${rect((w - bar) / 2, 0, bar, h, "#ce1124")}`;
  },
  CRO: (w, h) => {
    const cell = Math.max(w, h) / 8;
    let out = rect(0, 0, w, h, "#ffffff");
    for (let row = 0; row * cell < h; row++) {
      for (let col = 0; col * cell < w; col++) {
        if ((row + col) % 2 === 0) out += rect(col * cell, row * cell, cell + 0.5, cell + 0.5, "#e30613");
      }
    }
    return out;
  },
  ESP: horizontal(["#c60b1e", 1], ["#ffc400", 2], ["#c60b1e", 1]),
  POR: vertical(["#046a38", 2], ["#da291c", 3]),
  WAL: horizontal(["#ffffff", 1], ["#00b140", 1]),
  IRL: vertical(["#169b62", 1], ["#ffffff", 1], ["#ff883e", 1]),
  UKR: horizontal(["#0057b7", 1], ["#ffd700", 1]),
  HUN: horizontal(["#ce2939", 1], ["#ffffff", 1], ["#477050", 1]),
  KVX: (w, h) => {
    const stars = Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI * (1.18 + (0.64 * i) / 5);
      const x = w / 2 + Math.cos(a) * w * 0.3;
      const y = h * 0.62 + Math.sin(a) * h * 0.3;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(Math.min(w, h) * 0.035).toFixed(1)}" fill="#ffffff"/>`;
    }).join("");
    return `${rect(0, 0, w, h, "#244aa5")}${stars}<circle cx="${w / 2}" cy="${h * 0.62}" r="${Math.min(w, h) * 0.14}" fill="#d0a650"/>`;
  },
  NIR: (w, h) => {
    const stripe = Math.max(w, h) / 9;
    let out = rect(0, 0, w, h, "#00843d");
    for (let i = -h; i < w + h; i += stripe * 2) {
      out += `<polygon points="${i},0 ${i + stripe},0 ${i + stripe - h},${h} ${i - h},${h}" fill="#ffffff" opacity="0.9"/>`;
    }
    return out;
  },
};

/** The flag of a team code as SVG shapes, or a plain kit-coloured field for a code without one. */
export function flagShapes(code: string, colour: string, w: number, h: number): string {
  return (flags[code] ?? ((fw: number, fh: number) => rect(0, 0, fw, fh, colour)))(w, h);
}
