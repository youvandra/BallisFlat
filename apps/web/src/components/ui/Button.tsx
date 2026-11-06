import type { ButtonHTMLAttributes } from "react";
import { type ButtonVariant, buttonStyles } from "./button-styles";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

export function Button({ variant = "primary", className = "", type = "button", ...props }: Props) {
  return <button type={type} className={`${buttonStyles[variant]} ${className}`} {...props} />;
}
