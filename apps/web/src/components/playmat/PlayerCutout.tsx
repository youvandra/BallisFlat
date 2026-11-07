import { useEffect, useRef, useState } from "react";

/**
 * A player's cut-out figure on the card art. Until the image has loaded, the art well shows a quiet shimmer
 * instead of an empty halftone; the figure then fades in. A cached image counts as loaded straight away.
 */
export function PlayerCutout({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(Boolean(ref.current?.complete && ref.current.naturalWidth > 0));
  }, []);
  return (
    <>
      {loaded ? null : <span className="cutout-skeleton" aria-hidden />}
      <img
        ref={ref}
        src={src}
        alt=""
        className={`player-cutout${loaded ? " is-loaded" : ""}`}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        // a failed load stops the shimmer too; the card keeps its halftone and number
        onError={() => setLoaded(true)}
      />
    </>
  );
}
