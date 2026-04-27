import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const clients = [
  "Edilcasa Srl",
  "CostruzioniNova",
  "BuildPro Italia",
  "ImpresaVerde",
  "CantierPiù",
  "DomusEdil",
];

export default function ClientLogosSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-16 md:py-24 bg-white">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-2xl md:text-4xl font-extrabold text-[#111111] text-center mb-3 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Aziende che ci hanno <span className="text-[#F97415]">scelto</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-12 text-base transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Oltre 150 imprese edili italiane usano Edilizia in Cloud ogni giorno.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
          {clients.map((c, i) => (
            <div
              key={c}
              className={`flex items-center justify-center px-4 py-6 rounded-xl bg-gray-50 border border-gray-100 transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: isVisible ? `${200 + i * 80}ms` : "0ms" }}
            >
              <span className="text-gray-400 font-bold text-sm md:text-base tracking-tight grayscale">
                {c}
              </span>
            </div>
          ))}
        </div>

        <p
          className={`text-center text-xs text-gray-400 mt-8 italic transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          Loghi rappresentativi — logo originali sotto NDA.
        </p>
      </div>
    </section>
  );
}
