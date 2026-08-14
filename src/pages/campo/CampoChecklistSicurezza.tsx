/**
 * Checklist Sicurezza giornaliera — obbligo normativo prima di iniziare i lavori.
 * Verifica DPI, condizioni cantiere, segnaletica, presidi antincendio.
 */
import { useMemo, useState } from "react";
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
  // Turno di default dall'orologio: chi attacca il pomeriggio firmava per
  // forza la checklist "mattina" (la chiave DB è per turno).
  const [turno, setTurno] = useState<"mattina" | "pomeriggio">(
    new Date().getHours() < 13 ? "mattina" : "pomeriggio",
  );
  // Copre anche l'attesa GPS (fino a 5s) PRIMA che il salvataggio parta:
  // `saving` del hook si accende solo all'upsert, e in quei secondi il
  // bottone restava attivo e muto — tap ripetuti garantiti in cantiere.
  const [confermando, setConfermando] = useState(false);
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
  } = useChecklistSicurezza(turno);

  const completaLocale = useMemo(() => isChecklistCompleta(risposte), [risposte]);

  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: it });
  const capitalizedDate = today.charAt(0).toUpperCase() + today.slice(1);

  const handleConferma = async (): Promise<void> => {
    if (confermando) return;
    setConfermando(true);
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
    setConfermando(false);
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
      <div className="space-y-4 pb-28">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/campo")}
            aria-label="Torna alla home"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted transition-transform active:scale-95"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold leading-tight text-foreground">
              Checklist Sicurezza
            </h1>
            <p className="text-xs text-muted-foreground">Caricamento controllo giornaliero...</p>
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
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
            className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">
              Checklist Sicurezza
            </h1>
            <p className="text-xs text-muted-foreground">{capitalizedDate}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-500 p-6 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-foreground mb-1">Già completata</h2>
          <p className="text-sm text-foreground">
            Hai già compilato la checklist di oggi. Buon lavoro!
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Riepilogo
          </p>
          {CHECKLIST_ITEMS.map((item) => {
            const r = risposte.find((x) => x.itemId === item.id);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl bg-muted border border-border p-3"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-none ${r?.checked ? "bg-emerald-500" : "bg-muted"}`}
                >
                  <CheckCircle2
                    className={`w-5 h-5 ${r?.checked ? "text-foreground" : "text-muted-foreground"}`}
                  />
                </div>
                <span className="text-sm text-foreground flex-1">{item.label}</span>
              </div>
            );
          })}
        </div>

        {note && (
          <div className="rounded-xl bg-muted border border-border p-3">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">
              Note
            </p>
            <p className="text-sm text-foreground">{note}</p>
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
          className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground leading-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Checklist Sicurezza
          </h1>
          <p className="text-xs text-muted-foreground">{capitalizedDate}</p>
        </div>
        {/* Selettore turno: la checklist è una per turno */}
        <div className="flex shrink-0 rounded-xl bg-muted p-0.5">
          {(["mattina", "pomeriggio"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTurno(t)}
              className={
                turno === t
                  ? "rounded-lg bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm"
                  : "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground"
              }
            >
              {t === "mattina" ? "Mattina" : "Pomeriggio"}
            </button>
          ))}
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-xl bg-primary/10 border border-primary/40 p-3">
        <p className="text-xs text-primary leading-relaxed">
          Controlla ogni elemento prima di iniziare i lavori. Gli elementi
          segnati come <strong>Obbligatorio</strong> sono necessari per
          confermare la checklist.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-500 p-3 text-sm text-red-600"
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
          className="text-xs font-bold text-muted-foreground uppercase tracking-wide block"
        >
          Note aggiuntive (opzionale)
        </label>
        <textarea
          id="checklist-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anomalie o osservazioni…"
          rows={3}
          className="w-full rounded-xl bg-muted border border-border p-3 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none resize-none"
        />
      </div>

      {/* CTA fissa in fondo — la bottom-nav qui è nascosta (CampoLayout),
          la barra sta a filo schermo con il solo margine della safe-area. */}
      <div
        className="fixed left-0 right-0 bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={handleConferma}
          disabled={confermando || saving || !completaLocale}
          className={`
            w-full h-14 rounded-xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${completaLocale && !saving && !confermando
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
              : "bg-muted text-muted-foreground cursor-not-allowed"
            }
          `}
        >
          {confermando || saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvataggio…
            </>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              CONFERMA CHECKLIST
            </>
          )}
        </button>
        {!completaLocale && (
          <p className="text-[11px] text-center text-muted-foreground mt-2">
            Spunta tutti gli elementi obbligatori per continuare
          </p>
        )}
      </div>
    </div>
  );
}
