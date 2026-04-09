/**
 * Checklist Sicurezza giornaliera — obbligo normativo prima di iniziare i lavori.
 * Verifica DPI, condizioni cantiere, segnaletica, presidi antincendio.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ShieldCheck, ChevronLeft, Loader2, CheckCircle2 } from "lucide-react";
import {
  useChecklistSicurezza,
  CHECKLIST_ITEMS,
} from "@/hooks/campo/useChecklistSicurezza";
import CampoChecklistItem from "@/components/campo/CampoChecklistItem";
import { isChecklistCompleta } from "@/lib/campo/checklist-items";

export default function CampoChecklistSicurezza(): JSX.Element {
  const navigate = useNavigate();
  const {
    loading,
    record,
    risposte,
    note,
    saving,
    error,
    toggleItem,
    setNote,
    conferma,
  } = useChecklistSicurezza("mattina");

  const completaLocale = useMemo(() => isChecklistCompleta(risposte), [risposte]);

  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: it });
  const capitalizedDate = today.charAt(0).toUpperCase() + today.slice(1);

  const handleConferma = async (): Promise<void> => {
    // Prova a ottenere GPS (non bloccante)
    let gps: { lat: number; lng: number; accuracy: number } | null = null;
    if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            enableHighAccuracy: true,
          });
        });
        gps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
      } catch {
        // GPS non disponibile: salva senza coordinate
      }
    }

    const ok = await conferma(null, gps);
    if (ok) {
      toast.success("Checklist confermata — buon lavoro!", { duration: 3000 });
      setTimeout(() => navigate("/campo"), 800);
    } else {
      toast.error(error ?? "Impossibile confermare la checklist");
    }
  };

  // ─── Skeleton loader ──
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-8 bg-slate-800 rounded animate-pulse w-3/4" />
        <div className="h-4 bg-slate-800 rounded animate-pulse w-1/2" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  // ─── Già compilata oggi ──
  if (record?.completata) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/campo")}
            aria-label="Torna alla home"
            className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">
              Checklist Sicurezza
            </h1>
            <p className="text-xs text-slate-500">{capitalizedDate}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-emerald-950/40 border-2 border-emerald-500 p-6 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-1">Già completata</h2>
          <p className="text-sm text-slate-300">
            Hai già compilato la checklist di oggi. Buon lavoro!
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            Riepilogo
          </p>
          {CHECKLIST_ITEMS.map((item) => {
            const r = risposte.find((x) => x.itemId === item.id);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl bg-slate-900 border border-slate-800 p-3"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-none ${r?.checked ? "bg-emerald-500" : "bg-slate-800"}`}
                >
                  <CheckCircle2
                    className={`w-5 h-5 ${r?.checked ? "text-slate-950" : "text-slate-600"}`}
                  />
                </div>
                <span className="text-sm text-slate-300 flex-1">{item.label}</span>
              </div>
            );
          })}
        </div>

        {note && (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
            <p className="text-xs font-bold text-slate-500 uppercase mb-1">
              Note
            </p>
            <p className="text-sm text-slate-300">{note}</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Form compilazione ──
  return (
    <div className="p-4 space-y-4 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/campo")}
          aria-label="Torna alla home"
          className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            Checklist Sicurezza
          </h1>
          <p className="text-xs text-slate-500">{capitalizedDate}</p>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-3">
        <p className="text-xs text-amber-200 leading-relaxed">
          Controlla ogni elemento prima di iniziare i lavori. Gli elementi
          segnati come <strong>Obbligatorio</strong> sono necessari per
          confermare la checklist.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-950/60 border border-red-500 p-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => {
          const r = risposte.find((x) => x.itemId === item.id);
          return (
            <CampoChecklistItem
              key={item.id}
              item={item}
              checked={r?.checked ?? false}
              fotoUrl={r?.fotoUrl}
              onToggle={() => toggleItem(item.id)}
            />
          );
        })}
      </div>

      {/* Note */}
      <div className="space-y-2">
        <label
          htmlFor="checklist-note"
          className="text-xs font-bold text-slate-500 uppercase tracking-wide block"
        >
          Note aggiuntive (opzionale)
        </label>
        <textarea
          id="checklist-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anomalie o osservazioni…"
          rows={3}
          className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none resize-none"
        />
      </div>

      {/* CTA fissa in fondo */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4 bg-slate-950/95 backdrop-blur border-t border-slate-800"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={handleConferma}
          disabled={saving || !completaLocale}
          className={`
            w-full h-14 rounded-xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${completaLocale && !saving
              ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }
          `}
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvataggio…
            </>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              CONFERMA CHECKLIST E TIMBRA INGRESSO
            </>
          )}
        </button>
        {!completaLocale && (
          <p className="text-[11px] text-center text-slate-500 mt-2">
            Spunta tutti gli elementi obbligatori per continuare
          </p>
        )}
      </div>
    </div>
  );
}
