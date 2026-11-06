// Shared class lists so links and buttons that look alike stay alike. Primary is the landing's Submit pill.
const base = "submit cursor-pointer";

export const buttonStyles = {
  primary: base,
  secondary: `${base} submit-quiet`,
  /** A text link that acts (Framer link rule: Body Strong Ink, 14px icon, gap 6). */
  quiet: "text-link min-h-11",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;
