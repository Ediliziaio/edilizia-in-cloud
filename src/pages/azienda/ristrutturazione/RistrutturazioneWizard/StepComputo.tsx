/**
 * StepComputo — lo step "Computo metrico" del wizard Ristrutturazione (Task 17).
 *
 * Integra il `ComputoEditor` (Fase 3): carica le voci del progetto come stato
 * controllato iniziale e le salva in modo DEBOUNCED via `useSaveComputo`
 * (replace bulk con ricalcolo importi lato hook). Mostra un indicatore di
 * salvataggio e un hint se il listino lavorazioni è vuoto (link alle Impostazioni).
 *
 * Seeding dello stato (no setState in effect): il componente viene montato dal
 * wizard con `key={progettoId}`, quindi `useState(() => initialComputo)` cattura
 * le voci iniziali una sola volta. L'autosave invalida la query ma NON rimonta
 * (la key è l'id stabile del progetto), così le modifiche locali non si perdono.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Settings2, Info } from "lucide-react";
import { useSaveComputo, useEffectiveCompanyId } from "@/hooks/useRistrutturazioneProgetto";
import { useListinoVociSearch } from "@/hooks/useListinoLavorazioni";
import type { RstComputoVoce } from "@/types/ristrutturazione";
import ComputoEditor from "@/components/ristrutturazione/ComputoEditor/ComputoEditor";

interface Props {
  progettoId: string;
  initialComputo: RstComputoVoce[];
  scontoPct: number;
  ivaPct: number;
}

const LISTINO_SETTINGS_HREF =
  "/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=ristrutturazione";

export default function StepComputo({ progettoId, initialComputo, scontoPct, ivaPct }: Props) {
  const companyId = useEffectiveCompanyId();
  const saveMut = useSaveComputo(progettoId);

  // Stato controllato del computo, seedato una volta dal server (vedi header).
  const [computo, setComputo] = useState<RstComputoVoce[]>(() => initialComputo);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  // Hint listino vuoto: una ricerca "" restituisce fino a 40 voci → se 0, vuoto.
  const listino = useListinoVociSearch("");
  const listinoVuoto = !listino.isLoading && (listino.data?.length ?? 0) === 0;

  const handleChange = (next: RstComputoVoce[]) => {
    setComputo(next);
    setDirty(true);
  };

  // ─── Autosave debounced (1.2s) ────────────────────────────────────────────
  // `computo` è nelle deps: a ogni modifica il timer si riarma e, allo scadere,
  // salva lo snapshot corrente (debounce naturale sulla "raffica" di edit).
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          await saveMut.mutateAsync(
            computo.map((v, i) => ({
              capitolo_nome: v.capitolo_nome,
              descrizione: v.descrizione,
              unita_misura: v.unita_misura,
              quantita: v.quantita,
              prezzo_unitario: v.prezzo_unitario,
              costo_materiali: v.costo_materiali,
              costo_manodopera: v.costo_manodopera,
              sconto_pct: v.sconto_pct,
              margine_eur: v.margine_eur,
              margine_pct: v.margine_pct,
              listino_voce_id: v.listino_voce_id,
              ordine: v.ordine ?? i,
            })),
          );
          setDirty(false);
          setSavedOnce(true);
        } catch (e) {
          toast.error("Salvataggio computo fallito", {
            description: e instanceof Error ? e.message : "Errore sconosciuto",
          });
        }
      })();
    }, 1200);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [computo, dirty]); // eslint-disable-line react-hooks/exhaustive-deps -- saveMut stabile (react-query)

  const statusLabel = useMemo(() => {
    if (saveMut.isPending) return { icon: "spin" as const, text: "Salvataggio…", cls: "text-muted-foreground" };
    if (dirty) return { icon: "dot" as const, text: "Modifiche non salvate", cls: "text-amber-600" };
    if (savedOnce) return { icon: "ok" as const, text: "Computo salvato", cls: "text-emerald-600" };
    return null;
  }, [saveMut.isPending, dirty, savedOnce]);

  return (
    <div className="space-y-3">
      {/* Header step + stato salvataggio */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Computo metrico</h2>
          <p className="text-[11px] text-muted-foreground">
            Aggiungi capitoli e voci dai listini. I totali si aggiornano in tempo reale e si salvano da soli.
          </p>
        </div>
        {statusLabel && (
          <span className={`flex items-center gap-1 text-[11px] ${statusLabel.cls}`}>
            {statusLabel.icon === "spin" && <Loader2 className="h-3 w-3 animate-spin" />}
            {statusLabel.icon === "ok" && <CheckCircle2 className="h-3 w-3" />}
            {statusLabel.icon === "dot" && <span aria-hidden>●</span>}
            {statusLabel.text}
          </span>
        )}
      </div>

      {/* Hint listino vuoto */}
      {listinoVuoto && (
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="flex-1 text-[11px] text-blue-900">
            <p className="font-medium">Il tuo listino lavorazioni è ancora vuoto.</p>
            <p className="text-blue-800/80">
              Puoi comunque comporre il computo con voci libere o prodotti/manodopera. Per
              velocizzare, popola il listino ristrutturazione nelle impostazioni.
            </p>
            <Link
              to={LISTINO_SETTINGS_HREF}
              className="mt-1 inline-flex items-center gap-1 font-medium text-blue-700 underline-offset-2 hover:underline"
            >
              <Settings2 className="h-3 w-3" /> Vai al listino ristrutturazione
            </Link>
          </div>
        </div>
      )}

      {/* Editor */}
      {companyId ? (
        <ComputoEditor
          value={computo}
          onChange={handleChange}
          progettoId={progettoId}
          companyId={companyId}
          scontoPct={scontoPct}
          ivaPct={ivaPct}
        />
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento azienda…
        </div>
      )}
    </div>
  );
}
