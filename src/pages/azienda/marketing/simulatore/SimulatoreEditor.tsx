/**
 * SimulatoreEditor — editor di una singola simulazione contratto.
 *
 * Shell (Tappa A): carica la riga via `useSimulazione(id)`, tiene uno stato
 * locale `doc` (voci/fasi/scenari) inizializzato dalla riga, ricalcola il
 * risultato ad ogni modifica con `calcolaSimulazione` (useMemo) e fa
 * **autosave debounced (500ms)** salvando voci/fasi/scenari + il riepilogo
 * denormalizzato (costo/ricavo/margine/IVA/prezzo/rata).
 *
 * Header con nome editabile inline; i bottoni "Esporta"/"Trasforma" sono
 * disabilitati (arrivano in Tappa B). La griglia voci (`SimVociGrid`) è un
 * segnaposto: viene implementata nel Task 8.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileDown, Wand2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SimKpiBar } from "@/components/marketing/simulatore/SimKpiBar";
import { SimVociGrid } from "@/components/marketing/simulatore/SimVociGrid";
import { SimCronoprogramma } from "@/components/marketing/simulatore/SimCronoprogramma";
import { AggiungiVociDialog } from "@/components/marketing/simulatore/AggiungiVociDialog";
import { useSimulazione, useSimulazioniMutations } from "@/hooks/useSimulazioni";
import { calcolaSimulazione } from "@/lib/simulatore/calcolaSimulazione";
import { calcolaFasi } from "@/lib/simulatore/calcoli";
import { DEFAULT_SCENARI } from "@/lib/simulatore/tipi";
import type { SimulazioneDoc, VoceSim, FaseSim, ScenariConfig } from "@/lib/simulatore/tipi";

const AUTOSAVE_DELAY = 500;

export default function SimulatoreEditor() {
  const { id = null } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: row, isLoading, isError } = useSimulazione(id);
  const { update } = useSimulazioniMutations();

  // Stato locale documento + nome. Inizializzati una sola volta dalla riga.
  const [doc, setDoc] = useState<SimulazioneDoc | null>(null);
  const [nome, setNome] = useState("");
  const hydrated = useRef(false);
  const [saved, setSaved] = useState(false);
  const [listinoOpen, setListinoOpen] = useState(false);

  useEffect(() => {
    if (!row || hydrated.current) return;
    setDoc({
      voci: (Array.isArray(row.voci) ? (row.voci as VoceSim[]) : []),
      fasi: (Array.isArray(row.fasi) ? (row.fasi as FaseSim[]) : []),
      scenari:
        row.scenari && typeof row.scenari === "object"
          ? (row.scenari as ScenariConfig)
          : DEFAULT_SCENARI,
    });
    setNome(row.nome);
    hydrated.current = true;
  }, [row]);

  const risultato = useMemo(
    () => (doc ? calcolaSimulazione(doc) : null),
    [doc],
  );

  const risultatoFasi = useMemo(
    () => (doc ? calcolaFasi(doc.fasi, doc.voci) : { perFase: [], durata_settimane: 0 }),
    [doc],
  );

  // ── Autosave debounced ─────────────────────────────────────────────────────
  // Salta il primo render dopo l'idratazione: non vogliamo riscrivere subito i
  // dati appena caricati. Si attiva solo su modifiche reali di doc/nome.
  const dirty = useRef(false);
  useEffect(() => {
    if (!id || !doc || !risultato) return;
    if (!hydrated.current) return;
    if (!dirty.current) {
      // primo passaggio post-idratazione → marca pronto, non salvare
      dirty.current = true;
      return;
    }
    setSaved(false);
    const t = setTimeout(() => {
      update.mutate(
        {
          id,
          patch: {
            nome,
            voci: doc.voci,
            fasi: doc.fasi,
            scenari: doc.scenari,
            costo_totale: risultato.costo_totale,
            ricavo_imponibile: risultato.ricavo_imponibile,
            margine_valore: risultato.margine_valore,
            margine_pct: risultato.margine_pct,
            iva_totale: risultato.iva_totale,
            prezzo_cliente: risultato.prezzo_cliente,
            rata_mensile: risultato.rata_mensile,
          },
        },
        { onSuccess: () => setSaved(true) },
      );
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(t);
    // `update` è stabile (mutation); volutamente fuori dalle deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, doc, nome, risultato]);

  // ── Stati di caricamento / errore / vuoto ──────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || (!row && !isLoading)) {
    return (
      <div className="p-6">
        <Card>
          <EmptyState
            tone="error"
            title="Simulazione non trovata"
            description="La simulazione richiesta non esiste o non è più disponibile."
            action={{
              label: "Torna al simulatore",
              onClick: () => navigate("/azienda/marketing/simulatore"),
              variant: "outline",
            }}
          />
        </Card>
      </div>
    );
  }

  if (!doc || !risultato) {
    // riga caricata ma idratazione non ancora completata (transitorio)
    return (
      <div className="p-6">
        <Skeleton className="h-9 w-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate("/azienda/marketing/simulatore")}
            aria-label="Torna alla lista"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome simulazione"
            className="h-10 max-w-md border-transparent bg-transparent px-2 text-xl font-bold shadow-none hover:border-input focus-visible:border-input"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-[110px] justify-end">
            {update.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Salvataggio…
              </>
            ) : saved ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Salvato
              </>
            ) : null}
          </span>
          <Button variant="outline" disabled className="gap-2" title="Disponibile a breve">
            <FileDown className="h-4 w-4" />
            Esporta
          </Button>
          <Button disabled className="gap-2" title="Disponibile a breve">
            <Wand2 className="h-4 w-4" />
            Trasforma
          </Button>
        </div>
      </div>

      {/* KPI */}
      <SimKpiBar risultato={risultato} ivaRate={doc.scenari.iva_rate_singola} />

      {/* Voci — griglia editabile (listino, prezzari, righe libere) */}
      <SimVociGrid
        voci={doc.voci}
        fasi={doc.fasi}
        onChange={(voci) => setDoc((d) => (d ? { ...d, voci } : d))}
        onApriListino={() => setListinoOpen(true)}
      />

      {/* Cronoprogramma — fasi del lavoro + barre proporzionali */}
      <SimCronoprogramma
        fasi={doc.fasi}
        voci={doc.voci}
        onChangeFasi={(fasi) => setDoc((d) => (d ? { ...d, fasi } : d))}
        risultatoFasi={risultatoFasi}
      />

      {/* Dialog "Da listino" — append delle voci scelte in coda */}
      <AggiungiVociDialog
        open={listinoOpen}
        onOpenChange={setListinoOpen}
        onAdd={(nuove) =>
          setDoc((d) => (d ? { ...d, voci: [...d.voci, ...nuove] } : d))
        }
      />
    </div>
  );
}
