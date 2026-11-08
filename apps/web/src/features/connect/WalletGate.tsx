import type { ReactNode } from "react";
import { PackLoader } from "../../components/playmat/PackLoader";
import { Zone } from "../../components/playmat/Zone";
import { useAccount } from "../../lib/game/queries";
import { WalletHint } from "./WalletHint";

type Props = {
  /** Zone label of the gate, e.g. "Binder". */
  label: string;
  title: string;
  /** One short line on what connecting allows here. */
  line: string;
  /** An optional side column shown beside the gate (hidden on tablet and phone). */
  aside?: ReactNode;
  children: ReactNode;
};

/**
 * Pages that only make sense with a wallet (Binder, Pack, Ops) render their content once a wallet is on
 * Robinhood Chain; until until then the page says so in words and points at the wallet control in the masthead.
 */
export function WalletGate({ label, title, line, aside, children }: Props) {
  const account = useAccount();
  if (account.isPending) return <PackLoader label="Reading your wallet…" />;
  if (account.data?.isRightChain) return <>{children}</>;
  return (
    <div className="playmat">
      {aside ? <div className="playmat-col col-side hide-tablet max-tab:hidden">{aside}</div> : null}
      <div className="playmat-col col-fill">
        <Zone label={label} className="items-center justify-center px-9 pt-9 pb-8 max-tab:px-4 max-tab:pt-7">
          <div className="flex w-full max-w-115 flex-col gap-5" data-testid="wallet-gate">
            <div className="flex flex-col gap-2">
              <h1 className="t-heading text-balance">{title}</h1>
              <p className="t-small">{line}</p>
              <WalletHint />
            </div>
          </div>
        </Zone>
      </div>
    </div>
  );
}
