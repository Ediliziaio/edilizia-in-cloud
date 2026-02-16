import { useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function FounderLetterBottom() {
  const [expanded, setExpanded] = useState(false);
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-20" style={{ background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 100%)" }}>
      <div className="max-w-3xl mx-auto px-6">
        <div className={`text-center mb-10 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <span className="inline-block mb-4 px-4 py-1.5 rounded-full border border-[#0fa68c]/40 bg-[#0fa68c]/10 text-[#0fa68c] text-xs font-semibold uppercase tracking-widest">
            Da imprenditore a imprenditore
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white">Lettera dal Fondatore</h2>
        </div>

        <div className={`relative transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div
            className="relative overflow-hidden transition-all duration-700 ease-in-out"
            style={{ maxHeight: expanded ? "5000px" : "220px" }}
          >
            <div className="prose prose-lg prose-invert max-w-none text-white/70 space-y-5 leading-relaxed">
              <p>Caro Imprenditore Edile,</p>
              <p>Mi chiamo <strong className="text-white">Florin</strong> e ti scrivo questa lettera perché so esattamente dove sei adesso.</p>
              <p>Lo so perché ci sono stato.</p>
              <p>Gestisco un'azienda di serramenti qui in Lombardia. Non un'agenzia di consulenza. Non una software house. Un'azienda <strong className="text-white">VERA</strong>, con operai veri, cantieri veri, fornitori che chiamano per essere pagati e clienti che vogliono tutto per ieri.</p>
              <p>E per anni ho fatto quello che probabilmente stai facendo tu adesso:</p>
              <p className="text-xl font-bold text-white text-center">Fatturare. Fatturare. Fatturare.</p>
              <p>Convinto che il fatturato fosse la risposta a tutto.</p>
              <p><strong className="text-white">Sai com'è andata?</strong></p>
              <p>Ho chiuso un anno con un fatturato record. Poi ho guardato i numeri <strong className="text-white">VERI</strong>. E ho scoperto che avevo lavorato un anno intero per portare a casa <strong className="text-white">meno del mio capo cantiere</strong>.</p>
              <p className="text-2xl font-extrabold text-white text-center">"MAI PIÙ."</p>

              <p>Ho cercato uno strumento. Non ho trovato niente di adatto. Allora:</p>
              <p className="text-xl font-bold text-[#0fa68c] text-center">Me la sono costruita da solo.</p>

              <div className="border-t border-white/10 my-8" />

              <p>Uno strumento che in poche ore al mese ti dà il <strong className="text-white">controllo TOTALE</strong> sui numeri che contano.</p>
              <p>Nel <strong className="text-white">primo mese</strong>: scoperto 2 cantieri su 5 con margini <strong className="text-white">NEGATIVI</strong>.</p>
              <p>Nel <strong className="text-white">secondo mese</strong>: evitato uno scoperto bancario di 12.000€.</p>
              <p>Nel <strong className="text-white">terzo mese</strong>: iniziato a rifiutare i lavori sbagliati.</p>
              <p>A fine anno? Compenso personale cresciuto del <strong className="text-white">40%</strong>.</p>

              <div className="border-t border-white/10 my-8" />

              <p className="bg-white/5 border-l-4 border-[#0fa68c] pl-4 py-3 rounded-r-lg font-semibold text-white">
                Se usi Edilizia in Cloud per 30 giorni, scoprirai ESATTAMENTE dove stai perdendo soldi. Se non succede? Ti restituisco tutto.
              </p>

              <p className="font-semibold text-white">Perché quando vedi i numeri VERI della tua azienda per la prima volta… non torni più indietro.</p>

              <div className="text-center my-8">
                <a
                  href="#cta-finale"
                  onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
                  className="inline-block px-8 py-4 rounded-full bg-[#0fa68c] text-white font-bold text-lg hover:bg-[#0d9079] transition-all shadow-lg shadow-[#0fa68c]/30"
                >
                  👉 RICHIEDI LA TUA DEMO GRATUITA ORA
                </a>
              </div>

              <div className="border-t border-white/10 my-8" />

              <p>Un saluto da imprenditore a imprenditore,</p>
              <div className="mt-4">
                <p className="text-xl font-bold text-white">Florin</p>
                <p className="text-[#0fa68c] font-semibold">Fondatore di Edilizia in Cloud</p>
                <p className="text-sm text-white/50">Imprenditore nel settore serramenti — Lombardia</p>
              </div>

              <div className="mt-10 space-y-6 bg-white/5 rounded-xl p-6">
                <p className="text-sm leading-relaxed"><strong className="text-white">P.S.</strong> La demo dura 15 minuti. Quanto tempo hai perso <strong className="text-white">OGGI</strong> a cercare un DDT o rifare un calcolo? Quei 15 minuti li hai già persi.</p>
                <p className="text-sm leading-relaxed"><strong className="text-white">P.P.S.</strong> <em>Il fatturato è vanità, il margine è sanità, la cassa è realtà.</em> Se questa frase ti ha fatto male allo stomaco, hai bisogno di Edilizia in Cloud più di quanto pensi.</p>
                <p className="text-sm leading-relaxed"><strong className="text-white">P.P.P.S.</strong> Se stai leggendo fin qui, non sei il tipo che rimanda. Il link è qui sotto.</p>
              </div>

              <div className="text-center mt-8">
                <a
                  href="#cta-finale"
                  onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
                  className="inline-block px-8 py-4 rounded-full bg-[#0fa68c] text-white font-bold text-lg hover:bg-[#0d9079] transition-all shadow-lg shadow-[#0fa68c]/30"
                >
                  👉 SÌ, VOGLIO LA MIA DEMO GRATUITA
                </a>
              </div>
            </div>

            {!expanded && (
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#1a2744] to-transparent pointer-events-none" />
            )}
          </div>

          <div className="text-center mt-6">
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 transition-all"
            >
              {expanded ? (
                <>Chiudi la lettera <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>Leggi la lettera completa <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
