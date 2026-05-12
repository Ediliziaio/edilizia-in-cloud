/**
 * StepBom — Step 4 wizard: composizione serramenti (BOM).
 *
 * Tabella editabile: tipologia, materiale, vetro, misure, quantità, prezzo.
 * Aggiungi/duplica/elimina riga. Import da sopralluogo Infissi v6 (Wave 4).
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RectangleVertical, Plus, Trash2, Copy, Loader2, Upload, HelpCircle, Package, Sparkles } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ListinoPickerDialog, type ListinoPickResult, calcolaPrezzoProdotto, calcolaPosaInclusa } from "./ListinoPickerDialog";
import { useFamily } from "@/hooks/useFamilies";
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
import { ServiziSection } from "./ServiziSection";
import { AccessoriSection } from "./AccessoriSection";
import {
  useAddSerramento, useUpdateSerramento, useDeleteSerramento, useImportDaSopralluogo,
  useListinoFamiliesByIds, useListinoGriglia, useTariffeManodopera,
} from "@/lib/serramenti/queries";
import { useListinoMacrocategorie } from "@/hooks/useListinoMacrocategorie";
import {
  SR_TIPOLOGIE_SERRAMENTO, SR_MATERIALI,
} from "@/types/serramenti";
import type { SrProgettoDetail, SrSerramentoRow, SrMaterialePrincipale } from "@/types/serramenti";
import { calcolaM2 } from "@/lib/serramenti/calcoli";
import { SrCard, SrCallout, formatEuro } from "@/lib/serramenti/wizardUI";
import type { ListinoFamily } from "@/lib/serramenti/api";
import { DynamicFieldsRenderer } from "@/components/listino/DynamicFieldsRenderer";
import { useListinoCategorie } from "@/hooks/useListinoCategorie";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

export function StepBom({ progettoId, detail }: Props) {
  const addMut = useAddSerramento(progettoId);
  const updateMut = useUpdateSerramento(progettoId);
  const deleteMut = useDeleteSerramento(progettoId);
  const importMut = useImportDaSopralluogo(progettoId);
  const [toDelete, setToDelete] = useState<SrSerramentoRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [listinoOpen, setListinoOpen] = useState(false);
  // Conferma import sopralluogo: invece di `confirm()` nativo (UX scadente,
  // bloccante, brutto su mobile) usiamo un AlertDialog gestito.
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const serramenti = detail.serramenti;

  // Pre-fetch SOLO le famiglie referenziate dalle righe BOM correnti.
  // useListinoFamilies() senza parametri ritornava LIMIT 100 → se l'utente
  // aveva 200 articoli e la riga referenziava una family oltre i primi
  // 100 ordine alfabetico, `family` era undefined → la riga appariva come
  // "off-listino" mostrando i campi Materiale/Serie/Vetro/Colore (bug
  // segnalato dall'utente: "non dovrebbero esserci").
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
  const { data: macrosAll = [] } = useListinoMacrocategorie();
  const macroIdToNome = useMemo(() => {
    const m = new Map<string, string>();
    macrosAll.forEach((mc) => m.set(mc.id, mc.nome));
    return m;
  }, [macrosAll]);

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
        valori_assi: item.valori_assi ?? {},
        note: item.note ?? `Da listino: ${item.family_nome}`,
      },
      { onSuccess: (created) => setExpanded(created.id) },
    );
  };

  const handleAdd = () => {
    addMut.mutate(
      {
        tipologia: "finestra_2ante",
        tipologia_label: "Finestra a 2 ante",
        materiale: detail.progetto.materiale_principale ?? "alluminio",
        quantita: 1,
        position: serramenti.length,
      },
      {
        onSuccess: (created) => setExpanded(created.id),
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
      macrocategoria_override_id: s.macrocategoria_override_id,
      valori_assi: s.valori_assi ?? {},
      position: serramenti.length,
      note: s.note,
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
  };

  return (
    <div className="space-y-3">
      <SrCard
        title="Composizione offerta"
        description="Costruisci l'offerta con i pezzi del tuo listino. I prezzi vengono dal listino aziendale — modificabili per ogni preventivo."
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

        {/* Bottoni di aggiunta — sempre visibili */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <Button
            onClick={() => setListinoOpen(true)}
            className="flex-1 bg-orange-500 hover:bg-orange-600 gap-1"
            disabled={addMut.isPending}
          >
            <Package className="h-4 w-4" /> Aggiungi dal listino
          </Button>
          <Button
            onClick={handleAdd}
            variant="outline"
            className="flex-1 gap-1"
            disabled={addMut.isPending}
          >
            <Plus className="h-4 w-4" /> Aggiungi a mano (off-listino)
          </Button>
        </div>

        {serramenti.length === 0 ? (
          <div className="border-2 border-dashed border-orange-200 rounded-md p-6 text-center">
            <RectangleVertical className="h-8 w-8 mx-auto text-orange-300 mb-2" />
            <p className="text-sm text-muted-foreground">
              Nessun serramento ancora. Usa <strong>"Aggiungi dal listino"</strong> per scegliere da catalogo (consigliato) o aggiungi a mano per casi speciali.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {serramenti.map((s, idx) => {
              const family = s.family_id ? familiesById.get(s.family_id) : undefined;
              const macroId = family?.categoria_id ? catToMacro.get(family.categoria_id) : undefined;
              const macroNome = macroId ? macroIdToNome.get(macroId) : undefined;
              return (
                <SerramentoRow
                  key={s.id}
                  serramento={s}
                  index={idx}
                  expanded={expanded === s.id}
                  onToggle={() => setExpanded((prev) => prev === s.id ? null : s.id)}
                  onPatch={(patch) => onPatch(s.id, patch)}
                  onDuplicate={() => handleDuplicate(s)}
                  onDelete={() => setToDelete(s)}
                  family={family}
                  macroId={macroId}
                  macroNome={macroNome}
                  tariffePrezzi={tariffePrezzi}
                />
              );
            })}
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => setListinoOpen(true)}
                variant="outline"
                className="flex-1 gap-1 border-dashed border-2 border-orange-300 hover:bg-orange-50"
                disabled={addMut.isPending}
              >
                <Package className="h-4 w-4" /> Aggiungi dal listino
              </Button>
              <Button
                onClick={handleAdd}
                variant="outline"
                className="flex-1 gap-1 border-dashed border-2 border-slate-300"
                disabled={addMut.isPending}
              >
                {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                A mano
              </Button>
            </div>
          </div>
        )}

        <ListinoPickerDialog
          open={listinoOpen}
          onOpenChange={setListinoOpen}
          onSelect={handlePickFromListino}
        />
      </SrCard>

      {/* Accessori e complementi — tapparelle/cassonetti/persiane/zanzariere.
          Inclusa la feature "Copia misure dai serramenti" per ereditare
          larghezza × altezza × quantità dalle finestre già configurate. */}
      <AccessoriSection progettoId={progettoId} detail={detail} />

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
              L'operazione rimuove anche eventuali accessori e foto collegate. Non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!toDelete) return;
                deleteMut.mutate(toDelete.id, {
                  onSettled: () => setToDelete(null),
                });
              }}
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

