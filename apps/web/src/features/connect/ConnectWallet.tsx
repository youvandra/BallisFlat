import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { useWallet } from "../../hooks/use-wallet";
import { env } from "../../lib/env";
import { shortHash } from "../../lib/format";
import { chain } from "../../lib/game/chain";
import { errorSentence } from "../../lib/game/errors";

interface InjectedWallet {
  name: string;
  icon: string;
  rdns: string;
}

interface WalletOption {
  key: string;
  name: string;
  note: string;
  icon: string;
}

/** Browser wallets announced over EIP-6963 (MetaMask, Rabby, Robinhood Wallet…). */
function useInjectedWallets(enabled: boolean): InjectedWallet[] {
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const onAnnounce = (event: Event) => {
      const info = (event as CustomEvent<{ info?: InjectedWallet }>).detail?.info;
      if (!info?.rdns) return;
      setWallets((list) => (list.some((item) => item.rdns === info.rdns) ? list : [...list, info]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, [enabled]);
  return wallets;
}

/** Demo Wallet in mock mode; in chain mode the local anvil account when set, else the browser wallets. */
function useWalletOptions(mode: "mock" | "chain"): WalletOption[] {
  const injected = useInjectedWallets(mode === "chain");
  if (mode === "mock") {
    return [
      {
        key: "demo",
        name: "Demo Wallet",
        note: "5,000 test $WIF",
        icon: "",
      },
    ];
  }
  if (env.VITE_DEV_ACCOUNT) {
    return [
      {
        key: "dev",
        name: "Local Account",
        note: `Anvil ${shortHash(env.VITE_DEV_ACCOUNT)}`,
        icon: "",
      },
    ];
  }
  if (injected.length > 0) {
    return injected.map((wallet) => ({
      key: wallet.rdns,
      name: wallet.name,
      note: "Browser wallet",
      icon: wallet.icon,
    }));
  }
  return [{ key: "injected", name: "Browser Wallet", note: "MetaMask, Rabby or Robinhood Wallet", icon: "" }];
}

/**
 * The wallet card body, shared by the Binder gate and the connect sheet: the network badge, then one state
 * at a time (reading, wallet options, wrong network with Switch Network, connected) and any error.
 */
export function ConnectWallet() {
  const { account, connect, switchChain, mode } = useWallet();
  const options = useWalletOptions(mode);
  const current = account.data;

  return (
    <div className="flex flex-col gap-4">
      <Badge tone="cyan" className="self-start">
        {chain.name} · Chain ID <span className="num">&nbsp;{chain.id}</span>
      </Badge>

      {account.isPending ? (
        <div className="skeleton h-16" aria-busy />
      ) : current && !current.isRightChain ? (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">
            Your wallet is on another network. Switch to {chain.name} (chain id {chain.id}); if your wallet
            does not know it yet, this adds it.
          </Notice>
          <Button
            className="submit-tall w-full"
            onClick={() => switchChain.mutate()}
            disabled={switchChain.isPending}
          >
            {switchChain.isPending ? "Switching…" : "Switch Network"}
          </Button>
        </div>
      ) : current ? (
        <Notice>
          Connected as <span className="num">{shortHash(current.address)}</span>
          {mode === "mock" ? " (demo)" : ""} on {chain.name}.
        </Notice>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {options.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
                aria-label={`Connect ${option.name}`}
                className="flex w-full cursor-pointer items-center gap-3 rounded-sleeve bg-mat px-4 py-3 text-left shadow-result transition-transform hover:-translate-y-0.5 disabled:cursor-wait"
              >
                {option.icon ? (
                  <img src={option.icon} alt="" className="size-8 flex-none rounded-input" />
                ) : (
                  <span className="t-title grid size-8 flex-none place-items-center rounded-input bg-pink text-mat!">
                    {option.name.slice(0, 1)}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="t-body-strong">{option.name}</span>
                  <span className="t-small">{option.note}</span>
                </span>
                <span className="text-link whitespace-nowrap">
                  {connect.isPending ? "Connecting…" : "Connect"}
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {connect.isError ? <Notice tone="danger">{errorSentence(connect.error)}</Notice> : null}
      {switchChain.isError ? <Notice tone="danger">{errorSentence(switchChain.error)}</Notice> : null}
    </div>
  );
}
