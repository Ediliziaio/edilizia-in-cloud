import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import InlineYouTube from "./InlineYouTube";
import { editorialVideos, editorialVideoIsDue, editorialVideoPublicationLabel, type EditorialVideoKey } from "@/lib/marketing/editorialVideos";

export default function EditorialVideo({ video, contained = false }: { video: EditorialVideoKey; contained?: boolean }) {
  const entry = editorialVideos[video];
  // Same initial render during prerender and hydration. Never preload a private video.
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const update = () => setAvailable(editorialVideoIsDue(entry.publishAt));
    update();
    const delay = Date.parse(entry.publishAt) - Date.now();
    const timer = delay > 0 ? window.setTimeout(update, Math.min(delay + 50, 2_147_483_647)) : undefined;
    document.addEventListener("visibilitychange", update);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", update); };
  }, [entry.publishAt]);

  return <section aria-labelledby={`editorial-video-${video}`} className={contained ? "rounded-3xl border border-gray-200 bg-[#f6f4ef] p-5 md:p-8" : "bg-[#f6f4ef] px-5 py-14 sm:px-6 md:py-20"}>
    <div className="mx-auto grid max-w-6xl items-center gap-7 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-orange-700">Dal nostro canale</p>
        <h2 id={`editorial-video-${video}`} className="mt-4 text-2xl font-bold leading-tight tracking-tight text-[#111111] md:text-3xl">{entry.title}</h2>
        <p className="mt-4 leading-relaxed text-gray-600">{entry.description}</p>
        {available ? <p className="mt-4 text-sm text-gray-600">Guarda il video qui. Il player si carica solo quando premi Riproduci.</p> : <p className="mt-5 flex items-start gap-2 text-sm text-gray-600"><CalendarClock size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Pubblicazione programmata: <time dateTime={entry.publishAt}>{editorialVideoPublicationLabel(entry.publishAt)}</time>.</span></p>}
      </div>
      {available ? <InlineYouTube videoId={entry.id} title={entry.title} poster={entry.poster} /> : <figure className="relative m-0 aspect-video overflow-hidden rounded-2xl bg-[#102c46]">
        <img src={entry.poster} alt={`Copertina del video: ${entry.title}`} width={960} height={540} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        <figcaption className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#102c46] shadow-sm">In programma</figcaption>
      </figure>}
    </div>
  </section>;
}
