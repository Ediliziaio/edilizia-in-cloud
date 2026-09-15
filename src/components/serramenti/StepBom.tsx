/**
 * StepBom — Step 4 wizard: composizione serramenti (BOM).
 *
 * Tabella editabile: tipologia, materiale, vetro, misure, quantità, prezzo.
 * Aggiungi/duplica/elimina riga. Import da sopralluogo Infissi v6 (Wave 4).
 *
 * Ogni finestra ha in fondo al box i suoi complementi (tapparella, zanzariera,
 * cassonetto, persiana), con le sue misure e il modello già usato nel
 * preventivo: vedi ComplementiFinestra e lib/serramenti/complementiFinestra.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RectangleVertical, Plus, Trash2, Copy, Loader2, Upload, HelpCircle, Package, Sparkles, Gift, Euro, FileText } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ListinoPickerDialog, type ListinoPickResult } from "./ListinoPickerDialog";
import { AiSerramentiDraftLauncher } from "./AiSerramentiDraftLauncher";
import { calcolaPrezzoProdotto, calcolaPosaInclusa, applyMaggiorazioniAssi } from "@/lib/serramenti/pricing";
import { useFamilies, useFamily } from "@/hooks/useFamilies";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { useSupplierProductLines } from "@/features/serramenti-listini/hooks/useSupplierProductLines";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import { ServiziSection } from "./ServiziSection";
import { AccessoriSection } from "./AccessoriSection";
import {
  useAddSerramento, useUpdateSerramento, useDeleteSerramento, useImportDaSopralluogo,
  useListinoFamiliesByIds, useListinoGriglia, useTariffeManodopera,
  useAddAccessori, useUpdateAccessorio, useDeleteAccessorio,
} from "@/lib/serramenti/queries";
import { useListinoMacrocategorie } from "@/hooks/useListinoMacrocategorie";
import {
  SR_TIPOLOGIE_SERRAMENTO, SR_MATERIALI,
} from "@/types/serramenti";
import type { SrProgettoDetail, SrSerramentoRow, SrMaterialePrincipale } from "@/types/serramenti";
import { calcolaM2 } from "@/lib/serramenti/calcoli";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import { formatEuro, formatNumero } from "@/lib/serramenti/format";
import type { ListinoFamily } from "@/lib/serramenti/api";
import { DynamicFieldsRenderer } from "@/components/listino/DynamicFieldsRenderer";
import { useListinoCategorie } from "@/hooks/useListinoCategorie";
import { useSchedeLinea } from "@/hooks/useSchedeLinea";
import { lineaDellaRiga, schedaVuota, trovaSchedaLinea } from "@/lib/listino/schedeLinea";
import { SchedaLineaCompatta } from "./SchedaLineaCompatta";
import { SceltaVariante } from "./SceltaVariante";
import { SceltaColore } from "./SceltaColore";
import { gruppiColori, pulisciVoci, scelteDopo, testoScelta, vociDi } from "@/lib/listino/scelteVariante";
import { schedaPosizione, scelteDaAssi } from "@/lib/serramenti/schedaPosizione";
import { Checkbox } from "@/components/ui/checkbox";
import { misuraDaTesto, quantitaDaTesto } from "@/lib/serramenti/righePreventivo";
import { preferenzeDaRiga } from "@/lib/serramenti/pickerListino";
import { ComplementiFinestra, ComplementiSuTutteLeFinestre, EliminaComplementoDialog } from "./ComplementiFinestra";
import { useComplementiFinestre } from "./useComplementiFinestre";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

type ManualPricingMode = "prodotto" | "corpo";

export function StepBom({ progettoId, detail }: Props) {
  const addMut = useAddSerramento(progettoId);
  const updateMut = useUpdateSerramento(progettoId);
  const deleteMut = useDeleteSerramento(progettoId);
  const importMut = useImportDaSopralluogo(progettoId);
  const [toDelete, setToDelete] = useState<SrSerramentoRow | null>(null);
  // Con la finestra si tolgono anche i suoi accessori (la tapparella di quella
  // finestra), salvo scelta contraria: il database li lascerebbe scollegati.
  const [eliminaAccessori, setEliminaAccessori] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [listinoOpen, setListinoOpen] = useState(false);
  // Dialog "Aggiungi a mano": form libero per voci off-listino con
  // possibilita' di marcare come Regalo/Omaggio (prezzo=0).
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  // Conferma import sopralluogo: invece di `confirm()` nativo (UX scadente,
  // bloccante, brutto su mobile) usiamo un AlertDialog gestito.
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // La scelta fatta una volta per tutte le righe: la applica ogni riga con il
  // proprio ricalcolo (vedi BulkAssiActions).
  const [richiestaBulk, setRichiestaBulk] = useState<RichiestaBulkAsse | null>(null);
  const [richiestaBulkPosa, setRichiestaBulkPosa] = useState<RichiestaBulkPosa | null>(null);

  const serramenti = detail.serramenti;

  // Le famiglie con assi e valori: servono per sapere quali variabili sono
  // comuni alle righe e si possono decidere in una volta sola.
  const { families: famiglieConAssi } = useFamilies();

  // Configurazione rapida: la posizione nuova parte dalle scelte dell'ultima
  // presa dal listino (linea, colore, vetro) e dai suoi colori scritti a mano.
  const ultimaDaListino = useMemo(
    () => [...serramenti].sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).find((s) => s.family_id),
    [serramenti],
  );
  const preferenzeAssi = useMemo(
    () => preferenzeDaRiga(ultimaDaListino, famiglieConAssi),
    [ultimaDaListino, famiglieConAssi],
  );

  // Pre-fetch SOLO le famiglie referenziate dalle righe BOM correnti: un
  // elenco generico si fermava ai primi 100 articoli, e una riga con un
  // articolo oltre quelli appariva "off-listino", coi campi
  // Materiale/Serie/Vetro/Colore.
  const familyIdsBOM = useMemo(
    () => Array.from(new Set(serramenti.map((s) => s.family_id).filter(Boolean) as string[])),
    [serramenti],
  );
  const { data: allFamilies = [] } = useListinoFamiliesByIds(familyIdsBOM);
  const familiesById = useMemo(() => {
    const m = new Map<string, ListinoFamily>();
    allFamilies.forEach((f) => m.set(f.id, f));
    return m;
  }, [allFamilies]);

  // Mappa tariffaId -> prezzo vendita, per ricalcolare la POSA inclusa nel
  // prezzo unitario quando l'utente modifica L/A/Q in una riga BOM da listino.
  // Senza, la posa configurata sull'articolo veniva sottratta silenziosamente
  // dal ricalcolo -> margine eroso.
  const { data: tariffe = [] } = useTariffeManodopera();
  const tariffePrezzi = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => { if (t.prezzo_vendita != null) m.set(t.id, Number(t.prezzo_vendita)); });
    return m;
  }, [tariffe]);

  const { lines: supplierLines = [] } = useSupplierProductLines({
    enabled: familyIdsBOM.length > 0,
  });
  const supplierLineMap = useMemo(() => {
    const m = new Map<string, SupplierProductLine>();
    supplierLines.forEach((line) => m.set(line.id, line));
    return m;
  }, [supplierLines]);

  // Mappa categoria → macrocategoria_id per lookup scheda tecnica nella row.
  const { categorie } = useListinoCategorie();
  const catToMacro = useMemo(() => {
    const m = new Map<string, string>();
    categorie.forEach((c) => {
      if (c.macrocategoria_id) m.set(c.id, c.macrocategoria_id);
    });
    return m;
  }, [categorie]);

  // Mappa macroId → nome macrocategoria per breadcrumb header riga
  // ("MACROCATEGORIA · ARTICOLO"). Le macro sono gia' fetched in alto
  // tramite useListinoMacrocategorie (caching React Query).
  // Il hook dà `macrocategorie`, non `data`: prima la mappa restava vuota e la
  // pillola della macrocategoria non compariva mai nella testata della riga.
  const { macrocategorie: macrosAll } = useListinoMacrocategorie();
  const macroIdToNome = useMemo(() => {
    const m = new Map<string, string>();
    macrosAll.forEach((mc) => m.set(mc.id, mc.nome));
    return m;
  }, [macrosAll]);

  // ─── Complementi delle finestre ──────────────────────────────────────────
  // Tapparella, zanzariera, cassonetto e persiana stanno nel box della loro
  // finestra: la logica è in useComplementiFinestre, qui solo dove si salvano.
  const addComplementiMut = useAddAccessori(progettoId);
  const updateComplementoMut = useUpdateAccessorio(progettoId);
  const deleteComplementoMut = useDeleteAccessorio(progettoId);
  const complementi = useComplementiFinestre({
    serramenti,
    accessori: detail.accessori,
    famiglie: famiglieConAssi,
    macrocategorie: macrosAll,
    categorie,
    tariffePrezzi,
    supplierLineMap,
    salvataggi: {
      aggiungi: (righe) => addComplementiMut.mutateAsync(righe),
      aggiorna: (id, patch) => updateComplementoMut.mutate({ id, patch }),
      elimina: (id) => deleteComplementoMut.mutate(id),
      inCorso: addComplementiMut.isPending,
    },
  });

  // Nuovo flow: ListinoPicker ritorna già misure + prezzo unitario calcolato
  // (incluso eventuale posa configurata sul prodotto). Niente più auto-create
  // riga manodopera separata — la posa è dentro il prezzo della posizione.
  const handlePickFromListino = (item: ListinoPickResult) => {
    const qty = item.quantita || 1;
    const prezzoUnitarioFinal = item.prezzo_unitario ?? 0;
    addMut.mutate(
      {
        tipologia: "finestra_2ante",
        tipologia_label: item.family_nome,
        // Materiale: NON forzato qui. La riga da listino legge il materiale
        // dalla scheda tecnica della family (custom_field_values.materiale_profilo)
        // -> evitiamo l'inconsistenza "header dice Alluminio ma scheda dice PVC".
        // L'header SerramentoRow gestisce il fallback su isFromListino.
        materiale: null,
        larghezza_mm: item.larghezza_mm,
        altezza_mm: item.altezza_mm,
        quantita: qty,
        prezzo_unitario: prezzoUnitarioFinal,
        prezzo_totale: prezzoUnitarioFinal * qty,
        position: serramenti.length,
        family_id: item.family_id,
        listino_voce_id: item.griglia_id ?? null,
        supplier_catalog_id: item.supplier_catalog_id ?? null,
        supplier_product_line_id: item.supplier_product_line_id ?? null,
        valori_assi: item.valori_assi ?? {},
        // Il colore vero scelto dentro la fascia (Grigio antracite dentro «Colore Standard»).
        scelte_assi: item.scelte_assi ?? {},
        colore_interno: ultimaDaListino?.colore_interno ?? null,
        colore_esterno: ultimaDaListino?.colore_esterno ?? null,
        // La nota della riga è quella del commerciale e il PDF la stampa come
        // «Note tecniche». Il conto del prezzo non è una nota: finiva nel PDF in
        // formato inglese («1.68 m² × €600.00/m²») e restava vecchio appena si
        // cambiavano linea, colore o misure, accanto a un prezzo diverso.
        note: null,
      },
      { onSuccess: (created) => setExpanded(created.id) },
    );
  };

  /**
   * Submit del dialog "Aggiungi a mano": crea una riga BOM off-listino
   * con i campi liberi inseriti dal commerciale. Se `isOmaggio` e' true
   * forza prezzo a 0 e aggiunge marcatore nelle note (riconosciuto dal
   * badge "Omaggio" nell'header riga).
   */
  const handleManualSubmit = (form: {
    mode: ManualPricingMode;
    nome: string;
    descrizione: string;
    quantita: number;
    prezzo_unitario: number;
    isOmaggio: boolean;
  }) => {
    const q = form.mode === "corpo" ? 1 : Math.max(1, form.quantita || 1);
    const prezzo = form.isOmaggio ? 0 : form.prezzo_unitario;
    const noteParts: string[] = [];
    if (form.isOmaggio) noteParts.push("🎁 OMAGGIO");
    if (form.mode === "corpo") noteParts.push("A CORPO");
    if (form.descrizione.trim()) noteParts.push(form.descrizione.trim());
    addMut.mutate(
      {
        // Tipologie interne per righe non agganciate al listino. Evitano di
        // confondere voci libere / importi a corpo con una "vetrata fissa".
        tipologia: form.mode === "corpo" ? "a_corpo" : "voce_manuale",
        tipologia_label: form.nome.trim() || "Voce custom",
        materiale: null,
        quantita: q,
        prezzo_unitario: prezzo,
        prezzo_totale: prezzo * q,
        position: serramenti.length,
        note: noteParts.join(" · ") || null,
      },
      {
        onSuccess: (created) => {
          setExpanded(created.id);
          setManualDialogOpen(false);
        },
      },
    );
  };

  const handleDuplicate = (s: SrSerramentoRow) => {
    // Duplica TUTTI i campi rilevanti, inclusi i link al listino. Prima
    // family_id / listino_voce_id / macrocategoria_override_id / metri_quadri
    // venivano persi -> duplicando una riga "da listino" la copia finiva
    // off-listino (stessa root cause del bug INSERT in api.ts).
    addMut.mutate({
      tipologia: s.tipologia,
      tipologia_label: s.tipologia_label,
      ambiente: s.ambiente,
      materiale: s.materiale,
      serie: s.serie,
      vetro: s.vetro,
      apertura: s.apertura,
      colore_interno: s.colore_interno,
      colore_esterno: s.colore_esterno,
      larghezza_mm: s.larghezza_mm,
      altezza_mm: s.altezza_mm,
      quantita: s.quantita,
      metri_quadri: s.metri_quadri,
      prezzo_unitario: s.prezzo_unitario,
      prezzo_totale: s.prezzo_totale,
      family_id: s.family_id,
      listino_voce_id: s.listino_voce_id,
      supplier_catalog_id: s.supplier_catalog_id,
      supplier_product_line_id: s.supplier_product_line_id,
      macrocategoria_override_id: s.macrocategoria_override_id,
      valori_assi: s.valori_assi ?? {},
      scelte_assi: s.scelte_assi ?? {},
      // «Solo fornitura» segue la copia: il prezzo copiato è già senza posa.
      posa_esclusa: s.posa_esclusa ?? false,
      position: serramenti.length,
      note: s.note,
    }, {
      // La copia nasce coi complementi della finestra: la sua tapparella, la sua zanzariera.
      onSuccess: (creata) => complementi.duplicaComplementi(s.id, creata.id),
    });
  };

  const onPatch = (id: string, patch: Partial<SrSerramentoRow>) => {
    // Ricalcola prezzo totale e m² se cambia qty/misure/prezzo unitario
    const orig = serramenti.find((s) => s.id === id);
    if (orig) {
      const next = { ...orig, ...patch };
      if (
        patch.larghezza_mm !== undefined ||
        patch.altezza_mm !== undefined ||
        patch.quantita !== undefined
      ) {
        patch.metri_quadri = calcolaM2(
          next.larghezza_mm ?? 0,
          next.altezza_mm ?? 0,
          next.quantita ?? 1,
        );
      }
      if (
        patch.prezzo_unitario !== undefined ||
        patch.quantita !== undefined
      ) {
        patch.prezzo_totale = (next.prezzo_unitario ?? 0) * (next.quantita ?? 1);
      }
    }
    updateMut.mutate({ id, patch });
    // I complementi della finestra ne seguono misure, pezzi e posa.
    if (orig) void complementi.seguiLaFinestra(orig, { ...orig, ...patch });
  };

  const accessoriDaEliminare = toDelete ? detail.accessori.filter((a) => a.serramento_id === toDelete.id) : [];

  return (
    <div className="space-y-3">
      <SrCard
        title="Composizione offerta"
        description="Finestre, porte e persiane dal listino, voci fuori listino o importi a corpo. Tapparelle, zanzariere e cassonetti si aggiungono nel box della loro finestra, con le sue misure."
        icon={<RectangleVertical className="h-4 w-4" />}
      >
        {detail.progetto.sopralluogo_id && (
          <SrCallout variant="info" icon={<Upload className="h-3.5 w-3.5" />} title="Sopralluogo collegato" className="mb-3">
            Questo progetto è collegato a un sopralluogo Infissi. Puoi importare automaticamente la composizione dei serramenti rilevati (tipologia, materiale, apertura, misure, complementi).
            <Button
              size="sm" variant="outline" className="mt-2"
              disabled={importMut.isPending}
              onClick={() => {
                if (!detail.progetto.sopralluogo_id) return;
                // Se ci sono già serramenti chiediamo all'utente cosa fare
                // tramite AlertDialog gestito (vedi sotto). Altrimenti import
                // diretto senza domande inutili.
                if (serramenti.length > 0) {
                  setImportDialogOpen(true);
                } else {
                  importMut.mutate({
                    sopralluogo_id: detail.progetto.sopralluogo_id,
                    replace: false,
                  });
                }
              }}
            >
              {importMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Importa da sopralluogo
            </Button>
          </SrCallout>
        )}

        {/* Lista serramenti (se presenti). Box hint se vuota. */}
        {serramenti.length === 0 ? (
          <div className="space-y-3 mb-3">
            {/* BOM vuoto → l'Assistente AI è la via più veloce: lo mettiamo in
                cima come azione primaria (descrivi a voce / scrivi / fotografa
                il rilievo → bozza pronta da approvare). */}
            <AiSerramentiDraftLauncher
              progettoId={progettoId}
              detail={detail}
              context="bom"
              onInserted={setExpanded}
            />
            <div className="border-2 border-dashed border-slate-200 rounded-md p-6 text-center">
              <RectangleVertical className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-muted-foreground">
                Il modo più veloce: usa l'<strong>Assistente AI</strong> qui sopra.
                Oppure aggiungi dal listino (consigliato) o a mano coi bottoni sotto.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Bulk action manodopera: utili quando il commerciale vuole
                applicare lo stesso flag a tutte le righe (preventivo "solo
                fornitura" o "tutti con posa"). Visibile solo se ci sono >=2
                righe — su 1 sola riga il toggle nel singolo card e' piu' veloce. */}
            <BulkAssiActions
              serramenti={serramenti}
              famiglie={famiglieConAssi}
              onApplica={(codice, valore, scelta) =>
                setRichiestaBulk({ codice, valore, scelta, nonce: Date.now() })
              }
              onColori={({ interno, esterno }) => {
                for (const riga of serramenti) {
                  if (riga.tipologia === "a_corpo") continue;
                  const patch: Partial<SrSerramentoRow> = {};
                  if (interno) patch.colore_interno = interno;
                  if (esterno) patch.colore_esterno = esterno;
                  onPatch(riga.id, patch);
                }
              }}
            />
            <BulkPosaActions
              serramenti={serramenti}
              conPosaAListino={(s) => {
                const f = s.family_id ? familiesById.get(s.family_id) : undefined;
                return !!f?.manodopera_modalita && f.manodopera_modalita !== "nessuna";
              }}
              // Come per le variabili: ogni riga toglie o rimette la posa col suo
              // ricalcolo. Prima si cambiava solo il segno «solo fornitura» e il
              // prezzo restava quello con la posa dentro.
              onBulkUpdate={(esclusa) => setRichiestaBulkPosa({ esclusa, nonce: Date.now() })}
            />
            {complementi.barraTutte && <ComplementiSuTutteLeFinestre {...complementi.barraTutte} />}
            <div className="space-y-2 mb-3">
              {serramenti.map((s, idx) => {
              const family = s.family_id ? familiesById.get(s.family_id) : undefined;
              // Post-refactor 20270513200000: usa macrocategoria_id diretto,
              // fallback via categoria_id per articoli legacy.
              const familyAny = family as unknown as { macrocategoria_id?: string | null };
              const macroId = familyAny?.macrocategoria_id
                ?? (family?.categoria_id ? catToMacro.get(family.categoria_id) : undefined);
              const macroNome = macroId ? macroIdToNome.get(macroId) : undefined;
              const bloccoComplementi = complementi.blocco(s, idx);
              return (
                <SerramentoRow
                  key={s.id}
                  serramento={s}
                  index={idx}
                  expanded={expanded === s.id}
                  onToggle={() => setExpanded((prev) => prev === s.id ? null : s.id)}
                  onPatch={(patch) => onPatch(s.id, patch)}
                  onDuplicate={() => handleDuplicate(s)}
                  onDelete={() => {
                    setEliminaAccessori(true);
                    setToDelete(s);
                  }}
                  family={family}
                  macroId={macroId}
                  macroNome={macroNome}
                  tariffePrezzi={tariffePrezzi}
                  supplierLineMap={supplierLineMap}
                  richiestaBulk={richiestaBulk}
                  richiestaBulkPosa={richiestaBulkPosa}
                  testoComplementi={complementi.riepilogo(s.id)}
                  complementi={bloccoComplementi ? <ComplementiFinestra {...bloccoComplementi} /> : null}
                />
              );
            })}
            </div>
          </>
        )}

        {/* AI launcher: quando il BOM è vuoto è già in cima come azione
            primaria; qui lo mostriamo solo se ci sono già righe (per aggiungerne
            altre con l'AI senza perdere la lista come elemento primario). */}
        {serramenti.length > 0 && (
          <div className="mb-3">
            <AiSerramentiDraftLauncher
              progettoId={progettoId}
              detail={detail}
              context="bom"
              onInserted={setExpanded}
            />
          </div>
        )}

        {/* Bottoni di aggiunta — sempre visibili SOTTO la lista (o sotto
            il box vuoto). Stile dashed/outline meno invasivo dei CTA pieni:
            l'utente vede chiaramente la lista come elemento primario e i
            bottoni come "aggiungi un altro". */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => setListinoOpen(true)}
            variant="outline"
            className="flex-1 gap-1 border-dashed border-2 border-orange-300 hover:bg-orange-50"
            disabled={addMut.isPending}
          >
            <Package className="h-4 w-4" /> Aggiungi dal listino
          </Button>
          <Button
            onClick={() => setManualDialogOpen(true)}
            variant="outline"
            className="flex-1 gap-1 border-dashed border-2 border-slate-300"
            disabled={addMut.isPending}
          >
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Aggiungi voce manuale
          </Button>
        </div>

        <ListinoPickerDialog
          open={listinoOpen}
          onOpenChange={setListinoOpen}
          onSelect={handlePickFromListino}
          preferenzeAssi={preferenzeAssi}
        />

        {/* Il listino per un complemento: sulla sua tipologia, con le misure della finestra. */}
        <ListinoPickerDialog {...complementi.picker} />

        <ManualAddDialog
          open={manualDialogOpen}
          onOpenChange={setManualDialogOpen}
          onSubmit={handleManualSubmit}
          submitting={addMut.isPending}
        />

      </SrCard>

      {/* I complementi rimasti senza finestra, da agganciare: gli altri stanno nel box della loro finestra. */}
      <AccessoriSection progettoId={progettoId} detail={detail} finestre={complementi.finestrePerAggancio} />

      {/* Sezione Servizi aggiuntivi — trasporto, ENEA, smaltimento, ecc.
          La manodopera/posa è inclusa nel prezzo del singolo prodotto. */}
      <ServiziSection progettoId={progettoId} detail={detail} />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {toDelete?.tipologia_label ?? "serramento"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Non è reversibile. Le foto collegate restano nel preventivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {accessoriDaEliminare.length > 0 && (
            <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm">
              <Checkbox
                checked={eliminaAccessori}
                onCheckedChange={(v) => setEliminaAccessori(v === true)}
                className="mt-0.5"
              />
              <span>
                Elimina anche {accessoriDaEliminare.length === 1 ? "il complemento collegato" : `i ${accessoriDaEliminare.length} complementi collegati`}
                <span className="block text-xs text-muted-foreground">
                  {accessoriDaEliminare.map((a) => a.descrizione || a.tipo).join(", ")}
                </span>
              </span>
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!toDelete) return;
                deleteMut.mutate(
                  { id: toDelete.id, conAccessori: eliminaAccessori && accessoriDaEliminare.length > 0 },
                  { onSettled: () => setToDelete(null) },
                );
              }}
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EliminaComplementoDialog {...complementi.eliminazione} />

      {/* AlertDialog: import sopralluogo con serramenti già esistenti.
          Tre opzioni esplicite (Annulla / Aggiungi in coda / Sostituisci tutto)
          → niente più `confirm()` ambiguo "OK=sostituisci, Annulla=appendi". */}
      <AlertDialog
        open={importDialogOpen}
        onOpenChange={(o) => {
          if (!o && !importMut.isPending) setImportDialogOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importa serramenti dal sopralluogo</AlertDialogTitle>
            <AlertDialogDescription>
              Hai già {serramenti.length} {serramenti.length === 1 ? "serramento" : "serramenti"} in composizione.
              Come vuoi unire l'import del sopralluogo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={importMut.isPending}>Annulla</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={importMut.isPending}
              onClick={() => {
                if (!detail.progetto.sopralluogo_id) return;
                importMut.mutate(
                  { sopralluogo_id: detail.progetto.sopralluogo_id, replace: false },
                  { onSettled: () => setImportDialogOpen(false) },
                );
              }}
            >
              {importMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Aggiungi in coda
            </Button>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600"
              disabled={importMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!detail.progetto.sopralluogo_id) return;
                importMut.mutate(
                  { sopralluogo_id: detail.progetto.sopralluogo_id, replace: true },
                  { onSettled: () => setImportDialogOpen(false) },
                );
              }}
            >
              {importMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Sostituisci tutto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Bulk action manodopera (toggle massivo posa inclusa/esclusa) ────────────

/**
 * Toolbar leggera sopra la lista BOM per applicare un flag posa_esclusa
 * a TUTTE le righe in un colpo solo. Casi tipici:
 *   - Preventivo "solo fornitura" (cliente fa installare da altri)
 *   - Cambio idea: riattivare la posa su tutte dopo averla esclusa
 *
 * Visibile solo con >=2 serramenti (per 1 il toggle nel card singolo basta).
 * Mostra contestualmente lo stato attuale aggregato (X di Y con posa).
 */
function BulkPosaActions({
  serramenti, conPosaAListino, onBulkUpdate,
}: {
  serramenti: SrSerramentoRow[];
  /** L'articolo della riga ha una posa a listino: le altre righe non hanno posa da includere o togliere. */
  conPosaAListino: (s: SrSerramentoRow) => boolean;
  onBulkUpdate: (esclusa: boolean) => void;
}) {
  if (serramenti.length < 2) return null;
  // Contano solo le righe con una posa a listino: una finestra senza posa non è
  // «con posa inclusa», e la barra diceva «tutte le 2 righe con posa inclusa».
  const righe = serramenti.filter(conPosaAListino);
  if (righe.length === 0) return null;
  const senzaPosaAListino = serramenti.length - righe.length;
  const senzaPosa = righe.filter((s) => s.posa_esclusa).length;
  const conPosa = righe.length - senzaPosa;
  const stato =
    senzaPosa === 0 ? "tutte_con" :
    conPosa === 0 ? "tutte_senza" :
    "miste";
  const quante = (n: number) =>
    n === serramenti.length ? `tutte le ${n} righe` : n === 1 ? "1 riga" : `${n} righe`;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5 mb-3 flex items-center justify-between gap-2 flex-wrap">
      <div className="text-xs text-slate-700 min-w-0">
        <span className="font-semibold">Manodopera:</span>{" "}
        {stato === "tutte_con" && (
          <span className="text-emerald-700">{quante(conPosa)} con posa inclusa</span>
        )}
        {stato === "tutte_senza" && (
          <span className="text-amber-700">{quante(senzaPosa)} senza posa (solo fornitura)</span>
        )}
        {stato === "miste" && (
          <span className="text-slate-600">{conPosa} con posa · {senzaPosa} senza posa</span>
        )}
        {senzaPosaAListino > 0 && (
          <span className="text-muted-foreground"> · {senzaPosaAListino} senza posa a listino</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          onClick={() => onBulkUpdate(false)}
          disabled={stato === "tutte_con"}
        >
          🔧 Tutti con posa
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
          onClick={() => onBulkUpdate(true)}
          disabled={stato === "tutte_senza"}
        >
          ⊘ Solo fornitura
        </Button>
      </div>
    </div>
  );
}

/** Posa inclusa o esclusa su tutte le righe; `nonce` distingue due clic uguali. */
export interface RichiestaBulkPosa {
  esclusa: boolean;
  nonce: number;
}

/** Una scelta da applicare a tutte le righe; `nonce` distingue due clic uguali. */
export interface RichiestaBulkAsse {
  codice: string;
  valore: string;
  /** La voce dentro il valore (il colore di una fascia); null = solo il valore. */
  scelta: string | null;
  nonce: number;
}

/**
 * Le variabili prodotto decise una volta per tutte le righe.
 *
 * Su un rilievo da venti finestre la linea di profilo e il colore sono gli
 * stessi ovunque, ma andavano scelti riga per riga: sessanta menu aperti per
 * dire tre volte la stessa cosa. Qui si sceglie in cima, e ogni riga applica
 * la scelta con il proprio ricalcolo — chi ha una tipologia che quella variante
 * non ce l'ha resta com'è.
 */
function BulkAssiActions({
  serramenti, famiglie, onApplica, onColori,
}: {
  serramenti: SrSerramentoRow[];
  famiglie: FamilyWithAxes[];
  onApplica: (codice: string, valore: string, scelta: string | null) => void;
  /** Il colore vero (RAL, effetto legno) per tutte le righe: la variante Colore dice solo la fascia di prezzo. */
  onColori: (colori: { interno: string; esterno: string }) => void;
}) {
  const [coloreInterno, setColoreInterno] = useState("");
  const [coloreEsterno, setColoreEsterno] = useState("");
  const assi = useMemo(() => {
    const usate = new Set(serramenti.map((s) => s.family_id).filter(Boolean) as string[]);
    if (usate.size === 0) return [];
    const perCodice = new Map<
      string,
      { nome: string; righe: number; valori: Map<string, { label: string; voci: string[] }> }
    >();
    for (const f of famiglie) {
      if (!usate.has(f.id)) continue;
      const quante = serramenti.filter((s) => s.family_id === f.id).length;
      for (const asse of f.axes) {
        const voce = perCodice.get(asse.codice) ?? { nome: asse.nome, righe: 0, valori: new Map() };
        voce.righe += quante;
        for (const v of asse.values) {
          if (!v.attivo) continue;
          const presente = voce.valori.get(v.valore);
          // Le voci della fascia (i colori di «Colore Standard») di tutte le tipologie usate.
          voce.valori.set(v.valore, {
            label: presente?.label ?? v.label,
            voci: pulisciVoci([...(presente?.voci ?? []), ...vociDi(v)]),
          });
        }
        perCodice.set(asse.codice, voce);
      }
    }
    // Una variabile che tocca una riga sola non merita un'azione di gruppo.
    return [...perCodice.entries()]
      .filter(([, v]) => v.righe >= 2 && (v.valori.size > 1 || [...v.valori.values()].some((x) => x.voci.length > 0)))
      .map(([codice, v]) => ({
        codice,
        nome: v.nome,
        valori: [...v.valori.entries()].map(([valore, x]) => ({ valore, label: x.label, voci: x.voci })),
      }));
  }, [serramenti, famiglie]);
  // I colori scritti nel listino, divisi per fascia come nella tendina «Colore».
  const gruppiDiColori = useMemo(() => {
    const usate = new Set(serramenti.map((s) => s.family_id).filter(Boolean) as string[]);
    return gruppiColori(famiglie.filter((f) => usate.has(f.id)).flatMap((f) => f.axes));
  }, [serramenti, famiglie]);
  // Cosa si è scelto in ogni tendina, per scriverlo chiuso («Grigio antracite · Colore Standard»).
  const [sceltiGruppo, setSceltiGruppo] = useState<Record<string, string>>({});

  const righeColorabili = serramenti.filter((s) => s.tipologia !== "a_corpo").length;
  if (serramenti.length < 2 || (assi.length === 0 && righeColorabili < 2)) return null;

  const applicaColori = () => {
    const interno = coloreInterno.trim();
    const esterno = coloreEsterno.trim();
    if (!interno && !esterno) return;
    onColori({ interno, esterno });
    setColoreInterno("");
    setColoreEsterno("");
  };

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/50 p-2.5 mb-3">
      <div className="text-[10px] uppercase tracking-wide text-blue-800 font-semibold mb-2">
        Stesse scelte per tutte le {serramenti.length} righe
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {assi.map((asse) => {
          const codiceScelto = sceltiGruppo[asse.codice] ?? "";
          const [tipoScelto, indiceValore, indiceVoce] = codiceScelto.split(":");
          const valoreScelto = codiceScelto ? asse.valori[Number(indiceValore)] : undefined;
          const testoChiuso = valoreScelto
            ? testoScelta(valoreScelto.label, tipoScelto === "o" ? valoreScelto.voci[Number(indiceVoce)] : null)
            : undefined;
          return (
            <div key={asse.codice} className="space-y-1 min-w-[160px]">
              <Label className="text-[10px] text-slate-700">{asse.nome}</Label>
              <Select
                value={codiceScelto}
                onValueChange={(codice) => {
                  const [tipo, a, b] = codice.split(":");
                  const voce = asse.valori[Number(a)];
                  if (!voce) return;
                  setSceltiGruppo((prima) => ({ ...prima, [asse.codice]: codice }));
                  onApplica(asse.codice, voce.valore, tipo === "o" ? voce.voci[Number(b)] ?? null : null);
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-white">
                  <SelectValue placeholder="applica a tutte…">{testoChiuso}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {asse.valori.map((voce, a) =>
                    voce.voci.length === 0 ? (
                      <SelectItem key={voce.valore} value={`v:${a}`} className="text-xs">
                        {voce.label}
                      </SelectItem>
                    ) : (
                      <SelectGroup key={voce.valore}>
                        <SelectLabel className="py-1 text-[11px] text-muted-foreground">{voce.label}</SelectLabel>
                        <SelectItem value={`v:${a}`} className="text-xs italic">
                          Da decidere
                        </SelectItem>
                        {voce.voci.map((testoVoce, b) => (
                          <SelectItem key={testoVoce} value={`o:${a}:${b}`} className="text-xs">
                            {testoVoce}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          );
        })}
        {righeColorabili >= 2 && (
          <>
            {/* Stessa tendina di «Colore»: i colori del listino divisi per fascia, o
                scritti a mano. Prima era il suggeritore del browser, grigio e diverso. */}
            <div className="space-y-1 min-w-[170px]">
              <Label htmlFor="bulk-colore-interno" className="text-[10px] text-slate-700">Colore interno</Label>
              <SceltaColore
                id="bulk-colore-interno"
                value={coloreInterno}
                onChange={(valore) => setColoreInterno(valore ?? "")}
                gruppi={gruppiDiColori}
                placeholder="Bianco RAL 9010"
                className="h-8 bg-white"
              />
            </div>
            <div className="space-y-1 min-w-[170px]">
              <Label htmlFor="bulk-colore-esterno" className="text-[10px] text-slate-700">Colore esterno</Label>
              <SceltaColore
                id="bulk-colore-esterno"
                value={coloreEsterno}
                onChange={(valore) => setColoreEsterno(valore ?? "")}
                gruppi={gruppiDiColori}
                placeholder="Antracite RAL 7016"
                className="h-8 bg-white"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-white"
              disabled={!coloreInterno.trim() && !coloreEsterno.trim()}
              onClick={applicaColori}
            >
              Colori a tutte
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Singola riga serramento (collassabile) ─────────────────────────────────

export function SerramentoRow({
  serramento: s, index, expanded, onToggle, onPatch, onDuplicate, onDelete,
  family, macroId, macroNome, tariffePrezzi, supplierLineMap, richiestaBulk, richiestaBulkPosa,
  testoComplementi, complementi,
}: {
  serramento: SrSerramentoRow;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<SrSerramentoRow>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Family del listino corrispondente (se la riga è stata aggiunta dal listino). */
  family?: ListinoFamily;
  /** macroId della family per leggere lo schema scheda tecnica. */
  macroId?: string;
  /** Nome macrocategoria per breadcrumb header riga BOM. */
  macroNome?: string;
  /** Mappa tariffe → prezzo vendita per ricalcolare posa nel prezzo unitario. */
  tariffePrezzi: Map<string, number>;
  /** Mappa linee fornitore → ricarico per ricalcolare griglie avanzate. */
  supplierLineMap: Map<string, SupplierProductLine>;
  /** Scelta applicata a tutte le righe dall'azione di gruppo. */
  richiestaBulk: RichiestaBulkAsse | null;
  /** Posa inclusa o esclusa su tutte le righe dall'azione di gruppo. */
  richiestaBulkPosa: RichiestaBulkPosa | null;
  /** «Tapparella · Zanzariera»: cosa ha la finestra, visibile anche a box chiuso. */
  testoComplementi?: string;
  /** Il blocco dei complementi, in fondo al box aperto. */
  complementi?: ReactNode;
}) {
  // Label header riga:
  //   - off-listino: usa SR_TIPOLOGIE_SERRAMENTO (Finestra a 1 anta, ecc.)
  //   - da listino: usa il nome dell'articolo (es. "COSTRUZIONE 3 IT —
  //     PORTA BALCONE 1 ANTA"). family.nome e' gia' salvato in
  //     s.tipologia_label dal picker quindi e' preferito.
  const tipoLabel = family
    ? (family.nome || s.tipologia_label || s.tipologia)
    : (s.tipologia_label || SR_TIPOLOGIE_SERRAMENTO.find((t) => t.value === s.tipologia)?.label || s.tipologia);
  // Materiale label: per righe da listino legge dalla scheda tecnica della
  // family (`custom_field_values.materiale_profilo`) -> sempre coerente con
  // quello che il commerciale vede nel blocco "Caratteristiche da listino".
  // Per righe off-listino, fallback al campo `materiale` editato a mano.
  const materialeListinoMap: Record<string, string> = {
    pvc: "PVC",
    pvc_alluminio: "PVC-alluminio",
    alluminio: "Alluminio",
    alluminio_tt: "Alluminio TT",
    legno: "Legno",
    legno_alluminio: "Legno-alluminio",
  };
  const materialeProfiloListino = family?.custom_field_values?.materiale_profilo as string | undefined;
  const matLabel = family
    ? (materialeProfiloListino ? (materialeListinoMap[materialeProfiloListino] ?? materialeProfiloListino) : null)
    : (s.materiale ? SR_MATERIALI.find((m) => m.value === s.materiale)?.label : null);
  const mq = s.metri_quadri ?? calcolaM2(s.larghezza_mm ?? 0, s.altezza_mm ?? 0, s.quantita ?? 1);
  // Modalita' prezzo: serve per spiegare all'utente perche' modificando
  // L/A in alcuni casi il prezzo non cambia (es. listino "a pezzo").
  const modalitaPrezzo = family?.modalita_prezzo_base ?? null;
  const isFromListino = !!family;
  const isManualCorpo = !family && (s.tipologia === "a_corpo" || /\bA CORPO\b/i.test(s.note ?? ""));
  const isListinoManualPrice = isFromListino && modalitaPrezzo === "misura_libera";

  // Carico griglia listino della family per ricalcolo prezzo on-the-fly su
  // modifica L/A/Q. enabled solo se family esiste con modalità griglia.
  const { data: griglia = [], isLoading: grigliaInCaricamento } = useListinoGriglia(family?.id);
  const selectedSupplierProductLineId = s.supplier_product_line_id
    ?? griglia.find((g) => g.id === s.listino_voce_id)?.supplier_product_line_id
    ?? null;

  // Carica family completa (con axes+values) per applicare le maggiorazioni
  // delle Variabili Prodotto al ricalcolo prezzo. Solo per righe listino.
  const { family: familyWithAxes, isLoading: assiInCaricamento } = useFamily(family?.id);
  // Griglia o varianti non ancora arrivate: un ricalcolo chiesto adesso aspetta
  // (vedi l'effetto dopo i gestori) invece di lasciare il prezzo vecchio.
  const datiInArrivo = !!family && (grigliaInCaricamento || assiInCaricamento);
  // I colori scritti nelle fasce del listino, divisi per fascia, per colore interno ed esterno.
  const gruppiDiColori = useMemo(() => gruppiColori(familyWithAxes?.axes ?? []), [familyWithAxes]);
  // I colori che il PDF scrive se i campi restano vuoti: quelli della variante Colore.
  const coloriDaVariante = useMemo(
    () => schedaPosizione(scelteDaAssi(familyWithAxes?.axes ?? [], s.valori_assi, s.scelte_assi)),
    [familyWithAxes, s.valori_assi, s.scelte_assi],
  );
  const ricalcoloInSospeso = useRef<{
    L: number | null;
    H: number | null;
    Q: number;
    selections: Record<string, string>;
    posaEsclusa: boolean;
  } | null>(null);

  // La scheda della linea scelta (PVC Salamander 76), come nel picker: il
  // valore dell'asse Linea della riga, altrimenti la categoria del prodotto.
  const { indice: schedeLinea } = useSchedeLinea();
  const { categorie } = useListinoCategorie();
  const schedaLinea = useMemo(() => {
    if (!family) return null;
    const categoria = family.categoria_id ? categorie.find((c) => c.id === family.categoria_id) : undefined;
    const linea = lineaDellaRiga({ assi: familyWithAxes?.axes, valoriAssi: s.valori_assi, categoria: categoria?.nome });
    const scheda = trovaSchedaLinea(schedeLinea, family.macrocategoria_id ?? categoria?.macrocategoria_id ?? null, linea);
    return schedaVuota(scheda) ? null : scheda;
  }, [family, familyWithAxes, categorie, s.valori_assi, schedeLinea]);

  /**
   * Ricalcola prezzo unitario in base a L/A/Q correnti + Variabili Prodotto
   * (axes) snapshotted sulla riga. Usa il sistema esistente
   * `calcolaPrezzoFamiglia` (stesso del wizard preventivatore generico).
   *
   * Include: prezzo base (griglia/mq/pz) + maggiorazioni assi (percentuale
   * e fisse mq/ml/pz) + posa inclusa (tariffe). Prima la posa scompariva
   * dal ricalcolo -> margine eroso.
   *
   * PROTEZIONI:
   *   - modalita="griglia" e griglia vuota (loading) -> return null
   *     (prezzo precedente resta finche' griglia non disponibile).
   *   - family completa con axes ancora in loading -> return null.
   */
  const ricalcolaPrezzoUnitario = (
    L: number | null,
    H: number | null,
    Q: number,
    selections?: Record<string, string>,
    posaEsclusaOverride?: boolean,
  ): number | null => {
    if (!family) return null;
    if (family.modalita_prezzo_base === "griglia" && griglia.length === 0) return null;
    // A m² o a griglia senza una delle due misure il prezzo non si calcola:
    // prima restava la sola posa (una finestra a 90 €).
    if ((family.modalita_prezzo_base === "griglia" || family.modalita_prezzo_base === "mq") && (!L || !H)) return null;
    const Qsafe = Q || 1;
    const sels = selections ?? (s.valori_assi ?? {}) as Record<string, string>;
    // Varianti non ancora caricate: il prezzo senza le loro maggiorazioni sarebbe
    // sbagliato (un colore a +15% sparirebbe dal totale). Meglio aspettare.
    if (!familyWithAxes && Object.keys(sels).length > 0) return null;
    // Override per supportare il toggle UI: l'utente cambia il flag e vuole
    // un ricalcolo IMMEDIATO senza aspettare il roundtrip onPatch → DB → re-fetch.
    const posaEsclusa = posaEsclusaOverride ?? s.posa_esclusa ?? false;

    // 1. Prezzo BASE prodotto via la stessa strategia del picker
    //    (calcolaPrezzoProdotto: filter quadrante che contiene le misure,
    //    cella contenente piu' piccola). Source of truth coerente.
    const result = calcolaPrezzoProdotto(family, L, H, Qsafe, griglia, {
      supplierProductLineId: selectedSupplierProductLineId,
      supplierLines: supplierLineMap,
    });
    // Misura fuori dal listino: il prezzo resta quello di prima e la riga lo
    // segnala. Prima diventava zero più la posa, e il totale crollava in silenzio.
    if (result.requiresSupplierLine || result.missingSupplierLinePricing || result.fuoriRange) return null;

    // 2. Maggiorazioni assi (Variabili Prodotto) applicate sopra il prezzo
    //    base. Senza varianti caricate si arriva qui solo se la riga non ha scelte.
    const prezzoProdotto = familyWithAxes
      ? applyMaggiorazioniAssi(result.prezzo, sels, familyWithAxes.axes, L, H, Qsafe)
      : result.prezzo;

    // 3. Posa indipendente (tariffa cantiere, non scala con maggiorazioni).
    //    Se l'utente ha attivato "Escludi manodopera" per questa riga, la
    //    posa NON viene sommata → vendita "solo fornitura".
    const posa = posaEsclusa ? 0 : calcolaPosaInclusa(family, Qsafe, tariffePrezzi);
    const totale = prezzoProdotto + posa;
    return Qsafe > 0 ? totale / Qsafe : totale;
  };

  /**
   * Check live "misure fuori standard" per riga listino con modalità griglia.
   * Espone fuoriRange + range disponibile per alert UI. Senza questo l'utente
   * inseriva misure non producibili e vedeva il prezzo crollare a 0 senza
   * spiegazione.
   */
  const priceCheck = useMemo(() => {
    if (!isFromListino || !family) return null;
    if (family.modalita_prezzo_base !== "griglia") return null;
    if (griglia.length === 0) return null;
    const L = s.larghezza_mm ?? null;
    const H = s.altezza_mm ?? null;
    if (L == null || H == null) return null;
    const r = calcolaPrezzoProdotto(family, L, H, s.quantita ?? 1, griglia, {
      supplierProductLineId: selectedSupplierProductLineId,
      supplierLines: supplierLineMap,
    });
    return {
      fuoriRange: r.fuoriRange === true,
      range: r.range,
      note: r.note,
      requiresSupplierLine: r.requiresSupplierLine === true,
      missingSupplierLinePricing: r.missingSupplierLinePricing === true,
    };
  }, [
    isFromListino,
    family,
    griglia,
    selectedSupplierProductLineId,
    supplierLineMap,
    s.larghezza_mm,
    s.altezza_mm,
    s.quantita,
  ]);

  /**
   * Wrapper che, se la riga è del listino e cambiano L/A/Q, ricalcola anche
   * il prezzo unitario coerente. Fix del bug "modifico larghezza ma prezzo
   * resta vecchio".
   */
  const handleMisurePatch = (patch: Partial<SrSerramentoRow>) => {
    if (!isFromListino) {
      onPatch(patch);
      return;
    }
    if (isListinoManualPrice) {
      onPatch(patch);
      return;
    }
    const next = { ...s, ...patch };
    const L = next.larghezza_mm ?? null;
    const H = next.altezza_mm ?? null;
    const Q = next.quantita ?? 1;
    const nuovoPrezzo = ricalcolaPrezzoUnitario(L, H, Q);
    if (nuovoPrezzo != null && Number.isFinite(nuovoPrezzo)) {
      onPatch({ ...patch, prezzo_unitario: Number(nuovoPrezzo.toFixed(2)) });
    } else {
      if (datiInArrivo) {
        ricalcoloInSospeso.current = {
          L,
          H,
          Q,
          selections: (next.valori_assi ?? {}) as Record<string, string>,
          posaEsclusa: next.posa_esclusa ?? false,
        };
      }
      onPatch(patch);
    }
  };

  /**
   * Cambio di una variabile prodotto (asse) sulla riga BOM esistente.
   * Aggiorna la mappa valori_assi e ricalcola il prezzo unitario con
   * le maggiorazioni della nuova combinazione, lasciando L/A/Q invariati.
   */
  const handleAxisPatch = (axisCodice: string, valueId: string, scelta: string | null = null) => {
    const nextSelections = { ...(s.valori_assi ?? {}), [axisCodice]: valueId };
    // La voce dentro il valore: il colore vero di «Colore Standard».
    const nextScelte = scelteDopo(s.scelte_assi, axisCodice, scelta);
    // Stesso valore, un'altra voce (un altro colore della stessa fascia): il prezzo non cambia.
    if ((s.valori_assi ?? {})[axisCodice] === valueId) {
      onPatch({ scelte_assi: nextScelte });
      return;
    }
    // Prezzo manuale («misura libera»): la scelta si salva e il prezzo resta
    // quello del commerciale. Prima lo sostituiva il prezzo base del listino.
    if (isListinoManualPrice) {
      onPatch({ valori_assi: nextSelections, scelte_assi: nextScelte });
      return;
    }
    const L = s.larghezza_mm ?? null;
    const H = s.altezza_mm ?? null;
    const Q = s.quantita ?? 1;
    const nuovoPrezzo = ricalcolaPrezzoUnitario(L, H, Q, nextSelections);
    if (nuovoPrezzo != null && Number.isFinite(nuovoPrezzo)) {
      onPatch({ valori_assi: nextSelections, scelte_assi: nextScelte, prezzo_unitario: Number(nuovoPrezzo.toFixed(2)) });
    } else {
      if (datiInArrivo) {
        ricalcoloInSospeso.current = { L, H, Q, selections: nextSelections, posaEsclusa: s.posa_esclusa ?? false };
      }
      onPatch({ valori_assi: nextSelections, scelte_assi: nextScelte });
    }
  };

  /**
   * La scelta fatta in cima per tutte le righe arriva qui e passa dallo stesso
   * `handleAxisPatch` del menu singolo: il prezzo si ricalcola con la griglia e
   * le tariffe di QUESTA riga, non con una copia della logica. Se la tipologia
   * non ha quella variante (una tapparella non ha il vetro), non succede nulla.
   */
  const ultimaBulk = useRef<number>(0);
  useEffect(() => {
    if (!richiestaBulk || richiestaBulk.nonce === ultimaBulk.current) return;
    // Varianti ancora in arrivo: la scelta si applica appena arrivano. Prima la
    // richiesta risultava già fatta e la riga restava con la scelta vecchia.
    if (!familyWithAxes) return;
    ultimaBulk.current = richiestaBulk.nonce;
    const asse = familyWithAxes.axes.find((a) => a.codice === richiestaBulk.codice);
    const valore = asse?.values.find((v) => v.valore === richiestaBulk.valore && v.attivo);
    if (!asse || !valore) return;
    // Il colore scelto in cima solo se questa tipologia ce l'ha nell'elenco di quella fascia.
    const scelta = richiestaBulk.scelta && vociDi(valore).includes(richiestaBulk.scelta) ? richiestaBulk.scelta : null;
    if ((s.valori_assi ?? {})[asse.codice] === valore.id && ((s.scelte_assi ?? {})[asse.codice] ?? null) === scelta) return;
    handleAxisPatch(asse.codice, valore.id, scelta);
    // handleAxisPatch dipende da stato che cambia a ogni render: l'effetto deve
    // scattare solo sul nonce, non a ogni ricalcolo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richiestaBulk, familyWithAxes]);

  /**
   * Toggle "Escludi manodopera" — Use case "solo fornitura": cliente fa
   * installare da altro installatore, articolo a ricambio, sconto commerciale.
   * Quando ON, il prezzo unitario viene ricalcolato SENZA sommare la posa
   * configurata sul listino (calcolaPosaInclusa → 0). Quando torna OFF,
   * la posa viene ri-aggiunta. Aggiornamento atomico {posa_esclusa, prezzo_unitario}.
   */
  const handlePosaEsclusaToggle = (escludi: boolean) => {
    const L = s.larghezza_mm ?? null;
    const H = s.altezza_mm ?? null;
    const Q = s.quantita ?? 1;
    // Col prezzo manuale la posa è un'informazione: il prezzo non si tocca.
    const nuovoPrezzo = isListinoManualPrice ? null : ricalcolaPrezzoUnitario(L, H, Q, undefined, escludi);
    if (isFromListino && nuovoPrezzo != null && Number.isFinite(nuovoPrezzo)) {
      onPatch({
        posa_esclusa: escludi,
        prezzo_unitario: Number(nuovoPrezzo.toFixed(2)),
      });
    } else {
      if (isFromListino && !isListinoManualPrice && datiInArrivo) {
        ricalcoloInSospeso.current = {
          L,
          H,
          Q,
          selections: (s.valori_assi ?? {}) as Record<string, string>,
          posaEsclusa: escludi,
        };
      }
      onPatch({ posa_esclusa: escludi });
    }
  };

  // «Tutti con posa» / «Solo fornitura» dalla barra in cima: stesso ricalcolo del
  // toggle della riga, così il prezzo perde o riprende la posa insieme al segno.
  const ultimaBulkPosa = useRef<number>(0);
  useEffect(() => {
    if (!richiestaBulkPosa || richiestaBulkPosa.nonce === ultimaBulkPosa.current) return;
    ultimaBulkPosa.current = richiestaBulkPosa.nonce;
    if ((s.posa_esclusa ?? false) === richiestaBulkPosa.esclusa) return;
    handlePosaEsclusaToggle(richiestaBulkPosa.esclusa);
    // Come per le variabili: l'effetto scatta solo sul nonce della richiesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richiestaBulkPosa]);

  // Il ricalcolo chiesto mentre griglia o varianti erano in arrivo si rifà
  // appena arrivano, con misure e scelte di quel momento. Prima il prezzo
  // restava quello vecchio accanto alle misure o al colore nuovi.
  useEffect(() => {
    const attesa = ricalcoloInSospeso.current;
    if (!attesa || datiInArrivo) return;
    ricalcoloInSospeso.current = null;
    const nuovo = ricalcolaPrezzoUnitario(attesa.L, attesa.H, attesa.Q, attesa.selections, attesa.posaEsclusa);
    if (nuovo == null || !Number.isFinite(nuovo)) return;
    onPatch({
      larghezza_mm: attesa.L,
      altezza_mm: attesa.H,
      quantita: attesa.Q,
      valori_assi: attesa.selections,
      posa_esclusa: attesa.posaEsclusa,
      prezzo_unitario: Number(nuovo.toFixed(2)),
    });
    // Scatta solo quando i dati arrivano: il ricalcolo usa la richiesta salvata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datiInArrivo]);

  // Posa configurata sull'articolo? (per decidere se mostrare il toggle).
  // Se la family non ha manodopera (modalita="nessuna" o null), il toggle
  // non ha senso → lo nascondiamo del tutto per non confondere.
  const hasPosaConfigured =
    !!family &&
    family.manodopera_modalita != null &&
    family.manodopera_modalita !== "nessuna";

  return (
    <Card className="border-orange-100">
      <CardHeader className="p-3 hover:bg-orange-50/30">
        <CardTitle className="flex items-start gap-2 text-sm">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-start gap-x-2 gap-y-1 text-left"
            aria-expanded={expanded}
          >
            <span className="h-6 w-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[11px] font-bold shrink-0">
              {index + 1}
            </span>
            <span className="min-w-[190px] flex-1">
              {/* Breadcrumb: Macrocategoria > Articolo. La macro viene
                  visualizzata in stile pillola/uppercase per gerarchia. */}
              {macroNome && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 mr-1.5">
                  {macroNome}
                </span>
              )}
              {tipoLabel}
              {matLabel && <span className="text-muted-foreground font-normal"> · {matLabel}</span>}
              {s.serie && <span className="text-muted-foreground font-normal"> · {s.serie}</span>}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              ×{s.quantita}
            </span>
            {s.larghezza_mm && s.altezza_mm && (
              <span className="text-[11px] font-normal text-muted-foreground">
                {s.larghezza_mm}×{s.altezza_mm} mm
              </span>
            )}
            {mq > 0 && (
              <span className="text-[11px] font-normal text-orange-600">
                {formatNumero(mq, 2)} m²
              </span>
            )}
            {/* Distingue 3 stati di prezzo nell'header riga:
                  1. Omaggio: prezzo=0 + nota OMAGGIO -> badge verde
                  2. Prezzo OK (>0): mostra cifra arancione
                  3. Prezzo mancante (off-listino non valorizzato):
                     warning ambra "Prezzo da impostare" */}
            {/* Detection omaggio STRETTA: confronto su prefisso esatto
                "🎁 OMAGGIO" salvato da ManualAddDialog. Prima usavamo
                `includes` -> falsi positivi su note libere con emoji 🎁
                o parola "OMAGGIO" inserita dall'utente per altro motivo. */}
            {s.note?.startsWith("🎁 OMAGGIO") && (s.prezzo_totale ?? 0) === 0 ? (
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                🎁 Omaggio
              </span>
            ) : s.prezzo_totale ? (
              <span className="font-semibold text-orange-600 tabular-nums">{formatEuro(s.prezzo_totale)}</span>
            ) : (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                Prezzo da impostare
              </span>
            )}
            {/* Badge modalita' prezzo: spiega all'utente quando il prezzo
                cambia (a m² / da griglia) e quando NO (a pezzo / a corpo).
                Senza, modificare L/H su un articolo "a pezzo" sembrava
                un bug ("ho cambiato la larghezza ma il prezzo non cambia"). */}
            {modalitaPrezzo === "pz" && (
              <span className="text-[9px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                a pezzo (prezzo fisso)
              </span>
            )}
            {modalitaPrezzo === "mq" && (
              <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                a m²
              </span>
            )}
            {modalitaPrezzo === "griglia" && (
              <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                da griglia
              </span>
            )}
            {/* MISURE FUORI STANDARD: blocco visivo se la combinazione L×H
                inserita non rientra nel range producibile dalla griglia.
                Senza questo badge l'utente vedeva il prezzo crollare a 0
                senza capirne il motivo. */}
            {priceCheck?.fuoriRange && (
              <span
                className="text-[9px] font-semibold text-rose-700 bg-rose-100 border border-rose-300 rounded px-1.5 py-0.5 inline-flex items-center gap-1"
                title={priceCheck.note ?? "Misure non in griglia listino"}
              >
                ⚠ MISURE FUORI STANDARD
              </span>
            )}
            {(priceCheck?.requiresSupplierLine || priceCheck?.missingSupplierLinePricing) && (
              <span
                className="text-[9px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 inline-flex items-center gap-1"
                title={priceCheck.note ?? "Linea fornitore richiesta per il ricalcolo"}
              >
                ⚠ LINEA FORNITORE
              </span>
            )}
            {/* BADGE "SOLO FORNITURA" — visibile quando il commerciale ha
                escluso la manodopera per questa riga. Evita confusione in
                fase di firma: il cliente capisce a colpo d'occhio che la
                posa NON e' inclusa nel preventivo per questo articolo. */}
            {s.posa_esclusa && hasPosaConfigured && (
              <span className="text-[9px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                ⊘ Solo fornitura (no posa)
              </span>
            )}
            {modalitaPrezzo === "misura_libera" && (
              <span className="text-[9px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                a corpo
              </span>
            )}
            {isManualCorpo && (
              <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                importo a corpo
              </span>
            )}
            {testoComplementi && (
              <span className="text-[10px] font-medium text-orange-800 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                con {testoComplementi}
              </span>
            )}
          </button>

          {/* Azioni rapide: duplica + elimina sempre visibili (no toggle) */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon" variant="ghost"
              onClick={onDuplicate}
              className="h-8 w-8"
              title="Duplica posizione"
            >
              <Copy className="h-4 w-4 text-slate-500" />
            </Button>
            <Button
              size="icon" variant="ghost"
              onClick={onDelete}
              className="h-8 w-8"
              title="Elimina posizione"
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="grid grid-cols-12 gap-3 border-t p-3 pt-0 sm:gap-2">
          {/* Tipologia editabile SOLO off-listino. Per le righe da listino
              la "tipologia" coincide con il nome dell'articolo (gia' nella
              riga 1 dell'header) -> il dropdown sarebbe ridondante e
              confondente (es. articolo "PORTA BALCONE 1 ANTA" mostrava la
              dropdown delle tipologie generiche). */}
          {isFromListino ? (
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs text-muted-foreground">Articolo (da listino)</Label>
              <div className="h-9 rounded-md border bg-slate-50 border-slate-200 px-3 flex items-center text-xs font-medium text-slate-800 truncate">
                {family?.nome ?? s.tipologia_label ?? "—"}
              </div>
            </div>
          ) : (
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Nome voce manuale</Label>
              <Input
                defaultValue={s.tipologia_label ?? ""}
                onBlur={(e) => onPatch({ tipologia_label: e.target.value.trim() || "Voce manuale" })}
                placeholder="Es. Fornitura infissi a corpo, Davanzale extra..."
                className="h-9 text-xs"
              />
            </div>
          )}
          <div className="col-span-12 md:col-span-6">
            <Label className="text-xs">Ambiente</Label>
            <Input
              defaultValue={s.ambiente ?? ""}
              onBlur={(e) => onPatch({ ambiente: e.target.value || null })}
              placeholder="Soggiorno / Cucina / ..."
              className="h-9 text-xs"
            />
          </div>
          {/* Scheda tecnica auto-popolata se la riga è da listino. Read-only:
              le caratteristiche intrinseche del modello (materiale profilo, vetro,
              Uw…) non si modificano qui ma in Listino → Articolo. */}
          {isFromListino && macroId && family && Object.keys(family.custom_field_values ?? {}).length > 0 && (
            <div className="col-span-12">
              <div className="rounded-md border border-orange-100 bg-orange-50/40 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-orange-600 font-semibold mb-1.5 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Caratteristiche da listino
                </div>
                <DynamicFieldsRenderer
                  macroId={macroId}
                  values={family.custom_field_values ?? {}}
                  mode="display"
                />
              </div>
            </div>
          )}

          {/* Variabili Prodotto editabili: dropdown per ogni asse con i
              valori configurati a listino. Cambiando una scelta, il prezzo
              unitario si aggiorna in automatico applicando le maggiorazioni
              (es. cambio Profilo da Etrum 70 a Etrum 82 +€30/m²). */}
          {isFromListino && familyWithAxes && familyWithAxes.axes.length > 0 && (
            <div className="col-span-12">
              <div className="rounded-md border border-blue-100 bg-blue-50/40 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-blue-800 font-semibold mb-2">
                  Variabili Prodotto
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {familyWithAxes.axes
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((axis) => {
                      const currentId = (s.valori_assi ?? {})[axis.codice] ?? "";
                      const isMissing = axis.obbligatorio && !currentId;
                      return (
                        <div key={axis.id} className="space-y-1">
                          <Label className={
                            "text-[10px] flex items-center gap-1 " +
                            (isMissing ? "text-rose-700 font-semibold" : "text-slate-700")
                          }>
                            {axis.nome}
                            {axis.obbligatorio && <span className="text-rose-500">*</span>}
                          </Label>
                          {/* I valori del listino e, dentro le fasce con un elenco, il
                              colore vero. Anche il valore scelto e poi spento nel listino
                              resta: senza, la riga sembrava senza scelta pur avendola nel prezzo. */}
                          <SceltaVariante
                            values={axis.values}
                            valueId={currentId}
                            scelta={(s.scelte_assi ?? {})[axis.codice]}
                            onChange={(valueId, scelta) => handleAxisPatch(axis.codice, valueId, scelta)}
                            mostraStandard
                            aria-label={axis.nome}
                            className={"h-8 text-xs bg-white " + (isMissing ? "border-rose-300" : "")}
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {schedaLinea && (
            <div className="col-span-12">
              <SchedaLineaCompatta scheda={schedaLinea} />
            </div>
          )}

          {/* Materiale / Serie / Vetro: editabili solo se la riga è "off-listino"
              (aggiunta a mano). Per le righe dal listino, sono già definite
              dalla scheda tecnica e ridondanti. */}
          {!isFromListino && (
            <div className="col-span-12 -mb-1">
              <p className="text-[10px] text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 leading-tight">
                <span className="font-semibold">{isManualCorpo ? "Importo a corpo:" : "Voce fuori listino:"}</span>{" "}
                questo prezzo è salvato solo nel preventivo e non modifica il listino aziendale.
                {!isManualCorpo && " Se vuoi grafica/foto nel PDF, collega una macrocategoria qui sotto."}
              </p>
            </div>
          )}

          {!isFromListino && !isManualCorpo && (
            <>
              {/* Macrocategoria override — permette di collegare un BOM manuale
                  ad una macrocategoria del listino. Nel PDF carica così la foto
                  prodotto + la pagina dedicata (se la macro ha mostra_pagina=true). */}
              <MacroOverrideSelect
                value={s.macrocategoria_override_id}
                onChange={(v) => onPatch({ macrocategoria_override_id: v })}
              />
              <div className="col-span-12 sm:col-span-6 md:col-span-4">
                <Label className="text-xs">Materiale</Label>
                <Select
                  value={s.materiale ?? ""}
                  onValueChange={(v) => onPatch({ materiale: v as SrMaterialePrincipale })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Scegli..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SR_MATERIALI.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6 md:col-span-4">
                <Label className="text-xs">Serie</Label>
                <Input
                  defaultValue={s.serie ?? ""}
                  onBlur={(e) => onPatch({ serie: e.target.value || null })}
                  placeholder="es. Serie 90"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-12 md:col-span-4">
                <Label className="text-xs flex items-center gap-1">
                  Vetro
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-orange-600">
                          <HelpCircle className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs font-semibold mb-1">Tipologie di vetro più comuni</p>
                        <ul className="text-[11px] space-y-1">
                          <li>• <strong>Vetrocamera basso-emissiva</strong>: 4-16-4 con argon (standard moderno)</li>
                          <li>• <strong>Triplo vetro</strong>: 4-16-4-16-4 per massimo isolamento (Uw 0.8)</li>
                          <li>• <strong>Stratificato di sicurezza</strong>: 3+3 mm con PVB (antieffrazione RC2)</li>
                          <li>• <strong>Acustico</strong>: spessori asimmetrici 6-12-44.1 (fino a 42 dB Rw)</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  defaultValue={s.vetro ?? ""}
                  onBlur={(e) => onPatch({ vetro: e.target.value || null })}
                  placeholder="es. Vetrocamera basso-emissiva"
                  className="h-9 text-xs"
                />
              </div>
            </>
          )}

          {/* Note: `key` rimossa dagli input numerici sotto. Prima la key
              includeva il valore corrente del campo → ad ogni patch l'input si
              re-montava, perdendo focus e caret. Ora usiamo `key={s.id}-*` solo
              dove serve un reset cross-record (cambio serramento), così il
              caret resta dove l'utente sta scrivendo. */}
          {/* Hint contestuale per articoli a prezzo fisso (pz / corpo):
              spiega all'utente che L/H sono solo descrittive e non
              influenzano il prezzo. Senza, l'utente cambiava larghezza
              e si chiedeva "come mai il prezzo non si aggiorna?". */}
          {isFromListino && (modalitaPrezzo === "pz" || modalitaPrezzo === "misura_libera") && (
            <div className="col-span-12 -mb-1">
              <p className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                {isListinoManualPrice ? (
                  <>
                    <span className="font-semibold">Prezzo manuale:</span> questo articolo nasce dal listino, ma il prezzo vendita si inserisce sul preventivo.
                    Le misure restano descrittive e non aggiornano l'importo.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Prezzo fisso:</span> questo articolo del listino e' venduto a pezzo.
                    Larghezza e altezza sono indicative e non modificano il prezzo unitario.
                  </>
                )}
              </p>
            </div>
          )}
          {/* Alert "MISURE FUORI STANDARD": esplicativo + actionable. Si
              mostra solo quando lo stato priceCheck.fuoriRange è true (modalità
              griglia + L×H fuori range producibile). Indica chiaramente il
              range disponibile per guidare l'utente a una correzione. */}
          {isFromListino && priceCheck?.fuoriRange && priceCheck.range && (
            <div className="col-span-12 -mb-1">
              <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5 leading-tight">
                <span className="font-semibold">⚠ Misure fuori standard:</span> queste misure non sono producibili da listino.
                {priceCheck.range.minL != null && priceCheck.range.maxL != null && priceCheck.range.minH != null && priceCheck.range.maxH != null && (
                  <>
                    {" "}Range disponibile: <strong>{priceCheck.range.minL}×{priceCheck.range.minH} mm</strong> → <strong>{priceCheck.range.maxL}×{priceCheck.range.maxH} mm</strong>.
                  </>
                )}
                {" "}Il prezzo resta quello di prima: riduci le misure o contatta il fornitore per una lavorazione speciale.
              </p>
            </div>
          )}
          {!isManualCorpo && (
            <>
              <div className="col-span-12 sm:col-span-4 md:col-span-3">
                <Label className="text-xs">Largh. (mm)</Label>
                <Input
                  type="number"
                  key={`L-${s.id}`}
                  defaultValue={s.larghezza_mm ?? ""}
                  onBlur={(e) => {
                    const mm = misuraDaTesto(e.target.value);
                    const salvata = s.larghezza_mm ?? null;
                    // Non valida torna quella salvata; uguale non ricalcola, che
                    // riporterebbe il prezzo al listino di oggi.
                    e.target.value = String((mm === undefined ? salvata : mm) ?? "");
                    if (mm !== undefined && mm !== salvata) handleMisurePatch({ larghezza_mm: mm });
                  }}
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-12 sm:col-span-4 md:col-span-3">
                <Label className="text-xs">Altezza (mm)</Label>
                <Input
                  type="number"
                  key={`H-${s.id}`}
                  defaultValue={s.altezza_mm ?? ""}
                  onBlur={(e) => {
                    const mm = misuraDaTesto(e.target.value);
                    const salvata = s.altezza_mm ?? null;
                    e.target.value = String((mm === undefined ? salvata : mm) ?? "");
                    if (mm !== undefined && mm !== salvata) handleMisurePatch({ altezza_mm: mm });
                  }}
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-12 sm:col-span-4 md:col-span-2">
                <Label className="text-xs">Quantità</Label>
                <Input
                  type="number"
                  min={1}
                  key={`Q-${s.id}`}
                  defaultValue={s.quantita}
                  onBlur={(e) => {
                    const pezzi = quantitaDaTesto(e.target.value) ?? s.quantita;
                    e.target.value = String(pezzi);
                    if (pezzi !== s.quantita) handleMisurePatch({ quantita: pezzi });
                  }}
                  className="h-9 text-xs"
                />
              </div>
            </>
          )}
          <div className={isManualCorpo ? "col-span-12 md:col-span-6" : "col-span-12 md:col-span-4"}>
            <Label className="text-xs flex items-center justify-between">
              <span>
                {isManualCorpo
                  ? "Importo vendita totale (€)"
                  : isListinoManualPrice
                    ? "Prezzo manuale vendita (€)"
                    : "Prezzo unitario (€)"}
              </span>
              {isFromListino && !isListinoManualPrice && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-orange-200 bg-orange-50 text-orange-600">
                  da listino · auto
                </Badge>
              )}
              {isListinoManualPrice && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-indigo-200 bg-indigo-50 text-indigo-700">
                  manuale
                </Badge>
              )}
            </Label>
            {/* Prezzo unitario:
                - off-listino / a corpo: editabile sul singolo preventivo
                - listino automatico: read-only e ricalcolato da L/A/Q
                - listino misura_libera: editabile per preventivi senza prezzo
                  tabellare, ma sempre collegato alla scheda listino. */}
            <Input
              type="number"
              step="0.01"
              key={`P-${s.id}-${s.prezzo_unitario ?? ""}`}
              defaultValue={s.prezzo_unitario ?? ""}
              onBlur={(e) => {
                if (isFromListino && !isListinoManualPrice) return; // read-only per listino automatico
                const nextPrice = e.target.value ? Number(e.target.value) : null;
                if (isManualCorpo) {
                  onPatch({ prezzo_unitario: nextPrice, quantita: 1 });
                  return;
                }
                onPatch({ prezzo_unitario: nextPrice });
              }}
              readOnly={isFromListino && !isListinoManualPrice}
              tabIndex={isFromListino && !isListinoManualPrice ? -1 : undefined}
              className={
                "h-9 text-xs " +
                (isFromListino && !isListinoManualPrice ? "bg-slate-50 cursor-not-allowed text-slate-700" : "")
              }
              title={isFromListino && !isListinoManualPrice
                ? "Calcolato automaticamente dalla griglia del listino in base a larghezza/altezza/quantita'."
                : ""}
            />
          </div>

          {/* TOGGLE "INCLUDI MANODOPERA" — visibile SOLO se la family ha
              effettivamente una manodopera configurata (modalita != nessuna).
              Default ON = posa inclusa nel prezzo (comportamento standard).
              OFF = solo fornitura, prezzo unitario ricalcolato sottraendo
              automaticamente la quota posa. Cambio prezzo immediato senza
              roundtrip DB. */}
          {hasPosaConfigured && (
            <div className="col-span-12">
              <div className={
                "rounded-md border px-3 py-2 flex items-center justify-between gap-3 " +
                (s.posa_esclusa
                  ? "bg-amber-50 border-amber-200"
                  : "bg-emerald-50/40 border-emerald-200")
              }>
                <div className="min-w-0 flex-1">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    {s.posa_esclusa ? "⊘ Solo fornitura" : "🔧 Manodopera inclusa"}
                  </Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {s.posa_esclusa
                      ? "Il cliente dovrà occuparsi della posa di questo articolo. Il prezzo unitario non include manodopera."
                      : family?.manodopera_modalita === "tariffa"
                        ? "Manodopera applicata dalla tariffa configurata sull'articolo del listino."
                        : "Manodopera applicata dall'importo fisso configurato sull'articolo del listino."}
                  </p>
                </div>
                <Switch
                  checked={!s.posa_esclusa}
                  onCheckedChange={(checked) => handlePosaEsclusaToggle(!checked)}
                  aria-label="Includi manodopera per questo articolo"
                />
              </div>
            </div>
          )}

          {/* Colore interno/esterno: vuoti, il PDF scrive quelli della variante
              «Colore» (lo stesso sui due lati, o bianco dentro con la pellicola su
              un lato) e il segnaposto li mostra. Si scrivono solo quando sono
              diversi, per esempio una finestra bicolore o una riga fuori listino. */}
          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <Label className="text-xs">Colore interno</Label>
            <SceltaColore
              value={s.colore_interno}
              onChange={(valore) => {
                if (valore !== (s.colore_interno ?? null)) onPatch({ colore_interno: valore });
              }}
              gruppi={gruppiDiColori}
              placeholder={coloriDaVariante.coloreInterno ?? "Bianco RAL 9010"}
              aria-label="Colore interno"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <Label className="text-xs">Colore esterno</Label>
            <SceltaColore
              value={s.colore_esterno}
              onChange={(valore) => {
                if (valore !== (s.colore_esterno ?? null)) onPatch({ colore_esterno: valore });
              }}
              gruppi={gruppiDiColori}
              placeholder={coloriDaVariante.coloreEsterno ?? "Antracite RAL 7016"}
              aria-label="Colore esterno"
            />
          </div>
          {complementi && <div className="col-span-12">{complementi}</div>}
          {/* Duplica/Elimina sono ora sempre visibili nell'header (icone) —
              evitiamo bottoni duplicati nel dettaglio espanso. */}
        </CardContent>
      )}
    </Card>
  );
}

// ─── MacroOverrideSelect ─────────────────────────────────────────────────────
//
// Select per assegnare manualmente una macrocategoria del listino a un BOM
// creato manualmente. Nel PDF questo abilita:
//   - foto prodotto dalla macro (fallback automatico)
//   - pagina dedicata macrocategoria (se la macro ha mostra_pagina_dedicata_pdf)
//
// Solo macro attive vengono mostrate. Lo "Nessuna" rimuove l'override.

function MacroOverrideSelect({
  value, onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { data: macros = [] } = useListinoMacrocategorie();
  const macrosAttive = macros.filter((m: any) => m.attivo);
  return (
    <div className="col-span-12">
      <div className="rounded-md border border-dashed border-slate-200 bg-muted/20 p-2.5">
        <Label className="text-[11px] flex items-center justify-between mb-1.5">
          <span className="font-semibold">
            Collega a una macrocategoria del listino{" "}
            <span className="text-muted-foreground font-normal">(opzionale)</span>
          </span>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[10px] text-rose-600 hover:underline"
            >
              Rimuovi
            </button>
          )}
        </Label>
        <Select
          value={value ?? "__none__"}
          onValueChange={(v) => onChange(v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Nessuna" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs italic text-muted-foreground">
              Nessuna macrocategoria
            </SelectItem>
            {macrosAttive.map((m: any) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.nome}
                {m.mostra_pagina_dedicata_pdf && (
                  <span className="ml-1.5 text-[9px] text-orange-600">+ pagina PDF</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground mt-1">
          Nel PDF caricherà <strong>foto prodotto</strong> e, se la macro ha la
          pagina dedicata attiva, anche la sua <strong>scheda descrittiva</strong>.
        </p>
      </div>
    </div>
  );
}


// ─── Dialog "Aggiungi a mano" ────────────────────────────────────────────────
//
// Form libero per voci off-listino: il commerciale inserisce manualmente
// nome, descrizione, quantita' e prezzo. Supporta due casi distinti:
// prodotto fuori listino (qta x prezzo unitario) e importo a corpo (totale
// libero del preventivo). Toggle "Omaggio/Regalo" forza il prezzo a 0 e
// aggiunge marcatore visivo nella riga BOM (badge verde).
//
// Use case tipici:
//   - "Sostituzione vetro singolo" (servizio one-off)
//   - "Davanzale incluso gratis" (omaggio commerciale)
//   - "Sopralluogo extra" (voce custom)
//   - "Stipite supplementare" (componente fuori catalogo)

function ManualAddDialog({
  open, onOpenChange, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: {
    mode: ManualPricingMode;
    nome: string;
    descrizione: string;
    quantita: number;
    prezzo_unitario: number;
    isOmaggio: boolean;
  }) => void;
  submitting: boolean;
}) {
  const [mode, setMode] = useState<ManualPricingMode>("prodotto");
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [prezzo, setPrezzo] = useState("");
  const [isOmaggio, setIsOmaggio] = useState(false);
  // Condizioni regalo: testo libero che appare SOLO se isOmaggio=true.
  // Use case: "Solo con ordine > 5000 €", "Valido fino al 31/12",
  // "Sostituzione gratuita primo guasto in 24 mesi", ecc.
  // Viene concatenato nelle note della riga BOM dopo "🎁 OMAGGIO" cosi'
  // l'utente puo' rileggerle e il PDF puo' stamparle.
  const [condizioniRegalo, setCondizioniRegalo] = useState("");

  // Reset form alla chiusura del dialog (evita pre-fill con valori vecchi
  // al prossimo apri).
  useEffect(() => {
    if (!open) {
      setMode("prodotto");
      setNome("");
      setDescrizione("");
      setQuantita("1");
      setPrezzo("");
      setIsOmaggio(false);
      setCondizioniRegalo("");
    }
  }, [open]);

  const quantitaValida = mode === "corpo" || Number(quantita) > 0;
  const isValid = nome.trim().length > 0 && quantitaValida;

  const handleSubmit = () => {
    if (!isValid) return;
    // Se omaggio + condizioni: prepend "Condizioni: <testo>" alla
    // descrizione cosi' arriva fino alle note (vedi handleManualSubmit
    // che concatena descrizione dopo "🎁 OMAGGIO").
    const descrizioneFinale = isOmaggio && condizioniRegalo.trim()
      ? `Condizioni: ${condizioniRegalo.trim()}${descrizione.trim() ? " · " + descrizione.trim() : ""}`
      : descrizione.trim();
    onSubmit({
      mode,
      nome: nome.trim(),
      descrizione: descrizioneFinale,
      quantita: mode === "corpo" ? 1 : Math.max(1, Number(quantita) || 1),
      prezzo_unitario: isOmaggio ? 0 : (Number(prezzo) || 0),
      isOmaggio,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-orange-600" />
            Aggiungi voce manuale
          </DialogTitle>
          <DialogDescription className="text-xs">
            Usa questa opzione per prodotti fuori listino o preventivi a corpo. Il prezzo resta salvato solo su questo preventivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("prodotto")}
              className={
                "rounded-md border px-3 py-2 text-left transition-colors " +
                (mode === "prodotto"
                  ? "border-orange-300 bg-orange-50 text-orange-900"
                  : "border-slate-200 bg-white hover:bg-slate-50")
              }
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Package className="h-3.5 w-3.5" /> Prodotto fuori listino
              </span>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                Quantità × prezzo unitario
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("corpo")}
              className={
                "rounded-md border px-3 py-2 text-left transition-colors " +
                (mode === "corpo"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-950"
                  : "border-slate-200 bg-white hover:bg-slate-50")
              }
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="h-3.5 w-3.5" /> Importo a corpo
              </span>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                Totale libero, senza listino
              </span>
            </button>
          </div>

          <div>
            <Label className="text-xs">{mode === "corpo" ? "Titolo importo a corpo *" : "Nome prodotto / voce *"}</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={mode === "corpo" ? "Es. Fornitura e posa serramenti a corpo" : "Es. Davanzale in marmo, Sopralluogo extra..."}
              className="h-9"
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs">Descrizione (opzionale)</Label>
            <Textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Dettagli aggiuntivi che compariranno nelle note"
              rows={2}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mode === "prodotto" ? (
              <div>
                <Label className="text-xs">Quantità *</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  className="h-9"
                />
              </div>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground">Quantità</Label>
                <div className="h-9 rounded-md border bg-slate-50 px-3 flex items-center text-xs text-slate-700">
                  1 importo unico
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs flex items-center justify-between">
                <span>{mode === "corpo" ? "Importo totale (€)" : "Prezzo unitario (€)"}</span>
                {isOmaggio && <span className="text-[10px] text-emerald-700 font-semibold">In omaggio</span>}
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={isOmaggio ? "0" : prezzo}
                onChange={(e) => setPrezzo(e.target.value)}
                disabled={isOmaggio}
                placeholder="0,00"
                className={"h-9 " + (isOmaggio ? "bg-emerald-50 text-emerald-800" : "")}
              />
            </div>
          </div>

          {mode === "corpo" && !isOmaggio && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900 leading-relaxed">
              <Euro className="h-3.5 w-3.5 inline mr-1 align-[-2px]" />
              Perfetto quando l'azienda non ha ancora caricato il listino o vuole quotare una lavorazione unica.
              Il margine potrà essere verificato meglio quando verranno inseriti costi o listino.
            </div>
          )}

          {/* Toggle Regalo/Omaggio: forza prezzo a 0, badge dedicato sul BOM.
              Quando attivo si espande con campo "Condizioni regalo" per
              dettagliare l'offerta commerciale (es. "solo con ordine
              > 5000 €", "valido fino al 31/12"). */}
          <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 shrink-0 text-emerald-700" />
                <div>
                  <p className="text-xs font-semibold text-emerald-900">Regalo / Omaggio</p>
                  <p className="text-[10px] text-emerald-700/80">Prezzo forzato a 0. Comparira' con badge "Omaggio".</p>
                </div>
              </div>
              <Switch checked={isOmaggio} onCheckedChange={setIsOmaggio} />
            </div>
            {isOmaggio && (
              <div className="pl-6 pt-1 border-t border-emerald-200/50">
                <Label className="text-[11px] text-emerald-900 font-semibold">
                  Condizioni regalo (opzionale)
                </Label>
                <Textarea
                  value={condizioniRegalo}
                  onChange={(e) => setCondizioniRegalo(e.target.value)}
                  placeholder="Es. Valido solo con ordine completo · Spedizione gratuita inclusa · Sostituzione 24 mesi"
                  rows={2}
                  className="text-xs bg-white"
                />
                <p className="text-[10px] text-emerald-700/80 mt-1">
                  Comparira' nelle note della riga e nel PDF cliente.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {/* Hint contestuale: spiega all'utente perche' il bottone "Aggiungi"
              e' disabled. Senza, l'utente cliccca senza capire. */}
          {!isValid && (
            <p className="text-[11px] text-amber-700 flex-1 text-left">
              {nome.trim().length === 0
                ? "Inserisci almeno il nome della voce."
                : "Quantita' deve essere almeno 1."}
            </p>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting} className="w-full sm:w-auto">
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="w-full gap-1 bg-orange-500 hover:bg-orange-600 sm:w-auto"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Aggiungi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
