import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Check, X } from "lucide-react";
import AIImage from "./AIImage";

const forYou = [
  "Sei il titolare o il socio decisore di un'azienda edile (serramenti, fotovoltaico, ristrutturazioni, impiantistica, coperture…)",
  "Fatturi almeno 200.000€/anno e vuoi finalmente vedere DOVE vanno i tuoi soldi",
  "Sei stanco di lavorare a istinto e vuoi prendere decisioni basate sui numeri",
  "Vuoi uno strumento semplice che puoi gestire TU — senza dipendere da consulenti o tecnici informatici",
  "Vuoi aumentare il tuo compenso personale nei prossimi 12 mesi",
];

const notForYou = [
  "Sei convinto che \"il fatturato è l'unica cosa che conta\" e non vuoi guardare i margini",
  "Cerchi un software che faccia TUTTO (contabilità, buste paga, fatturazione elettronica) — questo non è un ERP generico",
  "Non sei disposto a investire 2-3 ore al mese per controllare i numeri della tua azienda",
];

export default function TargetSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#f8f9fa]">
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#1a2744] text-center mb-6 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Per Chi È <span className="text-[#0fa68c]">Edilizia in Cloud</span>?
        </h2>

        {/* AI Image hero */}
        <div
          className={`mb-12 transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <AIImage
            prompt="Gruppo di imprenditori edili italiani sorridenti in un cantiere moderno, uno tiene un tablet con grafici, casco protettivo, stile illustrazione moderna professionale flat, palette navy blue e teal, formato panoramico 16:9"
            alt="Imprenditori edili con tablet in cantiere"
            className="w-full max-h-64 object-cover"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div
            className={`p-8 rounded-2xl border-2 border-[#0fa68c]/30 bg-white shadow-sm transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-16"
            }`}
          >
            <h3 className="text-2xl font-bold text-[#1a2744] mb-6">
              ✅ Perfetto per te se…
            </h3>
            <ul className="space-y-4">
              {forYou.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-[#0fa68c] flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`p-8 rounded-2xl border-2 border-red-200 bg-white shadow-sm transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-16"
            }`}
          >
            <h3 className="text-2xl font-bold text-[#1a2744] mb-6">
              ❌ NON è per te se…
            </h3>
            <ul className="space-y-4">
              {notForYou.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
