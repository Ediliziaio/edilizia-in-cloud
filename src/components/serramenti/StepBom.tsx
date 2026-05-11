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
                importMut.mutate({
                  sopralluogo_id: detail.progetto.sopralluogo_id,
                  replace: serramenti.length > 0
                    ? confirm("Esistono già serramenti in lista. Vuoi sostituirli con quelli del sopralluogo? (Annulla = aggiungi in coda)")
                    : false,
                });
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
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 gap-1"
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
          <div className="border-2 border-dashed border-emerald-200 rounded-md p-6 text-center">
            <RectangleVertical className="h-8 w-8 mx-auto text-emerald-300 mb-2" />
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
                className="flex-1 gap-1 border-dashed border-2 border-emerald-300 hover:bg-emerald-50"
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

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {toDelete?.tipologia_label ?? "serramento"}?</AlertDialogTitle>
            <AlertDialogDescription>
              L'operazione rimuove anche eventuali accessori e foto collegate. Non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Elimina
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
    <Card className="border-emerald-100">
      <CardHeader className="p-3 hover:bg-emerald-50/30">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 flex-wrap flex-1 min-w-0 text-left cursor-pointer"
            aria-expanded={expanded}
          >
            <span className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0">
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
              <span className="text-[11px] font-normal text-emerald-700">
                {mq.toFixed(2)} m²
              </span>
            )}
            {s.prezzo_totale && (
              <span className="font-semibold text-emerald-700">{formatEuro(s.prezzo_totale)}</span>
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
              <div className="rounded-md border border-emerald-100 bg-emerald-50/40 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold mb-1.5 flex items-center gap-1">
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
                        <button type="button" className="text-muted-foreground hover:text-emerald-600">
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

          <div className="col-span-4 md:col-span-3">
            <Label className="text-xs">Largh. (mm)</Label>
            <Input
              type="number"
              key={`L-${s.id}-${s.larghezza_mm ?? ""}`}
              defaultValue={s.larghezza_mm ?? ""}
              onBlur={(e) => handleMisurePatch({ larghezza_mm: e.target.value ? Number(e.target.value) : null })}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-4 md:col-span-3">
            <Label className="text-xs">Altezza (mm)</Label>
            <Input
              type="number"
              key={`H-${s.id}-${s.altezza_mm ?? ""}`}
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
              key={`Q-${s.id}-${s.quantita}`}
              defaultValue={s.quantita}
              onBlur={(e) => handleMisurePatch({ quantita: Math.max(1, Number(e.target.value) || 1) })}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs flex items-center justify-between">
              <span>Prezzo unitario (€)</span>
              {isFromListino && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-emerald-200 bg-emerald-50 text-emerald-700">
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
