import { FootballMark } from "./FootballMark";

type Props = { overprint: string; folio: string; variant: "default" | "quiet" };

/**
 * Riso Backdrop (Framer component QVHnfmw0w): two halftone blooms masked by the landing's halftone
 * images, the page word overprinted at 300px in cyan with a pink copy off register, a line-drawn football in
 * each corner (where the landing has registration marks), the folio line bottom-left and the paper grain on top. The phone breakpoint switches to the
 * Compact variant in tokens.css.
 */
export function RisoBackdrop({ overprint, folio, variant }: Props) {
  return (
    <div className="riso" data-variant={variant} aria-hidden>
      <div className="riso-halftone riso-halftone-pink" />
      <div className="riso-halftone riso-halftone-cyan" />
      <div className="riso-overprint">
        <p className="ink2">{overprint}</p>
        <p className="pink">{overprint}</p>
      </div>
      <FootballMark className="riso-reg riso-reg-tl" />
      <FootballMark className="riso-reg riso-reg-tr" />
      <FootballMark className="riso-reg riso-reg-bl" />
      <FootballMark className="riso-reg riso-reg-br" />
      <p className="riso-folio">{folio}</p>
      <div className="riso-grain" />
    </div>
  );
}
