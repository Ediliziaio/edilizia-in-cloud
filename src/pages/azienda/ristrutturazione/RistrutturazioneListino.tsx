/**
 * RistrutturazioneListino — pagina dedicata al LISTINO lavorazioni dell'azienda
 * (capitoli + voci + import prezzari regionali + tariffe manodopera).
 *
 * Volutamente SEPARATA dall'editor del template PDF: il listino è dato di prezzo
 * usato nei computi, non fa parte della presentazione del preventivo.
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Hammer, Library } from "lucide-react";
import { ListinoPrezzariSection } from "@/components/ristrutturazione/ListinoPrezzariSection";

export default function RistrutturazioneListino() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50">
      {/* HERO HEADER — coerente con RistrutturazioneIndex */}
      <div
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}
      >
        <div
          className="absolute -top-1/3 -right-10 w-2/5 h-[160%] pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 60%)" }}
        />
        <div className="absolute right-8 top-6 opacity-10 select-none" aria-hidden>
          <Hammer className="h-28 w-28" strokeWidth={1.5} />
        </div>
        <div className="relative max-w-[1100px] mx-auto px-3 sm:px-8 py-4 sm:py-8">
          <button
            type="button"
            onClick={() => navigate("/azienda/marketing/preventivi")}
            className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium text-blue-100/90 hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Torna ai Preventivi
          </button>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Library className="h-6 w-6 sm:h-7 sm:w-7 text-orange-400 shrink-0" />
            <span className="truncate">Listino lavorazioni</span>
          </h1>
          <p className="hidden sm:block text-sm text-blue-100 mt-1">
            Capitoli, voci e prezzi del tuo listino — riutilizzati nei computi dei preventivi.
          </p>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-8 py-5 sm:py-6">
        <ListinoPrezzariSection />
      </div>
    </div>
  );
}
