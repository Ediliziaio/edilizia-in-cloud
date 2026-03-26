import { useRef, useEffect, useState } from "react";
import { Play, CheckCircle2 } from "lucide-react";

const bullets = [
  "Nessuna presentazione di vendita — solo il prodotto reale",
  "Personalizzata sulla tua tipologia di impresa",
  "Domande e risposte in tempo reale",
];

export default function VideoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="py-24 md:py-32"
      style={{ background: "#1a2744" }}
    >
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
            Vedi Edilizia in Cloud{" "}
            <span className="text-[#0fa68c]">in Azione</span>
          </h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            30 minuti di demo live. Vedi il prodotto reale, non le slide.
          </p>
        </div>

        {/* Video box */}
        <div
          className={`transition-all duration-700 delay-150 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <a
            href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            target="_blank"
            rel="noopener noreferrer"
            className="group block relative max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl"
            style={{ aspectRatio: "16/9" }}
          >
            {/* Background photo */}
            <div
              className="absolute inset-0 w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.02]"
              style={{
                backgroundImage: "url(https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80)",
              }}
            />
            {/* Dark overlay */}
            <div
              className="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.4)" }}
            />
            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white flex items-center justify-center shadow-2xl group-hover:bg-[#0fa68c] group-hover:scale-110 transition-all duration-300">
                <Play
                  size={32}
                  className="text-[#1a2744] group-hover:text-white ml-1 transition-colors duration-300"
                  fill="currentColor"
                />
              </div>
            </div>
            {/* Bottom label */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
              <span className="px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/80 text-xs font-semibold tracking-wide border border-white/20">
                Demo Live — 30 min
              </span>
            </div>
          </a>
        </div>

        {/* Bullets */}
        <div
          className={`mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 transition-all duration-700 delay-300 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          {bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-[#0fa68c] flex-shrink-0" />
              <span className="text-white/60 text-sm">{b}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div
          className={`text-center mt-10 transition-all duration-700 delay-500 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <a
            href="/demo"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#0fa68c] text-white font-bold text-lg hover:bg-[#0d9079] hover:scale-105 transition-all duration-200 shadow-lg shadow-[#0fa68c]/30"
          >
            Prenota la tua Demo Live
            <span className="text-lg">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
