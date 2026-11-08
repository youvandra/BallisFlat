import { ArrowUpRight } from "lucide-react";
import { useAccount } from "../../lib/game/queries";

/**
 * A line in place of a connect button: the wallet control lives in the masthead, so pages point there
 * instead of drawing a second one. A wallet on another chain is told to switch.
 */
export function WalletHint({ action }: { action?: string }) {
  const account = useAccount();
  const wrongChain = Boolean(account.data && !account.data.isRightChain && account.data.address);
  const what = action ? ` to ${action}` : "";
  return (
    <p className="t-small flex items-center gap-1.5 text-graphite" data-testid="wallet-hint">
      <span>
        {wrongChain
          ? `Switch your wallet to Robinhood Chain at the top right${what}.`
          : `Use Connect Wallet at the top right${what}.`}
      </span>
      <ArrowUpRight size={14} strokeWidth={2} aria-hidden className="shrink-0" />
    </p>
  );
}
