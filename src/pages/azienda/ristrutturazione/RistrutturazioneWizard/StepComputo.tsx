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
import { Loader2, CheckCircle2, Settings2, Info, Sparkles, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComputoUploadModal } from "@/components/computo/ComputoUploadModal";
import { VoiceComputoDialog } from "@/components/computo/VoiceComputoDialog";
import { useSaveComputo, useEffectiveCompanyId } from "@/hooks/useRistrutturazioneProgetto";
import { useListinoVociSearch } from "@/hooks/useListinoLavorazioni";
import type { RstComputoVoce, RstUnitaMisura } from "@/types/ristrutturazione";
import type { ComputoVoceLocal } from "@/types/computo";
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
  const [importOpen, setImportOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Hint listino vuoto: una ricerca "" restituisce fino a 40 voci → se 0, vuoto.
  const listino = useListinoVociSearch("");
  const listinoVuoto = !listino.isLoading && (listino.data?.length ?? 0) === 0;

  const handleChange = (next: RstComputoVoce[]) => {
    setComputo(next);
    setDirty(true);
  };

  // Import AI: le voci estratte (già riviste nel modale) → RstComputoVoce, accodate.
  const handleImportVoci = (estratte: ComputoVoceLocal[]) => {
    if (estratte.length === 0) return;
    const base = computo.length;
    const nuove: RstComputoVoce[] = estratte.map((v, i) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `import-${base + i}-${v.id}`,
      progetto_id: progettoId,
      company_id: companyId ?? "",
      capitolo_nome: v.capitolo_nome?.trim() || "Generale",
      descrizione: (v.descrizione_breve || v.descrizione_estesa || "").trim(),
      unita_misura: coerceUnita(v.unita_misura),
      quantita: Number(v.quantita) || 0,
      prezzo_unitario: Number(v.prezzo_unitario_computo) || 0,
      costo_materiali: 0,
      costo_manodopera: 0,
      sconto_pct: 0,
      importo: 0,
      margine_eur: 0,
      margine_pct: 0,
      listino_voce_id: null,
      fonte: v.codice_prezzario?.trim() || null,
      ordine: base + i,
    }));
    handleChange([...computo, ...nuove]);
    toast.success(`${nuove.length} voci importate nel computo`, {
      description: "Verifica quantità e prezzi prima di salvare.",
    });
  };

  // Mappa lo stato locale nel payload del save (riusato da autosave e flush).
  const toPayload = (rows: RstComputoVoce[]) =>
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
      // Senza l'ambiente nel payload ogni salvataggio azzerava il campo «Ambiente».
      ambiente: v.ambiente ?? null,
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
          // Salvato solo se nel frattempo il computo non è cambiato: le voci
          // scritte durante la richiesta restano da salvare al giro dopo.
          if (computoRef.current === computo) setDirty(false);
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

      {/* Import computo da PDF con AI */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={!companyId}
          onClick={() => setImportOpen(true)}
        >
          <Sparkles className="h-3.5 w-3.5 text-orange-500" /> Importa computo da PDF (AI)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={!companyId}
          onClick={() => setVoiceOpen(true)}
        >
          <Mic className="h-3.5 w-3.5 text-violet-500" /> Descrivi a voce (AI)
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Carica un computo esistente: l'AI estrae le voci, le rivedi e le aggiungi.
        </span>
      </div>

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

      {/* Voce/descrizione → voci computo (stessa onConfirmVoci dell'import file) */}
      <VoiceComputoDialog
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        onConfirmVoci={handleImportVoci}
        tipoLavoro="ristrutturazione"
        confirmLabel="Aggiungi al computo"
      />

      <ComputoUploadModal
        open={importOpen}
        onOpenChange={setImportOpen}
        intent="computo"
        onConfirmVoci={handleImportVoci}
        confirmLabel="Aggiungi al computo"
      />
    </div>
  );
}

// Coercizione dell'unità di misura estratta dall'AI (testo libero) → enum RstUnitaMisura.
function coerceUnita(u: string | null | undefined): RstUnitaMisura {
  const s = (u ?? "").trim().toLowerCase();
  if (["mq", "m2", "m²", "m^2", "metri quadri", "metri quadrati"].includes(s)) return "mq";
  if (["ml", "m", "mt", "m.l.", "metri", "metro", "metri lineari"].includes(s)) return "ml";
  if (["kg", "kg.", "chilo", "chili", "chilogrammi"].includes(s)) return "kg";
  if (["h", "ora", "ore", "h.", "ora/uomo"].includes(s)) return "h";
  if (["corpo", "a corpo", "acorpo", "a-corpo"].includes(s)) return "a corpo";
  return "cad";
}
