// Typed entry to the verbatim Framer code components in src/framer (shell part, loaded with the first paint).
import HandCursorRaw from "../../framer/HandCursor";
import MissingCardRaw from "../../framer/MissingCard";
import { type Loose, loose } from "./framer-loose";

export const HandCursor: Loose<typeof HandCursorRaw> = loose(HandCursorRaw);
export const MissingCard: Loose<typeof MissingCardRaw> = loose(MissingCardRaw);
