// The game's rules as the landing words them ("How it plays", "House rules"), with every number read
// from packages/config through `facts`.
import { formatWif } from "../format";
import type { Palette } from "../palette";
import { facts } from "./facts";

const burnPercent = facts.burnBps / 100;
const windowHours = facts.disputeWindow / 3600;
const price = formatWif(facts.price);
const priceShort = `${Number(facts.price / 10n ** 18n) / 1000}K`;

export interface Step {
  name: string;
  tag: string;
  power: string;
  icon: "Spark" | "Packaging" | "Product" | "Brand" | "Motion";
  text: string;
}

/** The five ability cards in the "How it plays" deck. */
export const playSteps: Step[] = [
  {
    name: "Pick",
    tag: "Before kickoff",
    power: "1",
    icon: "Spark",
    text: "Choose one player for one match. One pick per wallet, locked at kickoff.",
  },
  {
    name: "Mint",
    tag: "$WIF",
    power: priceShort,
    icon: "Product",
    text: `Your pick becomes a card for ${price} $WIF. Every $WIF goes into the match pot.`,
  },
  {
    name: "Settle",
    tag: "Full time",
    power: `${windowHours}H`,
    icon: "Packaging",
    text: `The top-rated player is posted with its source. ${windowHours === 2 ? "Two" : windowHours} hours to flag a mistake, then it is final.`,
  },
  {
    name: "Claim",
    tag: "Winners",
    power: `${100 - burnPercent}%`,
    icon: "Brand",
    text: `Burn a winning card for your share of ${100 - burnPercent}% of the pot. Fewer cards on your player, bigger share.`,
  },
  {
    name: "Burn",
    tag: "Every pot",
    power: `${burnPercent}%`,
    icon: "Motion",
    text: `${burnPercent}% of every pot is burned for good. A pot nobody called rolls into the next match.`,
  },
];

/** SkillStack takes its cards as numbered props. */
export function skillProps(steps: Step[]): Record<string, string | number> {
  const props: Record<string, string | number> = { count: steps.length };
  steps.forEach((step, index) => {
    const k = index + 1;
    props[`skill${k}Name`] = step.name;
    props[`skill${k}Tag`] = step.tag;
    props[`skill${k}Power`] = step.power;
    props[`skill${k}Icon`] = step.icon;
    props[`skill${k}Text`] = step.text;
  });
  return props;
}

/** The three numbers in the "House rules" zone. */
export const houseRules = [
  { value: "1", label: "pick" },
  { value: `${burnPercent}%`, label: "burned" },
  { value: `${windowHours}h`, label: "to settle" },
] as const;

const phaseHeads: Record<string, string> = {
  Pick: "One player",
  Mint: "One card",
  Settle: "The rating",
  Claim: "Your share",
};

/** TurnPhases' numbered props for the first four steps (Pick, Mint, Settle, Claim) and its colours. */
export function turnPhaseProps(ink: Palette): Record<string, string | boolean> {
  const props: Record<string, string | boolean> = {
    showPlay: false,
    ink: ink.ink,
    muted: ink.graphite,
    card: ink.card,
    panel: ink.card,
    line: ink.lineSoft,
    accent: ink.pink,
    edge: ink.cyan,
    dark: ink.mat,
  };
  playSteps.slice(0, 4).forEach((step, index) => {
    const k = index + 1;
    props[`phase${k}Name`] = step.name;
    props[`phase${k}Time`] = step.tag;
    props[`phase${k}Head`] = phaseHeads[step.name] ?? step.name;
    props[`phase${k}Text`] = step.text;
    props[`phase${k}Get`] = step.power;
  });
  return props;
}
