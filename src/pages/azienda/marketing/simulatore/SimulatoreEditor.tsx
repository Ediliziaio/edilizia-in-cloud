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
import { ArrowLeft, FileDown, Wand2, Loader2, Check, FileSpreadsheet, FileText, FileStack } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SimKpiBar } from "@/components/marketing/simulatore/SimKpiBar";
import { SimVociGrid } from "@/components/marketing/simulatore/SimVociGrid";
import { SimCronoprogramma } from "@/components/marketing/simulatore/SimCronoprogramma";
import { SimScenariPanel } from "@/components/marketing/simulatore/SimScenariPanel";
import { AggiungiVociDialog } from "@/components/marketing/simulatore/AggiungiVociDialog";
import { TrasformaDialog } from "@/components/marketing/simulatore/TrasformaDialog";
import { FvContactPicker, type FvContactLite } from "@/components/fotovoltaico/FvContactPicker";
import { useSimulazione, useSimulazioniMutations, useContattiLite } from "@/hooks/useSimulazioni";
import { calcolaSimulazione } from "@/lib/simulatore/calcolaSimulazione";
import { calcolaFasi } from "@/lib/simulatore/calcoli";
import { exportSimulazioneXlsx } from "@/lib/simulatore/exportSimulazione";
import { DEFAULT_SCENARI } from "@/lib/simulatore/tipi";
import type { SimulazioneDoc, VoceSim, FaseSim, ScenariConfig } from "@/lib/simulatore/tipi";

const AUTOSAVE_DELAY = 500;

