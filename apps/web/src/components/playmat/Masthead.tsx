import { product } from "@app/config/constants";
import { LogOut, Rocket, Wallet } from "lucide-react";
import { Link } from "react-router";
import { formatUnits } from "viem";
import { useConnectPrompt } from "../../features/connect/ConnectPrompt";
import { useNow } from "../../hooks/use-now";
import { useWallet } from "../../hooks/use-wallet";
import { formatDay, shortHash } from "../../lib/format";
import { matchdayLabel } from "../../lib/game/fixtures";
import { useBoard } from "../../lib/game/queries";
import { CountUp } from "../ui/CountUp";
import { Logo } from "../ui/Logo";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * The wallet in the masthead: a Connect Wallet button that opens the connect sheet, then balance, address
 * and a disconnect button. The button keeps the pill's 40px height, so the masthead does not grow or shift.
 */
function WalletPill() {
  const { account, disconnect, switchChain, mode } = useWallet();
  const prompt = useConnectPrompt();
  if (account.isPending) return <span className="wallet-pill t-small">Reading Wallet…</span>;
  const current = account.data;
  if (!current) {
    return (
      <button type="button" className="submit min-h-10 cursor-pointer py-0" onClick={() => prompt()}>
        <Wallet size={15} strokeWidth={2} aria-hidden />
        <span className="max-tab:hidden">Connect Wallet</span>
        <span className="tab:hidden">Connect</span>
      </button>
    );
  }
  if (!current.isRightChain) {
    return (
      <button
        type="button"
        className="submit min-h-10 cursor-pointer py-0"
        onClick={() => switchChain.mutate()}
      >
        Switch to Robinhood Chain
      </button>
    );
  }
  return (
    <span className="wallet-pill">
      <span className="live-dot" aria-hidden />
      <span className="whitespace-nowrap text-ink" data-testid="wif-balance">
        <CountUp
          value={Number(formatUnits(current.wif, 18))}
          format={(value) => whole.format(Math.floor(value))}
        />{" "}
        $WIF
      </span>
      <span className="t-small num max-tab:hidden">
        {mode === "mock" ? "Demo " : ""}
        {shortHash(current.address)}
      </span>
      <button
        type="button"
        onClick={() => disconnect.mutate()}
        aria-label="Disconnect Wallet"
        title="Disconnect Wallet"
        className="icon-button size-8!"
      >
        <LogOut size={15} strokeWidth={2} aria-hidden />
      </button>
    </span>
  );
}

/** The landing masthead's right side, as in Framer: London time and when the next matchday opens. */
function LandingStatus() {
  const board = useBoard();
  const now = useNow(60_000);
  const next = board.data?.find((view) => view.state === "Open");
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(now * 1000));
  const kickoff = next ? Math.floor(Date.parse(next.fixture.kickoff) / 1000) : 0;
  return (
    <div className="flex flex-col items-end gap-0.5 text-right max-tab:hidden">
      <span className="t-small num text-ink">London {clock}</span>
      {next ? (
        <span className="t-small">
          {matchdayLabel(next.fixture)} picks open {formatDay(kickoff)}
        </span>
      ) : null}
    </div>
  );
}

type Variant = "landing" | "app";

/**
 * Masthead (Framer component iz_oxBMfc) in the Masthead Bar: the BIF logo on the left; on the
 * right the Sound icon button, then the wallet pill in the app. The landing's call to action is Launch App:
 * in the bottom bar on tablet and desktop, beside the logo on a phone. Padding 28px 40px, 24px 28px on tablet, 20px 16px on phone.
 */
export function Masthead({ variant }: { variant: Variant }) {
  return (
    <div className="masthead-bar">
      <header className="masthead">
        <Link
          to={variant === "app" ? "/matches" : "/"}
          className="flex items-center gap-3 text-white"
          aria-label={`${product.name} Beta`}
        >
          <Logo className="masthead-logo" />
          <span className="t-small text-ink" aria-hidden>
            Beta
          </span>
        </Link>
        <div className="flex items-center gap-2 max-tab:gap-0.5">
          {variant === "landing" ? (
            <>
              <LandingStatus />
              {/* Phone: Launch App sits up here beside the logo; tablet and desktop keep it in the bottom bar. */}
              <Link to="/matches" className="submit min-h-10 cursor-pointer py-0 tab:hidden">
                <Rocket size={15} strokeWidth={2} aria-hidden />
                Launch App
              </Link>
            </>
          ) : (
            <span className="ml-1">
              <WalletPill />
            </span>
          )}
        </div>
      </header>
    </div>
  );
}
