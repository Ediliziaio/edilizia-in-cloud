import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Hammer, HardHat, Ruler, Warehouse, Wrench, Building2, Blocks, ConeIcon } from "lucide-react";
import heroMockup from "@/assets/hero-dashboard-mockup.png";

const floatingIcons = [
  { Icon: HardHat, top: "10%", left: "5%", size: 48, delay: "0s", anim: "animate-float" },
  { Icon: Hammer, top: "20%", right: "8%", size: 40, delay: "1s", anim: "animate-float-slow" },
  { Icon: Ruler, top: "60%", left: "10%", size: 36, delay: "2s", anim: "animate-float" },
  { Icon: Warehouse, top: "70%", right: "12%", size: 44, delay: "0.5s", anim: "animate-float-slow" },
  { Icon: Wrench, top: "40%", left: "3%", size: 32, delay: "3s", anim: "animate-float" },
  { Icon: Building2, top: "15%", left: "80%", size: 52, delay: "1.5s", anim: "animate-float-slow" },
  { Icon: Blocks, top: "80%", left: "25%", size: 38, delay: "2.5s", anim: "animate-float" },
  { Icon: ConeIcon, top: "50%", right: "5%", size: 34, delay: "0.8s", anim: "animate-float-slow" },
];

export default function HeroSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 50%, #1a2744 100%)",
      }}
    >
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Floating construction icons */}
      {floatingIcons.map(({ Icon, top, left, right, size, delay, anim }, i) => (
        <div
          key={i}
          className={`absolute opacity-[0.06] text-[#0fa68c] ${anim}`}
          style={{ top, left, right, animationDelay: delay }}
        >
          <Icon size={size} strokeWidth={1} />
        </div>
      ))}

      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#0fa68c]/[0.06] rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#0fa68c]/[0.04] rounded-full blur-[100px]" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <div
          className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
        >
          <span className="inline-block mb-6 px-5 py-2 rounded-full border border-[#0fa68c]/40 bg-[#0fa68c]/10 text-[#0fa68c] text-xs font-semibold uppercase tracking-widest">
            Il Software #1 in Italia per Imprenditori Edili
          </span>
        </div>

        <h1
          className={`text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6 transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Smetti di Fatturare al Buio.
          <br />
          <span className="text-[#0fa68c]">Inizia a Guadagnare con i Numeri.</span>
        </h1>

        <p
          className={`text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Il primo software gestionale progettato da imprenditori edili, per imprenditori edili.
          Controlla margini, cassa e commesse in tempo reale — senza fogli Excel, senza sorprese.
        </p>

        <div
          className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <a
            href="#cta-finale"
            onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
            className="px-8 py-4 rounded-full bg-[#0fa68c] text-white font-bold text-lg hover:bg-[#0d9079] hover:scale-105 transition-all duration-200 animate-pulse-glow shadow-lg shadow-[#0fa68c]/30"
          >
            Richiedi Demo Gratuita
          </a>
          <a
            href="#moduli"
            onClick={(e) => { e.preventDefault(); document.querySelector("#moduli")?.scrollIntoView({ behavior: "smooth" }); }}
            className="px-8 py-4 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 hover:border-white/40 transition-all duration-200"
          >
            Scopri le Funzionalità
          </a>
        </div>

        {/* Dashboard mockup image */}
        <div
          className={`mt-14 max-w-4xl mx-auto transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <img
            src={heroMockup}
            alt="Dashboard Edilizia in Cloud - Gestione ordini, margini e cassa"
            className="w-full rounded-2xl shadow-2xl shadow-black/30 border border-white/10"
            style={{ transform: "perspective(1200px) rotateX(4deg)" }}
            loading="lazy"
          />
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