// ─── Singola riga serramento (collassabile) ─────────────────────────────────

function SerramentoRow({
  serramento: s, index, expanded, onToggle, onPatch, onDuplicate, onDelete,
  family, macroId, macroNome, tariffePrezzi,
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
}) {
  // Label header riga:
  //   - off-listino: usa SR_TIPOLOGIE_SERRAMENTO (Finestra a 1 anta, ecc.)
  //   - da listino: usa il nome dell'articolo (es. "COSTRUZIONE 3 IT —
  //     PORTA BALCONE 1 ANTA"). family.nome e' gia' salvato in
  //     s.tipologia_label dal picker quindi e' preferito.
  const tipoLabel = family
    ? (family.nome || s.tipologia_label || s.tipologia)
    : (SR_TIPOLOGIE_SERRAMENTO.find((t) => t.value === s.tipologia)?.label ?? s.tipologia);
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

  // Carico griglia listino della family per ricalcolo prezzo on-the-fly su
  // modifica L/A/Q. enabled solo se family esiste con modalità griglia.
  const { data: griglia = [] } = useListinoGriglia(family?.id);
  const isFromListino = !!family;

  // Carica family completa (con axes+values) per applicare le maggiorazioni
  // delle Variabili Prodotto al ricalcolo prezzo. Solo per righe listino.
  const { family: familyWithAxes } = useFamily(family?.id);

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
  ): number | null => {
    if (!family) return null;
    if (family.modalita_prezzo_base === "griglia" && griglia.length === 0) return null;
    const Qsafe = Q || 1;
    const sels = selections ?? (s.valori_assi ?? {}) as Record<string, string>;

    // Se la family completa con axes non e' ancora caricata, calcolo base
    // (prodotto + posa) senza maggiorazioni — meglio del nulla. Le
    // maggiorazioni verranno applicate al prossimo render quando arriva.
    if (!familyWithAxes) {
      const result = calcolaPrezzoProdotto(family, L, H, Qsafe, griglia);
      const posa = calcolaPosaInclusa(family, Qsafe, tariffePrezzi);
      const totale = result.prezzo + posa;
      return Qsafe > 0 ? totale / Qsafe : totale;
    }

    // Pricing completo con maggiorazioni assi via helper esistente.
    const pricing = calcolaPrezzoFamiglia(
      {
        family: familyWithAxes,
        selections: sels,
        larghezza_mm: L ?? undefined,
        altezza_mm: H ?? undefined,
        lunghezza_ml: undefined,
        quantita: Qsafe,
      },
      griglia.map((g) => ({
        valore_x: g.valore_x ?? 0,
        valore_y: g.valore_y ?? 0,
        prezzo_vendita: Number(g.prezzo_vendita ?? 0),
        prezzo_acquisto_netto: null,
      })),
    );
    // pricing.unit_price_vendita e' SOLO prodotto (no posa) -> aggiungo
    // posa indipendente sopra (tariffa cantiere, non scala con maggiorazioni).
    // BUG FIX: prima leggevo `prezzo_unitario_vendita` che NON esiste
    // (la funzione esporta `unit_price_vendita`). Risultato: undefined+posa
    // = NaN -> ricalcolo silenziosamente fallito -> prezzo non si aggiornava
    // su cambio variabile prodotto.
    const posa = calcolaPosaInclusa(family, Qsafe, tariffePrezzi);
    return pricing.unit_price_vendita + (Qsafe > 0 ? posa / Qsafe : posa);
  };

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
    const next = { ...s, ...patch };
    const L = next.larghezza_mm ?? null;
    const H = next.altezza_mm ?? null;
    const Q = next.quantita ?? 1;
    const nuovoPrezzo = ricalcolaPrezzoUnitario(L, H, Q);
    if (nuovoPrezzo != null && Number.isFinite(nuovoPrezzo)) {
      onPatch({ ...patch, prezzo_unitario: Number(nuovoPrezzo.toFixed(2)) });
    } else {
      onPatch(patch);
    }
  };

  /**
   * Cambio di una variabile prodotto (asse) sulla riga BOM esistente.
   * Aggiorna la mappa valori_assi e ricalcola il prezzo unitario con
   * le maggiorazioni della nuova combinazione, lasciando L/A/Q invariati.
   */
  const handleAxisPatch = (axisCodice: string, valueId: string) => {
    const nextSelections = { ...(s.valori_assi ?? {}), [axisCodice]: valueId };
    const L = s.larghezza_mm ?? null;
    const H = s.altezza_mm ?? null;
    const Q = s.quantita ?? 1;
    const nuovoPrezzo = ricalcolaPrezzoUnitario(L, H, Q, nextSelections);
    if (nuovoPrezzo != null && Number.isFinite(nuovoPrezzo)) {
      onPatch({ valori_assi: nextSelections, prezzo_unitario: Number(nuovoPrezzo.toFixed(2)) });
    } else {
      onPatch({ valori_assi: nextSelections });
    }
  };

  return (
    <Card className="border-orange-100">
      <CardHeader className="p-3 hover:bg-orange-50/30">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 flex-wrap flex-1 min-w-0 text-left cursor-pointer"
            aria-expanded={expanded}
          >
            <span className="h-6 w-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[11px] font-bold shrink-0">
              {index + 1}
            </span>
            <span className="flex-1 min-w-0">
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
                {mq.toFixed(2)} m²
              </span>
            )}
            {s.prezzo_totale ? (
              <span className="font-semibold text-orange-600">{formatEuro(s.prezzo_totale)}</span>
            ) : (
              // Warning visibile se la riga non ha prezzo: previene che entri
              // nel totale come "0,00 €" senza che il commerciale se ne accorga.
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
            {modalitaPrezzo === "misura_libera" && (
              <span className="text-[9px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                a corpo
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
        <CardContent className="p-3 pt-0 grid grid-cols-12 gap-2 border-t">
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
              <Label className="text-xs">Tipologia</Label>
              <Select
                value={s.tipologia}
                onValueChange={(v) => {
                  const lbl = SR_TIPOLOGIE_SERRAMENTO.find((t) => t.value === v)?.label;
                  onPatch({ tipologia: v, tipologia_label: lbl });
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SR_TIPOLOGIE_SERRAMENTO.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                          <Select
                            value={currentId}
                            onValueChange={(v) => handleAxisPatch(axis.codice, v)}
                          >
                            <SelectTrigger className={
                              "h-8 text-xs bg-white " + (isMissing ? "border-rose-300" : "")
                            }>
                              <SelectValue placeholder="Seleziona…" />
                            </SelectTrigger>
                            <SelectContent>
                              {axis.values.filter((v) => v.attivo).map((v) => {
                                const magg = v.maggiorazione_tipo === "none" || !v.maggiorazione_valore
                                  ? ""
                                  : v.maggiorazione_tipo === "percentuale"
                                    ? ` (+${v.maggiorazione_valore}%)`
                                    : ` (+€${Number(v.maggiorazione_valore).toLocaleString("it-IT", { minimumFractionDigits: 2 })}${v.maggiorazione_tipo === "fisso_mq" ? "/m²" : v.maggiorazione_tipo === "fisso_ml" ? "/ml" : ""})`;
                                const std = v.is_default ? " · standard" : "";
                                return (
                                  <SelectItem key={v.id} value={v.id} className="text-xs">
                                    {v.label}{magg}{std}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Materiale / Serie / Vetro: editabili solo se la riga è "off-listino"
              (aggiunta a mano). Per le righe dal listino, sono già definite
              dalla scheda tecnica e ridondanti. */}
          {!isFromListino && (
            <>
              {/* Macrocategoria override — permette di collegare un BOM manuale
                  ad una macrocategoria del listino. Nel PDF carica così la foto
                  prodotto + la pagina dedicata (se la macro ha mostra_pagina=true). */}
              <MacroOverrideSelect
                value={s.macrocategoria_override_id}
                onChange={(v) => onPatch({ macrocategoria_override_id: v })}
              />
              <div className="col-span-6 md:col-span-4">
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
              <div className="col-span-6 md:col-span-4">
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
                <span className="font-semibold">Prezzo fisso:</span> questo articolo del listino e' venduto {modalitaPrezzo === "pz" ? "a pezzo" : "a corpo"}.
                Larghezza e altezza sono indicative e non modificano il prezzo unitario.
              </p>
            </div>
          )}
          <div className="col-span-4 md:col-span-3">
            <Label className="text-xs">Largh. (mm)</Label>
            <Input
              type="number"
              key={`L-${s.id}`}
              defaultValue={s.larghezza_mm ?? ""}
              onBlur={(e) => handleMisurePatch({ larghezza_mm: e.target.value ? Number(e.target.value) : null })}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-4 md:col-span-3">
            <Label className="text-xs">Altezza (mm)</Label>
            <Input
              type="number"
              key={`H-${s.id}`}
              defaultValue={s.altezza_mm ?? ""}
              onBlur={(e) => handleMisurePatch({ altezza_mm: e.target.value ? Number(e.target.value) : null })}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-4 md:col-span-2">
            <Label className="text-xs">Quantità</Label>
            <Input
              type="number"
              min={1}
              key={`Q-${s.id}`}
              defaultValue={s.quantita}
              onBlur={(e) => handleMisurePatch({ quantita: Math.max(1, Number(e.target.value) || 1) })}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs flex items-center justify-between">
              <span>Prezzo unitario (€)</span>
              {isFromListino && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-orange-200 bg-orange-50 text-orange-600">
                  da listino · auto
                </Badge>
              )}
            </Label>
            {/* Prezzo unitario:
                - off-listino: editabile (commerciale lo definisce a mano)
                - da listino: READ-ONLY. Cambia solo modificando L/A/Q (la
                  griglia listino ricalcola). Il commerciale non puo' alterare
                  i prezzi vendita a mano per coerenza con la marginalita'. */}
            <Input
              type="number"
              step="0.01"
              key={`P-${s.id}-${s.prezzo_unitario ?? ""}`}
              defaultValue={s.prezzo_unitario ?? ""}
              onBlur={(e) => {
                if (isFromListino) return; // read-only per listino
                onPatch({ prezzo_unitario: e.target.value ? Number(e.target.value) : null });
              }}
              readOnly={isFromListino}
              tabIndex={isFromListino ? -1 : undefined}
              className={
                "h-9 text-xs " +
                (isFromListino ? "bg-slate-50 cursor-not-allowed text-slate-700" : "")
              }
              title={isFromListino
                ? "Calcolato automaticamente dalla griglia del listino in base a larghezza/altezza/quantita'."
                : ""}
            />
          </div>

          {/* Colore interno/esterno: SOLO off-listino. Per i prodotti del
              listino il colore appartiene alla scheda tecnica della famiglia. */}
          {!isFromListino && (
            <>
              <div className="col-span-6 md:col-span-4">
                <Label className="text-xs">Colore interno</Label>
                <Input
                  defaultValue={s.colore_interno ?? ""}
                  onBlur={(e) => onPatch({ colore_interno: e.target.value || null })}
                  placeholder="Bianco RAL 9010"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-6 md:col-span-4">
                <Label className="text-xs">Colore esterno</Label>
                <Input
                  defaultValue={s.colore_esterno ?? ""}
                  onBlur={(e) => onPatch({ colore_esterno: e.target.value || null })}
                  placeholder="Antracite RAL 7016"
                  className="h-9 text-xs"
                />
              </div>
            </>
          )}
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
  const macrosAttive = macros.filter((m) => m.attivo);
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
            {macrosAttive.map((m) => (
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
