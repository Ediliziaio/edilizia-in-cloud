import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play, X } from "lucide-react";
import "./home-video-gallery.css";

const videos = [
  {
    id: "Yk0hJ01HKco",
    topic: "Organizzazione",
    title: "Da Excel e WhatsApp a un’impresa edile organizzata",
    description: "Ufficio, squadre e informazioni: da dove partire per tenere insieme il lavoro.",
    duration: "2:00",
    poster: "/images/marketing/video-organizzazione.jpg",
  },
  {
    id: "ZVsy7hnM8v8",
    topic: "Margine di commessa",
    title: "Hai finito il cantiere. Ma quanto hai guadagnato davvero?",
    description: "Il lavoro è finito. È il momento di confrontare il margine previsto con i costi reali.",
    duration: "2:19",
    poster: "/images/marketing/video-margini.jpg",
  },
  {
    id: "SdOsQ9YyMvI",
    topic: "Liquidità",
    title: "Impresa edile in utile, conto in rosso: dove sono i soldi?",
    description: "Utile e denaro disponibile sono due cose diverse. Un punto di partenza per capire la cassa.",
    duration: "2:24",
    poster: "/images/marketing/video-liquidita.jpg",
  },
] as const;

export default function HomeVideoGallery() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const player = useRef<HTMLIFrameElement>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (activeId) player.current?.focus();
  }, [activeId]);

  function closeVideo() {
    const previous = activeId;
    setActiveId(null);
    if (previous) requestAnimationFrame(() => triggers.current[previous]?.focus());
  }

  return (
    <section className="home-video-gallery" aria-labelledby="home-videos-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && activeId) { event.preventDefault(); closeVideo(); }
      }}>
      <div className="home-video-gallery__inner">
        <div className="home-video-gallery__heading">
          <div>
            <p className="home-video-gallery__eyebrow">Dal nostro canale · Video pratici</p>
            <h2 id="home-videos-title">Più controllo, un video alla volta.</h2>
          </div>
          <p>Organizzazione, margini e cassa: tre punti da cui partire, in circa due minuti ciascuno.</p>
        </div>
        <div className="home-video-gallery__grid">
          {videos.map((video) => {
            const active = activeId === video.id;
            return (
              <article key={video.id} className="home-video-card">
                <div className="home-video-card__media">
                  {active ? <iframe key={video.id} ref={player}
                    src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0`}
                    title={video.title} allow="autoplay; encrypted-media; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : null}
                  <button ref={(element) => { triggers.current[video.id] = element; }}
                    type="button" hidden={active} className="home-video-card__play"
                    aria-label={`Riproduci: ${video.title}`} onClick={() => setActiveId(video.id)}>
                    <img src={video.poster} alt="" width="480" height="360" loading="lazy" decoding="async" />
                    <span className="home-video-card__shade" aria-hidden="true" />
                    <span className="home-video-card__play-icon" aria-hidden="true"><Play size={22} fill="currentColor" /></span>
                    <span className="home-video-card__duration" aria-hidden="true">{video.duration}</span>
                  </button>
                </div>
                <div className="home-video-card__body">
                  <p className="home-video-card__topic">{video.topic}</p>
                  <h3>{video.title}</h3>
                  <p className="home-video-card__description">{video.description}</p>
                  {active ? <button type="button" className="home-video-card__action" onClick={closeVideo}>
                    <X size={16} aria-hidden="true" /> Chiudi il video
                  </button> : <button type="button" className="home-video-card__action" onClick={() => setActiveId(video.id)}>
                    Guarda il video <ArrowUpRight size={16} aria-hidden="true" />
                  </button>}
                  {active && <a className="home-video-card__youtube" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">Apri su YouTube</a>}
                </div>
              </article>
            );
          })}
        </div>
        <div className="home-video-gallery__footer">
          <p>Il player YouTube si carica solo al clic. Un solo video aperto alla volta.</p>
          <a href="https://www.youtube.com/@ediliziaincloud" target="_blank" rel="noopener noreferrer">Tutti i video sul canale <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
      </div>
    </section>
  );
}
