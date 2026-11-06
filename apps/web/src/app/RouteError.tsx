import { MissingCard } from "../components/playmat/framer-shell";
import { ButtonLink } from "../components/ui/ButtonLink";
import { palette } from "../lib/palette";

/** Unknown URL or a crash inside a screen: the landing's empty binder slot, and the way back. */
export function RouteError() {
  const ink = palette();
  return (
    <div className="m-auto flex min-h-full flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <div className="aspect-sleeve w-55">
        <MissingCard
          code="404"
          label="Empty Slot"
          hint="Not this one"
          ink={ink.ink}
          muted={ink.graphite}
          back={ink.pink}
          edge={ink.cyan}
          dark={ink.mat}
        />
      </div>
      <h1 className="t-heading">This page is off the pitch</h1>
      <p className="t-small">The link may be old, or something broke while loading it.</p>
      <ButtonLink to="/matches">Back to Matches</ButtonLink>
    </div>
  );
}
