import { saleSplit } from "@app/core/payout";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { parseUnits } from "viem";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { Sheet } from "../../components/ui/Sheet";
import { formatWif } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { facts } from "../../lib/game/facts";
import { matchName } from "../../lib/game/fixtures";
import { type BinderCard, useGame } from "../../lib/game/queries";
import { sleeveCodes } from "../../lib/game/sleeve";

/** "1,200" or "1200.5" to wei; null for anything that is not a positive amount. */
function parsePrice(raw: string): bigint | null {
  const clean = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,18})?$/.test(clean)) return null;
  const value = parseUnits(clean, 18);
  return value > 0n ? value : null;
}

const burnPercent = facts.saleBurnBps / 100;

/**
 * Sell a sealed card: set a price in $WIF and see the split before signing (what you receive, what the 5%
 * sale burn takes). The card stays in your wallet until someone buys it; opening it cancels the listing.
 */
export function SellSheet({ card, onClose }: { card: BinderCard | null; onClose: () => void }) {
  const client = useGame();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [raw, setRaw] = useState("");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // A fresh form for each card; the price starts at the current listing, or the mint price.
  const tokenKey = card ? String(card.tokenId) : "";
  const startPrice = card?.listing?.price ?? facts.price;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when another card opens the sheet
  useEffect(() => {
    setRaw(formatWif(startPrice).replace(/,/g, ""));
    setTouched(false);
    setDone(null);
  }, [tokenKey]);

  const action = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const price = parsePrice(raw);
  const split = price ? saleSplit(price, facts.saleBurnBps) : null;
  const listed = card?.listing ?? null;
  const close = () => {
    if (!action.isPending) {
      action.reset();
      onClose();
    }
  };

  return (
    <Sheet open={card !== null} onClose={close} title="Sell Sealed Card">
      {card ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!price) return;
            action.mutate(() => client.listForSale(card.tokenId, price), {
              onSuccess: () => setDone(`Listed for ${formatWif(price)} $WIF.`),
            });
          }}
        >
          <h2 className="t-heading pr-10">{listed ? "Your listing" : "Sell this sealed card"}</h2>
          <p className="t-small">
            {matchName(card.fixture)}, card #{card.serial}. Sales close at kickoff.
          </p>
          {listed ? <p className="badge self-start">Listed · {formatWif(listed.price)} $WIF</p> : null}
          <label htmlFor={inputId} className="flex flex-col gap-2">
            <span className="t-zone">Price in $WIF</span>
            <input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !price}
              aria-describedby={`${inputId}-help`}
              className="field-input num"
            />
          </label>
          <dl id={`${inputId}-help`} className="t-small flex flex-col gap-1.5 border-y border-line-soft py-3">
            <div className="flex justify-between gap-3">
              <dt>You receive</dt>
              <dd className="num text-ink">{split ? `${formatWif(split.toSeller)} $WIF` : "–"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Burned ({burnPercent}%)</dt>
              <dd className="num text-ink">{split ? `${formatWif(split.burned)} $WIF` : "–"}</dd>
            </div>
          </dl>
          {touched && !price ? <Notice tone="warn">Enter a price above zero, in $WIF.</Notice> : null}
          <Notice tone="warn">Opening this card later cancels the listing.</Notice>
          {action.isError ? <Notice tone="danger">{errorSentence(action.error)}</Notice> : null}
          {done ? <Notice>{done}</Notice> : null}
          <div className="flex flex-col gap-2.5">
            <Button type="submit" className="submit-tall w-full" disabled={action.isPending}>
              {action.isPending ? "Confirm in Your Wallet…" : listed ? "Update Price" : "List For Sale"}
            </Button>
            {listed ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(() => client.cancelListing(card.tokenId), {
                    onSuccess: () => setDone("Listing cancelled."),
                  })
                }
              >
                Cancel Listing
              </Button>
            ) : null}
          </div>
          <p className="t-small text-center">
            {sleeveCodes(card.fixture)} · sale burn goes to the dead address
          </p>
        </form>
      ) : null}
    </Sheet>
  );
}
