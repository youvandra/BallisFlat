import { Logo } from "../ui/Logo";

/** Two pink card backs over a cyan print shadow, as in the landing's Binder zone (Stack hG3juzLkE). */
export function CardBackStack() {
  return (
    <div className="relative h-26 w-22.5 flex-none" aria-hidden>
      <span className="card-back card-back-shadow" />
      <span className="card-back card-back-a">
        <Logo className="card-back-logo" />
      </span>
      <span className="card-back card-back-b">
        <Logo className="card-back-logo" />
      </span>
    </div>
  );
}
