import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Clock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const articles = [
  {
    slug: "calcolare-margine-reale-cantiere-edile",
    title: "Come calcolare il margine reale di un cantiere edile",
    excerpt:
      "La formula che usano le imprese edili italiane più redditizie per non confondere mai più il fatturato con il guadagno reale.",
    minutes: 5,
  },
  {
    slug: "durc-cassa-edile-guida-2026",
    title: "DURC e Cassa Edile: guida pratica 2026",
    excerpt:
      "Scadenze, controlli automatici e come evitare il blocco dei pagamenti negli appalti pubblici e privati.",
    minutes: 7,
  },
  {
    slug: "pnrr-bonus-110-rendicontazione-digitale",
    title: "PNRR e bonus 110: digitalizzare la rendicontazione",
    excerpt:
      "Cosa serve oggi per gestire pratiche complesse senza perdere documenti, scadenze e crediti d'imposta.",
    minutes: 6,
  },
];

export default function BlogTeaserSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-16 md:py-24 bg-white">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#111111] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Dal nostro <span className="text-[#F97415]">blog</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Guide pratiche per imprenditori edili. Niente teoria — solo cose che usi domani.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {articles.map((a, i) => (
            <Link
              key={a.slug}
              to={`/blog/${a.slug}`}
              className={`block p-6 rounded-2xl bg-[#f8f9fa] border border-gray-100 hover:border-[#F97415]/40 hover:bg-white hover:shadow-lg transition-all duration-700 group ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: isVisible ? `${200 + i * 150}ms` : "0ms" }}
            >
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <Clock className="w-3.5 h-3.5" />
                <span>{a.minutes} min di lettura</span>
              </div>
              <h3 className="text-lg font-bold text-[#111111] mb-3 leading-snug group-hover:text-[#F97415] transition-colors">
                {a.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{a.excerpt}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 text-[#F97415] font-semibold text-sm">
                Leggi l'articolo
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>

        <div
          className={`text-center mt-12 transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-[#F97415] hover:text-[#C94F06] font-bold text-base group"
          >
            Vai al blog
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
