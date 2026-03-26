import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import FloatingEdiliziaIcons from "./FloatingEdiliziaIcons";

const criteria = [
  { n: "01", title: "È specifico per il tuo settore?", desc: "Edilizia in Cloud è l'unico software creato ESCLUSIVAMENTE per aziende edili. Non un gestionale generico adattato." },
  { n: "02", title: "Lo posso usare DA SOLO senza un tecnico?", desc: "Interfaccia intuitiva. Se sai usare WhatsApp, sai usare Edilizia in Cloud. Zero formazione necessaria." },
  { n: "03", title: "Mi fa RISPARMIARE più di quanto costa?", desc: "Il ROI medio è 10-50x l'investimento nel primo anno. Ti ripaga dal primo mese." },
  { n: "04", title: "Vedo risultati SUBITO o devo aspettare mesi?", desc: "Dal primo mese vedi i tuoi margini reali. Nessuna attesa, nessun setup complicato." },
  { n: "05", title: "Chi c'è DIETRO e mi può capire?", desc: "Non un call center. Un imprenditore edile come te che risponde personalmente e capisce i tuoi problemi." },
];

export default function CriteriaSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-16 md:py-32 bg-[#111111] relative overflow-hidden">
      {/* Luminous top border */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.7) 30%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.7) 70%, transparent 100%)" }} />
      {/* Glow orbs — intensificati */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full pointer-events-none blur-[120px]"
        style={{ background: "radial-gradient(ellipse at top, rgba(249,116,21,0.20) 0%, transparent 65%)" }} />
      <div className="absolute bottom-0 right-0 w-[450px] h-[450px] rounded-full pointer-events-none blur-[140px]"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.16) 0%, transparent 65%)" }} />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full pointer-events-none blur-[100px]"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.10) 0%, transparent 70%)" }} />
      <FloatingEdiliziaIcons variant={3} />
      <div ref={ref} className="max-w-4xl mx-auto px-6 relative z-10">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          5 Criteri per Scegliere il <span className="text-[#F97415]">Software Giusto</span>
        </h2>
        <p
          className={`text-white/50 text-center mb-16 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Prima di scegliere qualsiasi software, fatti queste 5 domande:
        </p>

        <div className="space-y-6">
          {criteria.map((c, i) => (
            <div
              key={i}
              className={`flex gap-4 md:gap-6 p-4 md:p-6 rounded-2xl bg-white/[0.05] border border-white/[0.08] hover:border-[#F97415]/30 hover:bg-white/[0.08] transition-all duration-500 group ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: isVisible ? `${200 + i * 100}ms` : "0ms" }}
            >
              <span
                className="font-extrabold text-3xl md:text-4xl flex-shrink-0 bg-gradient-to-b from-[#F97415] to-[#F97415]/30 bg-clip-text text-transparent"
              >
                {c.n}
              </span>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">{c.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
