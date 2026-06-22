/**
 * StepComputo — lo step "Computo metrico" del wizard Tetti (Task 17).
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
import { Loader2, CheckCircle2, Settings2, Info, Library, HardHat, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ImportaPrezzarioDialog } from "@/components/tetti/ImportaPrezzarioDialog";
import { ManodoperaLookup } from "@/components/tetti/ManodoperaLookup";
import { REGIONI_ITALIANE } from "@/lib/prezzario/tipi";
import { useSaveComputo, useEffectiveCompanyId } from "@/hooks/useTettiProgetto";
import { useListinoVociSearch } from "@/hooks/useTettiListino";
import type { TetComputoVoce } from "@/types/tetti";
import ComputoEditor from "@/components/tetti/ComputoEditor/ComputoEditor";

interface Props {
  progettoId: string;
  initialComputo: TetComputoVoce[];
  scontoPct: number;
  ivaPct: number;
}

const LISTINO_SETTINGS_HREF =
  "/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=tetti";

export default function StepComputo({ progettoId, initialComputo, scontoPct, ivaPct }: Props) {
  const companyId = useEffectiveCompanyId();
  const saveMut = useSaveComputo(progettoId);

  // Stato controllato del computo, seedato una volta dal server (vedi header).
  const [computo, setComputo] = useState<TetComputoVoce[]>(() => initialComputo);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [prezzarioOpen, setPrezzarioOpen] = useState(false);
  // Lookup tariffe manodopera (read-only, non invasivo): regione + pannello collassabile.
  const [manodoperaOpen, setManodoperaOpen] = useState(false);
  const [manodoperaRegione, setManodoperaRegione] = useState<string | undefined>(undefined);

  // Hint listino vuoto: una ricerca "" restituisce fino a 40 voci → se 0, vuoto.
  const listino = useListinoVociSearch("");
  const listinoVuoto = !listino.isLoading && (listino.data?.length ?? 0) === 0;

  const handleChange = (next: TetComputoVoce[]) => {
    setComputo(next);
    setDirty(true);
  };

  // Mappa lo stato locale nel payload del save (riusato da autosave e flush).
  const toPayload = (rows: TetComputoVoce[]) =>
    rows.map((v, i) => ({
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
      fonte: v.fonte,
      ordine: v.ordine ?? i,
    }));

  // Refs sempre allineati a stato/save: servono al flush su unmount per leggere
  // gli ultimi valori senza closure stantie (l'effect di unmount ha deps []).
  // La sync avviene in un effect (mai durante il render → react-hooks/refs).
  const computoRef = useRef(computo);
  const dirtyRef = useRef(dirty);
  const saveRef = useRef(saveMut);
  useEffect(() => {
    computoRef.current = computo;
    dirtyRef.current = dirty;
    saveRef.current = saveMut;
  });

  // ─── Autosave debounced (1.2s) ────────────────────────────────────────────
  // `computo` è nelle deps: a ogni modifica il timer si riarma e, allo scadere,
  // salva lo snapshot corrente (debounce naturale sulla "raffica" di edit).
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        try {
          await saveMut.mutateAsync(toPayload(computo));
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
  }, [computo, dirty]); // eslint-disable-line react-hooks/exhaustive-deps -- saveMut/toPayload stabili nel debounce; riarmo gestito a mano

  // ─── Flush su unmount ──────────────────────────────────────────────────────
  // Se l'utente naviga ad Economia/PDF entro il debounce (1.2s), le modifiche
  // pendenti non sono ancora salvate (quegli step leggono dalla cache). Alla
  // smontatura cancelliamo il timer e, se "dirty", salviamo subito lo snapshot
  // corrente (deps []: gira SOLO all'unmount → nessun loop/doppio-save).
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (dirtyRef.current) {
        void saveRef.current.mutateAsync(toPayload(computoRef.current)).catch(() => {
          /* best-effort: il componente è già smontato, niente toast/setState */
        });
      }
    };
  }, []);

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
              velocizzare, popola il listino tetti nelle impostazioni.
            </p>
            <Link
              to={LISTINO_SETTINGS_HREF}
              className="mt-1 inline-flex items-center gap-1 font-medium text-blue-700 underline-offset-2 hover:underline"
            >
              <Settings2 className="h-3 w-3" /> Vai al listino tetti
            </Link>
          </div>
        </div>
      )}

      {/* Importa da prezzario regionale → popola il listino aziendale */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setPrezzarioOpen(true)}
        >
          <Library className="h-3.5 w-3.5" /> Importa da prezzario regionale
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Aggiungi voci ufficiali al listino, poi richiamale qui nel computo.
        </span>
      </div>

      {/* Tariffe manodopera di riferimento (lookup read-only, non invasivo) */}
      <Collapsible
        open={manodoperaOpen}
        onOpenChange={setManodoperaOpen}
        className="rounded-xl border border-slate-200 bg-slate-50/40"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <HardHat className="h-3.5 w-3.5 text-muted-foreground" />
              Tariffe manodopera di riferimento
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${manodoperaOpen ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={manodoperaRegione}
              onValueChange={(v) => setManodoperaRegione(v)}
            >
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue placeholder="Seleziona una regione…" />
              </SelectTrigger>
              <SelectContent>
                {REGIONI_ITALIANE.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">
              Costo orario ufficiale per qualifica (solo consultazione).
            </span>
          </div>
          <ManodoperaLookup regione={manodoperaRegione} />
        </CollapsibleContent>
      </Collapsible>

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

      <ImportaPrezzarioDialog open={prezzarioOpen} onOpenChange={setPrezzarioOpen} />
    </div>
  );
}