export default function SimulatoreEditor() {
  const { id = null } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: row, isLoading, isError } = useSimulazione(id);
  const { update, duplicate } = useSimulazioniMutations();

  // Stato locale documento + nome + contatto. Inizializzati dalla riga.
  const [doc, setDoc] = useState<SimulazioneDoc | null>(null);
  const [nome, setNome] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const hydrated = useRef(false);
  const [saved, setSaved] = useState(false);
  const [listinoOpen, setListinoOpen] = useState(false);
  const [trasformaOpen, setTrasformaOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Rata mensile dal pannello finanziamento (null se nessun finanziamento valido).
  const [rataMensile, setRataMensile] = useState<number | null>(null);

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
    setContactId(row.contact_id ?? null);
    hydrated.current = true;
  }, [row]);

  // Nome del contatto collegato (testata). Resolve leggero su marketing_contacts.
  const { data: contattiMap = {} } = useContattiLite([contactId]);
  const contactNome = contactId ? contattiMap[contactId] : undefined;

  const risultato = useMemo(
    () => (doc ? calcolaSimulazione(doc) : null),
    [doc],
  );

  const risultatoFasi = useMemo(
    () => (doc ? calcolaFasi(doc.fasi, doc.voci) : { perFase: [], durata_settimane: 0 }),
    [doc],
  );

  // Risultato + rata mensile live dal pannello finanziamento. È questa la
  // versione mostrata in KpiBar e persistita (così `rata_mensile` finisce a DB).
  const risultatoConRata = useMemo(
    () => (risultato ? { ...risultato, rata_mensile: rataMensile } : null),
    [risultato, rataMensile],
  );

  // ── Export (Excel / PDF) ────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!doc || !risultatoConRata) return;
    setExporting(true);
    try {
      await exportSimulazioneXlsx(doc, risultatoConRata, nome);
      toast.success("Excel scaricato");
    } catch (err) {
      console.error("Errore export Excel:", err);
      toast.error("Errore nella generazione del file Excel");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!doc || !risultatoConRata) return;
    setExporting(true);
    try {
      // Lazy import: la lib @react-pdf è caricata solo al click su "Esporta PDF".
      const { scaricaSimulazionePDF } = await import(
        "@/components/marketing/simulatore/SimulazionePDF"
      );
      await scaricaSimulazionePDF(doc, risultatoConRata, nome);
      toast.success("PDF scaricato");
    } catch (err) {
      console.error("Errore export PDF:", err);
      toast.error("Errore nella generazione del PDF");
    } finally {
      setExporting(false);
    }
  };

  // ── Salva come template ─────────────────────────────────────────────────────
  // Duplica la riga corrente come template (`is_template: true`). Non naviga:
  // resta sulla simulazione corrente, il template è disponibile in lista.
  const handleSalvaTemplate = async () => {
    if (!row) return;
    try {
      await duplicate.mutateAsync({
        ...row,
        nome,
        voci: doc?.voci ?? row.voci,
        fasi: doc?.fasi ?? row.fasi,
        scenari: doc?.scenari ?? row.scenari,
        as_template: true,
      });
      toast.success("Template salvato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio del template");
    }
  };

  // ── Autosave debounced ─────────────────────────────────────────────────────
  // Salta il primo render dopo l'idratazione: non vogliamo riscrivere subito i
  // dati appena caricati. Si attiva solo su modifiche reali di doc/nome.
  const dirty = useRef(false);
  useEffect(() => {
    if (!id || !doc || !risultatoConRata) return;
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
            contact_id: contactId,
            voci: doc.voci,
            fasi: doc.fasi,
            scenari: doc.scenari,
            costo_totale: risultatoConRata.costo_totale,
            ricavo_imponibile: risultatoConRata.ricavo_imponibile,
            margine_valore: risultatoConRata.margine_valore,
            margine_pct: risultatoConRata.margine_pct,
            iva_totale: risultatoConRata.iva_totale,
            prezzo_cliente: risultatoConRata.prezzo_cliente,
            rata_mensile: risultatoConRata.rata_mensile,
          },
        },
        { onSuccess: () => setSaved(true) },
      );
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(t);
    // `update` è stabile (mutation); volutamente fuori dalle deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, doc, nome, contactId, risultatoConRata]);

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

  if (!doc || !risultato || !risultatoConRata) {
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
        <div className="flex items-start gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 mt-0.5"
            onClick={() => navigate("/azienda/marketing/simulatore")}
            aria-label="Torna alla lista"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome simulazione"
              className="h-10 w-full max-w-md border-transparent bg-transparent px-2 text-xl font-bold shadow-none hover:border-input focus-visible:border-input"
            />
            {/* Contatto CRM collegato (riuso del picker generico). */}
            <div className="max-w-md">
              <FvContactPicker
                clienteId={contactId}
                onSelect={(c: FvContactLite) => setContactId(c.id)}
                onClear={() => setContactId(null)}
              />
              {contactNome ? (
                <p className="px-1 text-[11px] text-muted-foreground">
                  Cliente: <strong>{contactNome}</strong>
                </p>
              ) : null}
            </div>
          </div>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={exporting}>
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Esporta
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleExportExcel()}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Esporta Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportPdf()}>
                <FileText className="mr-2 h-4 w-4" />
                Esporta PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleSalvaTemplate()}
                disabled={duplicate.isPending}
              >
                <FileStack className="mr-2 h-4 w-4" />
                Salva come template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setTrasformaOpen(true)} className="gap-2">
            <Wand2 className="h-4 w-4" />
            Trasforma
          </Button>
        </div>
      </div>

      {/* KPI */}
      <SimKpiBar risultato={risultatoConRata} ivaRate={doc.scenari.iva_rate_singola} />

      {/* Voci — griglia editabile (listino, prezzari, righe libere) */}
      <SimVociGrid
        voci={doc.voci}
        fasi={doc.fasi}
        ivaMode={doc.scenari.iva_mode}
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

      {/* Scenari di offerta — IVA (confronto/mista) + finanziamento */}
      <SimScenariPanel
        scenari={doc.scenari}
        risultato={risultato}
        onChange={(scenari) => setDoc((d) => (d ? { ...d, scenari } : d))}
        onRataChange={setRataMensile}
      />

      {/* Dialog "Da listino" — append delle voci scelte in coda */}
      <AggiungiVociDialog
        open={listinoOpen}
        onOpenChange={setListinoOpen}
        onAdd={(nuove) =>
          setDoc((d) => (d ? { ...d, voci: [...d.voci, ...nuove] } : d))
        }
      />

      {/* Trasforma — genera preventivo o commessa dalle voci simulate */}
      <TrasformaDialog
        open={trasformaOpen}
        onOpenChange={setTrasformaOpen}
        doc={doc}
        risultato={risultatoConRata}
        simulazioneNome={nome}
        contactId={row?.contact_id ?? null}
      />
    </div>
  );
}
