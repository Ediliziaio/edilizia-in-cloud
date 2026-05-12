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
import { ListinoPickerDialog, type ListinoPickResult, calcolaPrezzoProdotto } from "./ListinoPickerDialog";
import { ServiziSection } from "./ServiziSection";
import { AccessoriSection } from "./AccessoriSection";
import {
  useAddSerramento, useUpdateSerramento, useDeleteSerramento, useImportDaSopralluogo,
  useListinoFamilies, useListinoGriglia,
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

  // Pre-fetch families per ricalcolo prezzo on-the-fly. Cached da React Query
  // (5 min staleTime su useListinoFamilies) → costo bassissimo.
  const { data: allFamilies = [] } = useListinoFamilies();
  const familiesById = useMemo(() => {
    const m = new Map<string, ListinoFamily>();
    allFamilies.forEach((f) => m.set(f.id, f));
    return m;
  }, [allFamilies]);

  // Mappa categoria → macrocategoria_id per lookup scheda tecnica nella row.
  const { categorie } = useListinoCategorie();
  const catToMacro = useMemo(() => {
    const m = new Map<string, string>();
    categorie.forEach((c) => {
      if (c.macrocategoria_id) m.set(c.id, c.macrocategoria_id);
    });
    return m;
  }, [categorie]);

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
        materiale: detail.progetto.materiale_principale ?? "alluminio",
        larghezza_mm: item.larghezza_mm,
        altezza_mm: item.altezza_mm,
        quantita: qty,
        prezzo_unitario: prezzoUnitarioFinal,
        prezzo_totale: prezzoUnitarioFinal * qty,
        position: serramenti.length,
        family_id: item.family_id,
        listino_voce_id: item.griglia_id ?? null,
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
      prezzo_unitario: s.prezzo_unitario,
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
  family, macroId,
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
}) {
  const tipoLabel = SR_TIPOLOGIE_SERRAMENTO.find((t) => t.value === s.tipologia)?.label ?? s.tipologia;
  const matLabel = s.materiale ? SR_MATERIALI.find((m) => m.value === s.materiale)?.label : null;
  const mq = s.metri_quadri ?? calcolaM2(s.larghezza_mm ?? 0, s.altezza_mm ?? 0, s.quantita ?? 1);

  // Carico griglia listino della family per ricalcolo prezzo on-the-fly su
  // modifica L/A/Q. enabled solo se family esiste con modalità griglia.
  const { data: griglia = [] } = useListinoGriglia(family?.id);
  const isFromListino = !!family;

  /**
   * Ricalcola prezzo unitario in base a L/A/Q correnti, leggendo dal listino.
   * Ritorna `null` se la family non è disponibile o se non ci sono dati
   * sufficienti per il calcolo.
   */
  const ricalcolaPrezzoUnitario = (
    L: number | null,
    H: number | null,
    Q: number,
  ): number | null => {
    if (!family) return null;
    const result = calcolaPrezzoProdotto(family, L, H, Q || 1, griglia);
    // calcolaPrezzoProdotto ritorna TOTALE → dividiamo per Q per ottenere unitario.
    return Q > 0 ? result.prezzo / Q : result.prezzo;
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
            {s.prezzo_totale && (
              <span className="font-semibold text-orange-600">{formatEuro(s.prezzo_totale)}</span>
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
                  da listino
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              step="0.01"
              key={`P-${s.id}-${s.prezzo_unitario ?? ""}`}
              defaultValue={s.prezzo_unitario ?? ""}
              onBlur={(e) => onPatch({ prezzo_unitario: e.target.value ? Number(e.target.value) : null })}
              className="h-9 text-xs"
              title={isFromListino ? "Auto-aggiornato in base a L/A/Q. Puoi sovrascrivere manualmente per offerte speciali." : ""}
            />
          </div>
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
