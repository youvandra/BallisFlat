// Typed entry to the verbatim Framer code components in src/framer (screen part, loaded with the screens).
import CaseSleeveRaw from "../../framer/CaseSleeve";
import ChipRowRaw from "../../framer/ChipRow";
import HoloCardRaw from "../../framer/HoloTradingCard";
import PackRipRaw from "../../framer/PackRip";
import ProjectCascadeRaw from "../../framer/ProjectCascade";
import SkillStackRaw from "../../framer/SkillStack";
import SummonCardRaw from "../../framer/SummonCard";
import TurnPhasesRaw from "../../framer/TurnPhases";
import { type Loose, loose } from "./framer-loose";

export const CaseSleeve: Loose<typeof CaseSleeveRaw> = loose(CaseSleeveRaw);
export const ChipRow: Loose<typeof ChipRowRaw> = loose(ChipRowRaw);
export const HoloCard: Loose<typeof HoloCardRaw> = loose(HoloCardRaw);
export const PackRip: Loose<typeof PackRipRaw> = loose(PackRipRaw);
export const ProjectCascade: Loose<typeof ProjectCascadeRaw> = loose(ProjectCascadeRaw);
export const SkillStack: Loose<typeof SkillStackRaw> = loose(SkillStackRaw);
export const SummonCard: Loose<typeof SummonCardRaw> = loose(SummonCardRaw);
export const TurnPhases: Loose<typeof TurnPhasesRaw> = loose(TurnPhasesRaw);
