import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";

export default function MarginVideoLesson() {
  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLIFrameElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (playing) player.current?.focus(); }, [playing]);
  const close = () => { setPlaying(false); requestAnimationFrame(() => playButton.current?.focus()); };
  return <section className="px-5 py-14 sm:px-6 md:py-20" aria-labelledby="video-margine-title">
    <div className="max-w-5xl mx-auto grid md:grid-cols-[220px_1fr] gap-7 md:gap-12 items-center rounded-3xl bg-[#102c46] text-white p-6 sm:p-9">
      <div className="relative w-full max-w-48 md:max-w-none mx-auto overflow-hidden rounded-2xl ring-1 ring-white/15 bg-black aspect-[9/16]">
        {playing ? <iframe ref={player} src="https://www.youtube-nocookie.com/embed/y2GEKRVgFnY?autoplay=1&playsinline=1&rel=0" title="Il fatturato non è quello che ti resta — video Edilizia in Cloud" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen className="absolute inset-0 w-full h-full border-0" /> : <button ref={playButton} type="button" onClick={() => setPlaying(true)} className="group relative block w-full h-full" aria-label="Riproduci Il fatturato non è quello che ti resta in questa pagina">
          <img src="/images/marketing/video-margine.webp" width={480} height={853} loading="lazy" decoding="async" alt="Copertina del video: Hai fatturato. Ma quanto ti resta?" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center"><span className="flex size-14 items-center justify-center rounded-full bg-white text-[#102c46] shadow-lg"><Play size={24} aria-hidden="true" /></span></span>
        </button>}
      </div>
      <div><p className="text-xs uppercase tracking-[0.16em] font-semibold text-orange-300">Un concetto, in 25 secondi</p><h2 id="video-margine-title" className="mt-4 text-2xl md:text-4xl font-bold tracking-tight leading-tight">Il fatturato non è quello che ti resta.</h2><p className="mt-5 text-white/75 leading-relaxed">Il valore del lavoro acquisito e il risultato del cantiere sono due numeri diversi. Parti da questa distinzione per leggere ore, materiali e costi della commessa.</p><button type="button" onClick={playing ? close : () => setPlaying(true)} aria-pressed={playing} className="inline-flex items-center gap-2 mt-6 min-h-12 rounded-full bg-orange-500 text-white px-5 py-3 font-semibold">{playing ? <><X size={18} /> Chiudi il video</> : <><Play size={18} /> Guarda il video qui</>}</button><p className="mt-3 text-xs leading-relaxed text-white/70">Il player YouTube viene caricato solo quando apri il video. La riproduzione resta in questa pagina.</p></div>
    </div>
  </section>;
}
