// In Framer every property control has a default, so every prop is optional; numbered props
// (card1Name, skill2Text…) pass through as extras.
import type { ComponentProps, ComponentType } from "react";

// biome-ignore lint/suspicious/noExplicitAny: matches any Framer component's props
export type Loose<C extends ComponentType<any>> = ComponentType<
  Partial<ComponentProps<C>> & Record<string, unknown>
>;
// biome-ignore lint/suspicious/noExplicitAny: matches any Framer component's props
export const loose = <C extends ComponentType<any>>(component: C) => component as unknown as Loose<C>;
