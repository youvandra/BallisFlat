import { product } from "@app/config/constants";
import type { ListedFixture } from "../../lib/game/fixtures";
import { matchdayLabel } from "../../lib/game/fixtures";
import { sleeveCodes } from "../../lib/game/sleeve";
import { Logo } from "../ui/Logo";

/**
 * A minted card that has not been opened yet, drawn as its sealed pack (crimped edges, the foil as riso
 * blooms). Who is inside stays hidden until the pack is torn on the pack page.
 */
export function SealedPack({ fixture, className = "" }: { fixture: ListedFixture; className?: string }) {
  return (
    <span className={`pack-tile ${className}`} role="img" aria-label={`Sealed pack, ${sleeveCodes(fixture)}`}>
      <Logo className="pack-logo text-ink" title={product.name} />
      <span className="t-title text-balance">{sleeveCodes(fixture)}</span>
      <span className="t-small">{matchdayLabel(fixture)}</span>
      <span className="badge mt-2">Sealed</span>
    </span>
  );
}
