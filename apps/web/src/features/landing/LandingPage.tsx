import { ArrowRight, RotateCw } from "lucide-react";
import { Link } from "react-router";
import { CardBackStack } from "../../components/playmat/CardBackStack";
import { PackRip, ProjectCascade, SkillStack } from "../../components/playmat/framer";
import { Zone } from "../../components/playmat/Zone";
import { Notice } from "../../components/ui/Notice";
import { TextButton } from "../../components/ui/TextButton";
import { usePhone } from "../../hooks/use-phone";
import { matchArtUrl, useCoverArtReady } from "../../lib/art";
import { matchdayLabel } from "../../lib/game/fixtures";
import { type MatchView, useBoard } from "../../lib/game/queries";
import { houseRules, playSteps, skillProps } from "../../lib/game/rules";
import { sleeveCodes, sleeveColour, sleeveNumber, sleeveTag } from "../../lib/game/sleeve";
import { palette } from "../../lib/palette";

/** ProjectCascade takes its cards as numbered props. */
function deckProps(views: MatchView[]): Record<string, unknown> {
  const props: Record<string, unknown> = { count: views.length };
  views.forEach((view, index) => {
    const k = index + 1;
    props[`card${k}Name`] = sleeveCodes(view.fixture);
    props[`card${k}Number`] = sleeveNumber(view.fixture);
    props[`card${k}Type`] = sleeveTag(view.fixture);
    props[`card${k}Color`] = sleeveColour(view.fixture);
    props[`card${k}Image`] = { src: matchArtUrl(view.fixture.slug), alt: sleeveCodes(view.fixture) };
  });
  return props;
}

/**
 * The landing, copied from the Framer Home page (augiA20Il): the Matches deck and Binder on the left, the
 * Field with the sealed Pack in the middle, How it plays and House rules on the right. The bottom bar is a
 * single Launch App button. Copy, labels and the Pack come from the Framer project.
 */
export function LandingPage() {
  useCoverArtReady();
  const board = useBoard();
  const ink = palette();
  // On a phone the Field is as wide as the pack's hint, so Sound On moves to the top corner, clear of it.
  const phone = usePhone();
  // The Framer deck holds six cards: the Nations League fixtures, the warm-up plays no part.
  const visible = (board.data ?? []).filter((view) => !view.fixture.warmUp).slice(0, 6);
  const field = visible[0];

  return (
    <div className="playmat">
      <div className="playmat-col col-side">
        <Zone label="Matches" className="gap-0.5 px-3 pt-7.5 pb-3.5">
          <div className="relative min-h-0 flex-1 max-tab:h-87.5 max-tab:flex-none">
            {board.isPending ? (
              <div className="skeleton absolute inset-0 right-5.5 rounded-sleeve" aria-busy />
            ) : board.isError ? (
              <Notice tone="danger">
                The matches did not load.{" "}
                <TextButton icon={RotateCw} onClick={() => board.refetch()}>
                  Try Again
                </TextButton>
              </Notice>
            ) : visible.length === 0 ? (
              <p className="t-small py-6">No matches on the board yet.</p>
            ) : (
              <ProjectCascade
                layout="Stack"
                hint="Tap for next"
                openLabel=""
                cardHeight={320}
                cardFill={ink.card}
                ink={ink.ink}
                edge={ink.cyan}
                accent={ink.pink}
                muted={ink.graphite}
                {...deckProps(visible)}
              />
            )}
          </div>
        </Zone>
        <Zone label="Binder" size="auto" className="items-start gap-3 px-4.5 pt-5 pb-4 tab:flex-none">
          <CardBackStack />
          <p className="t-small">Cards that miss stay in your wallet. A record of every call you made.</p>
          <Link
            to="/rules"
            className="t-body-strong inline-flex items-center gap-1.5 whitespace-nowrap rounded-input transition-opacity hover:opacity-70"
          >
            <span>How claims work</span>
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        </Zone>
      </div>

      <div className="playmat-col col-fill phone-first">
        <Zone label="Field" field className="items-center justify-center max-tab:h-140">
          <div className="mat-art" aria-hidden />
          {field ? (
            <div className="absolute inset-0">
              <PackRip
                key="landing-pack"
                packTitle="Ball is Flat"
                packSubtitle={`${matchdayLabel(field.fixture)}, Nov 2026`}
                badge="One MVP in every match"
                hint="Drag across the top to open"
                resetLabel="Seal it again"
                showReset={false}
                cardRarityLabel="MVP"
                cardImage={{ src: matchArtUrl(field.fixture.slug), alt: sleeveCodes(field.fixture) }}
                cardName="Your pick"
                cardNumber="001/100"
                cardType="Man of the match card"
                cardYear={sleeveCodes(field.fixture)}
                canvasState="peek"
                ink={ink.mat}
                hintColor={ink.graphite}
                shadow="rgba(0, 0, 0, 0)"
                titleScale={1}
                printShadow={ink.pink}
                printOffset={14}
                sound
                soundPlacement={phone ? "top" : "bottom"}
                handCount={0}
              />
            </div>
          ) : null}
        </Zone>
      </div>

      <div className="playmat-col col-side relative z-5">
        <Zone label="How it plays" className="px-3 pt-7.5 pb-3">
          <div className="relative min-h-0 flex-1 max-tab:h-90 max-tab:flex-none">
            <SkillStack
              layout="Cascade"
              cardHeight={320}
              hint="Tap to shuffle"
              cardFill={ink.card}
              ink={ink.ink}
              edge={ink.cyan}
              muted={ink.graphite}
              band1={ink.pink}
              band2={ink.cyan}
              band3={ink.note}
              {...skillProps(playSteps)}
            />
          </div>
        </Zone>
        <Zone label="House rules" size="auto" className="flex-row! gap-5.5 px-4.5 pt-7.5 pb-4">
          {houseRules.map((rule) => (
            <div key={rule.label} className="flex max-w-50 flex-col gap-1.5">
              <p className="t-stat">{rule.value}</p>
              <p className="t-small">{rule.label}</p>
            </div>
          ))}
        </Zone>
      </div>
    </div>
  );
}
