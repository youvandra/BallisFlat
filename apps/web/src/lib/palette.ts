// The Framer code components take colours as props and build strings like `${edge}99` from them,
// so they need resolved colour values rather than var(). This reads them from tokens.css once.

const names = [
  "mat",
  "card",
  "ink",
  "graphite",
  "line",
  "line-soft",
  "note",
  "pink",
  "cyan",
  "on-ink",
] as const;
type Name = (typeof names)[number];
type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
export type Palette = { [K in Name as Camel<K>]: string };

const camel = (name: string) => name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/** Converts the rgb()/rgb(r g b / a) a browser returns into #rrggbb or #rrggbbaa. */
function toHex(value: string): string {
  const match = value.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (!match) return value;
  const channel = (raw: string | undefined) =>
    Math.round(Number(raw ?? 0))
      .toString(16)
      .padStart(2, "0");
  const alphaRaw = match[4];
  const alpha =
    alphaRaw === undefined
      ? ""
      : channel(
          String((alphaRaw.endsWith("%") ? Number.parseFloat(alphaRaw) / 100 : Number(alphaRaw)) * 255),
        );
  return `#${channel(match[1])}${channel(match[2])}${channel(match[3])}${alpha === "ff" ? "" : alpha}`;
}

let cached: Palette | null = null;

export function palette(): Palette {
  if (cached) return cached;
  const probe = document.createElement("span");
  document.body.append(probe);
  const entries = names.map((name) => {
    probe.style.color = `var(--color-${name})`;
    return [camel(name), toHex(getComputedStyle(probe).color)] as const;
  });
  probe.remove();
  cached = Object.fromEntries(entries) as Palette;
  return cached;
}
