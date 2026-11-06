import { Badge } from "../ui/Badge";

/** "Your Pick" on a card you hold: a Pink Badge set over the card's top edge. */
export function PickBadge({ label = "Your Pick", className = "" }: { label?: string; className?: string }) {
  return <Badge className={className}>{label}</Badge>;
}
