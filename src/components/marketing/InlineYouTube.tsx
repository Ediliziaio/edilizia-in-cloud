import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";

/** Used for published videos only. New demos need an ID, title and local poster. */
export default function InlineYouTube({ videoId, title, poster, portrait = false }: {
  videoId: string; title: string; poster: string; portrait?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (playing) iframe.current?.focus(); }, [playing]);
  const close = () => { setPlaying(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return <div>
    <div className={`relative overflow-hidden rounded-2xl bg-black ${portrait ? "aspect-[9/16]" : "aspect-video"}`}>
      {playing ? <iframe ref={iframe} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0`} title={title} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen className="absolute inset-0 w-full h-full border-0" /> : <button ref={trigger} type="button" onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full" aria-label={`Riproduci ${title} in questa pagina`}><img src={poster} alt={`Copertina: ${title}`} width={960} height={portrait ? 1707 : 540} loading="lazy" decoding="async" className="w-full h-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-black/10"><span className="size-16 flex items-center justify-center bg-white text-[#102c46] rounded-full shadow-xl"><Play size={28} aria-hidden="true" /></span></span></button>}
    </div>
    {playing&&<button type="button" onClick={close} className="inline-flex items-center gap-2 mt-3 min-h-11 text-sm font-semibold"><X size={16} />Chiudi il video</button>}
  </div>;
}
