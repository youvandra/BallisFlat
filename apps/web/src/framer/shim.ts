// Stand-in for the "framer" runtime so the code components in this folder run unchanged.
// Every *.tsx here is copied verbatim from the Framer project; the only edits are
// this import path, a `// @ts-nocheck` header, and in PackRip.tsx the dropped unused DesignerCard import.
// Property controls only matter inside the Framer editor, so they are accepted and ignored.

export const ControlType = {
  String: "string",
  Color: "color",
  Number: "number",
  Enum: "enum",
  ResponsiveImage: "responsiveimage",
  Boolean: "boolean",
  Link: "link",
  Font: "font",
} as const;

export function addPropertyControls(_component: unknown, _controls: Record<string, unknown>): void {}

/** The app always renders live, never as a static Framer preview. */
export function useIsStaticRenderer(): boolean {
  return false;
}

export const RenderTarget = {
  canvas: "canvas",
  preview: "preview",
  current: (): "canvas" | "preview" => "preview",
} as const;
