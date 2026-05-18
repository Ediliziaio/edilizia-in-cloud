import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import {
  CreditCard,
  FileText,
  Mail,
  Calendar,
  Briefcase,
  Landmark,
  Archive,
  Users,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

const integrations = [
  { icon: CreditCard, name: "Stripe" },
  { icon: FileText, name: "SDI / Fattura PA" },
  { icon: Mail, name: "Aruba PEC" },
  { icon: Calendar, name: "Google Calendar" },
  { icon: Briefcase, name: "Microsoft 365" },
  { icon: Landmark, name: "Banca PSD2" },
  { icon: Archive, name: "AdE Conservazione" },
  { icon: Users, name: "INPS / Cassa Edile" },
];

export default function IntegrationsTeaserSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-16 md:py-24 bg-white">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#111111] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Integrazioni <span className="text-[#F97415]">native</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Edilizia in Cloud parla con tutti gli strumenti che già usi. Zero doppio inserimento.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {integrations.map((it, i) => {
            const Icon = it.icon;
            return (
              <div
                key={it.name}
                className={`flex items-center gap-3 px-4 py-4 rounded-xl bg-[#f8f9fa] border border-gray-100 hover:border-[#F97415]/40 hover:bg-white transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: isVisible ? `${200 + i * 60}ms` : "0ms" }}
              >
                <div className="w-9 h-9 rounded-lg bg-white border border-gray-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#F97415]" />
                </div>
                <span className="text-sm font-semibold text-[#111111]">{it.name}</span>
              </div>
            );
          })}
        </div>

        <div
          className={`text-center mt-12 transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Link
            to="/integrazioni/"
            className="inline-flex items-center gap-2 text-[#F97415] hover:text-[#C94F06] font-bold text-base group"
          >
            Vedi tutte le integrazioni
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
