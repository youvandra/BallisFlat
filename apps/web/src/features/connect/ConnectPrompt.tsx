import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Sheet } from "../../components/ui/Sheet";
import { useAccount } from "../../lib/game/queries";
import { ConnectWallet } from "./ConnectWallet";

type Prompt = (then?: () => void) => void;

const ConnectPromptContext = createContext<Prompt | null>(null);

/**
 * Asks for a wallet only when an action needs one: `prompt(then)` runs `then` straight away when a wallet
 * is on Robinhood Chain, otherwise opens the connect sheet and runs `then` once the connect or switch lands.
 */
export function ConnectPromptProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const ready = Boolean(account.data?.isRightChain);
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const prompt = useCallback<Prompt>(
    (then) => {
      if (ready) {
        then?.();
        return;
      }
      pending.current = then ?? null;
      setOpen(true);
    },
    [ready],
  );

  useEffect(() => {
    if (!open || !ready) return;
    setOpen(false);
    const then = pending.current;
    pending.current = null;
    then?.();
  }, [open, ready]);

  const close = () => {
    pending.current = null;
    setOpen(false);
  };

  return (
    <ConnectPromptContext value={prompt}>
      {children}
      <Sheet open={open} onClose={close} title="Connect a Wallet">
        <div className="flex flex-col gap-3">
          <h2 className="t-heading pr-10">Connect a wallet</h2>
          <p className="t-small">Picking, buying, selling and claiming each ask your wallet to sign.</p>
          <ConnectWallet />
        </div>
      </Sheet>
    </ConnectPromptContext>
  );
}

export function useConnectPrompt(): Prompt {
  const prompt = useContext(ConnectPromptContext);
  if (!prompt) throw new Error("useConnectPrompt needs a ConnectPromptProvider");
  return prompt;
}
