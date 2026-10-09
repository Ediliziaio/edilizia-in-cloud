/**
 * Form rapportino vocale pre-compilato dall'AI.
 * L'operaio può correggere qualsiasi campo prima di confermare.
 *
 * Colori del tema dell'app (chiaro): era disegnato per uno sfondo scuro (testo bianco, slate-300, amber-200)
 * ma la pagina è chiara, e titoli e controlli sparivano sul bianco.
 */
import { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  PackageCheck,
  Send,
  ShieldAlert,
  Sparkles,
  Plus,
  X,
} from "lucide-react";
import type {
  RapportinoVocaleDraft,
  MaterialeUsato,
} from "@/hooks/campo/useRapportinoVocale";
import type { JSX } from "react";
import { validWorkDay } from "@/lib/campo/workDay";

interface CampoRapportinoFormProps {
  draft: RapportinoVocaleDraft;
  transcribing: boolean;
  onChange: (draft: RapportinoVocaleDraft) => void;
  onConfirm: () => void;
  saving?: boolean;
  orderLinked?: boolean;
}

export default function CampoRapportinoForm({
  draft,
  transcribing,
  onChange,
  onConfirm,
  saving,
  orderLinked,
}: CampoRapportinoFormProps): JSX.Element {
  const [showTranscript, setShowTranscript] = useState(false);
  const [local, setLocal] = useState<RapportinoVocaleDraft>(draft);
  const workDay = draft.data_lavoro ?? draft.dati_estratti.data_lavoro;

  useEffect(() => {
    setLocal(draft);
  }, [draft]);

  const update = (patch: Partial<typeof local.dati_estratti>): void => {
    const next: RapportinoVocaleDraft = {
      ...local,
      dati_estratti: { ...local.dati_estratti, ...patch },
    };
    setLocal(next);
    onChange(next);
  };

  const updateMateriale = (index: number, patch: Partial<MaterialeUsato>): void => {
    const materiali = [...(local.dati_estratti.materiali ?? [])];
    materiali[index] = { ...materiali[index], ...patch };
    update({ materiali });
  };

  const addMateriale = (): void => {
    const materiali = [
      ...(local.dati_estratti.materiali ?? []),
      { nome: "", quantita: 1, unita: "pz" },
    ];
    update({ materiali });
  };

  const removeMateriale = (index: number): void => {
    const materiali = (local.dati_estratti.materiali ?? []).filter(
      (_, i) => i !== index,
    );
    update({ materiali });
  };

  // ─── Skeleton durante trascrizione ──
  if (transcribing) {
    return (
      <div className="space-y-4 py-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
          <p className="text-foreground font-medium">Trascrizione in corso…</p>
          <p className="text-xs text-muted-foreground">
            L&apos;AI sta analizzando la tua registrazione
          </p>
        </div>
        <div className="space-y-2">
          <div className="h-12 bg-muted rounded-xl animate-pulse" />
          <div className="h-12 bg-muted rounded-xl animate-pulse" />
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const materiali = local.dati_estratti.materiali ?? [];
  const materialiValidi = materiali.filter((m) => m.nome?.trim()).length;
  const oreValide = typeof local.dati_estratti.ore_lavorate === "number" && local.dati_estratti.ore_lavorate > 0;
  const haDescrizione = Boolean(local.dati_estratti.lavorazione?.trim() || local.dati_estratti.note?.trim() || local.trascrizione?.trim());
  const safetyAlert = local.dati_estratti.sicurezza_alert;
  const incidenti = local.dati_estratti.incidenti_segnalati ?? [];
  const canConfirm = oreValide || haDescrizione || materialiValidi > 0;
  const qualityLabel: Record<string, string> = {
    ottima: "Qualità ottima",
    buona: "Qualità buona",
    da_rivedere: "Da rivedere",
  };

  return (
    <div className="space-y-4 pb-32">
      <p className="rounded-xl border p-3 text-sm">
        Giornata di lavoro: <strong>{workDay && validWorkDay(workDay) ? workDay.split("-").reverse().join("/") : "da verificare"}</strong>.
        {" "}Invia entro il giorno successivo, ore 23:59 (ora italiana). Il vocale non sostituisce la timbratura di uscita.
      </p>
      {/* Regia AI */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-400 p-2 text-slate-950">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">AI ha preparato il rapportino</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/80">
              Controlla i campi. Al salvataggio aggiorna rapportini, diario commessa e materiali.
              {!orderLinked && " Se hai un solo cantiere attivo, lo collega automaticamente."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <AiCheck ok={oreValide} icon={Clock3} label={oreValide ? `${local.dati_estratti.ore_lavorate}h` : "Ore mancanti"} />
              <AiCheck ok={haDescrizione} icon={CheckCircle2} label={haDescrizione ? "Lavoro letto" : "Descrizione"} />
              <AiCheck ok={materialiValidi > 0} icon={PackageCheck} label={materialiValidi > 0 ? `${materialiValidi} materiali` : "Materiali"} />
              <AiCheck ok={orderLinked} icon={CheckCircle2} label={orderLinked ? "Commessa ok" : "Auto-link"} />
            </div>
          </div>
        </div>
      </div>

      {safetyAlert?.rilevato && (
        <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-800">Segnalazione sicurezza rilevata</p>
              <p className="mt-1 text-xs text-red-700">
                {safetyAlert.descrizione || "L'AI ha rilevato un possibile tema sicurezza nel vocale."}
              </p>
            </div>
          </div>
        </div>
      )}

      {incidenti.length > 0 && (
        <div className="rounded-2xl border border-orange-500/35 bg-orange-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <div>
              <p className="text-sm font-bold text-orange-800">Criticità nel rapportino</p>
              <p className="mt-1 text-xs text-orange-700">{incidenti.slice(0, 2).join(" · ")}</p>
            </div>
          </div>
        </div>
      )}

      {local.dati_estratti.qualita_auto_valutazione && (
        <div className="rounded-xl border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Valutazione AI: <span className="font-semibold text-foreground">{qualityLabel[local.dati_estratti.qualita_auto_valutazione]}</span>
        </div>
      )}

      {/* Ore lavorate */}
      <div className="space-y-1.5">
        <label
          htmlFor="ore"
          className="text-xs font-bold text-muted-foreground uppercase tracking-wide"
        >
          Ore lavorate
        </label>
        <input
          id="ore"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          max="24"
          value={local.dati_estratti.ore_lavorate ?? ""}
          onChange={(e) =>
            update({
              ore_lavorate: e.target.value ? parseFloat(e.target.value) : undefined,
            })
          }
          placeholder="Es: 8"
          className="w-full h-12 rounded-xl bg-background border border-input px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        />
      </div>

      {/* Lavorazione */}
      <div className="space-y-1.5">
        <label
          htmlFor="lavorazione"
          className="text-xs font-bold text-muted-foreground uppercase tracking-wide"
        >
          Tipo lavorazione
        </label>
        <input
          id="lavorazione"
          type="text"
          value={local.dati_estratti.lavorazione ?? ""}
          onChange={(e) => update({ lavorazione: e.target.value })}
          placeholder="Es: posa piastrelle piano terra"
          className="w-full h-12 rounded-xl bg-background border border-input px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        />
      </div>

      {/* Materiali */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Materiali utilizzati
          </label>
          <button
            type="button"
            onClick={addMateriale}
            className="text-xs font-bold text-amber-700 flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus className="w-3.5 h-3.5" />
            Aggiungi
          </button>
        </div>

        {materiali.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-2">Nessun materiale</p>
        )}

        {materiali.map((mat, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              value={mat.nome}
              onChange={(e) => updateMateriale(idx, { nome: e.target.value })}
              placeholder="Nome"
              className="min-w-0 flex-1 h-11 rounded-lg bg-background border border-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={mat.quantita}
              onChange={(e) =>
                updateMateriale(idx, {
                  quantita: parseFloat(e.target.value) || 0,
                })
              }
              className="w-16 h-11 rounded-lg bg-background border border-input px-2 text-sm text-foreground text-center focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
            />
            <input
              type="text"
              value={mat.unita}
              onChange={(e) => updateMateriale(idx, { unita: e.target.value })}
              placeholder="pz"
              className="w-14 h-11 rounded-lg bg-background border border-input px-2 text-sm text-foreground placeholder:text-muted-foreground text-center focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
            />
            <button
              type="button"
              onClick={() => removeMateriale(idx)}
              aria-label="Rimuovi materiale"
              className="w-11 h-11 rounded-lg bg-muted border text-muted-foreground flex items-center justify-center active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <label
          htmlFor="note"
          className="text-xs font-bold text-muted-foreground uppercase tracking-wide"
        >
          Note aggiuntive
        </label>
        <textarea
          id="note"
          value={local.dati_estratti.note ?? ""}
          onChange={(e) => update({ note: e.target.value })}
          rows={3}
          placeholder="Osservazioni, problemi, anomalie…"
          className="w-full rounded-xl bg-background border border-input p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 resize-none"
        />
      </div>

      {/* Trascrizione originale (collapsible) */}
      {local.trascrizione && (
        <div className="rounded-xl bg-muted/60 border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="w-full p-3 flex items-center justify-between text-left active:bg-muted transition-colors"
          >
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Trascrizione originale
            </span>
            {showTranscript ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {showTranscript && (
            <div className="px-3 pb-3 text-sm text-foreground/80 italic leading-relaxed">
              &ldquo;{local.trascrizione}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* CTA fissa */}
      <div
        className="fixed left-0 right-0 bottom-[calc(4.35rem+env(safe-area-inset-bottom))] border-t border-border bg-background/95 p-4 backdrop-blur md:bottom-0"
        style={{ paddingBottom: "1rem" }}
      >
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving || !canConfirm}
          className={`
            w-full h-14 rounded-xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${saving || !canConfirm
              ? "bg-amber-500/50 text-amber-950 cursor-wait"
              : "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30"
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
              <Send className="w-5 h-5" />
              {canConfirm ? "CONFERMA RAPPORTINO" : "COMPLETA ALMENO UN CAMPO"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function AiCheck({
  ok,
  icon: Icon,
  label,
}: {
  ok: boolean;
  icon: typeof Clock3;
  label: string;
}): JSX.Element {
  return (
    <div className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-semibold ${
      ok ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"
    }`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
    </div>
  );
}
