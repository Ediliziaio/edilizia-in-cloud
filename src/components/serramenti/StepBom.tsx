/**
 * StepBom — Step 4 wizard: composizione serramenti (BOM).
 *
 * Tabella editabile: tipologia, materiale, vetro, misure, quantità, prezzo.
 * Aggiungi/duplica/elimina riga. Import da sopralluogo Infissi v6 (Wave 4).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RectangleVertical, Plus, Trash2, Copy, Loader2, Upload, HelpCircle } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useAddSerramento, useUpdateSerramento, useDeleteSerramento, useImportDaSopralluogo,
} from "@/lib/serramenti/queries";
import {
  SR_TIPOLOGIE_SERRAMENTO, SR_MATERIALI,
} from "@/types/serramenti";
import type { SrProgettoDetail, SrSerramentoRow, SrMaterialePrincipale } from "@/types/serramenti";
import { calcolaM2 } from "@/lib/serramenti/calcoli";
import { SrCard, SrCallout, formatEuro } from "@/lib/serramenti/wizardUI";

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

  const serramenti = detail.serramenti;

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
        title="Composizione serramenti"
        description="Aggiungi tutti i pezzi della stima con misure, materiale e prezzo. Compariranno nella pagina tecnica del PDF."
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

        {serramenti.length === 0 ? (
          <div className="border-2 border-dashed border-emerald-200 rounded-md p-6 text-center">
            <RectangleVertical className="h-8 w-8 mx-auto text-emerald-300 mb-2" />
            <p className="text-sm text-muted-foreground mb-3">Nessun serramento aggiunto</p>
            <Button onClick={handleAdd} className="bg-emerald-700 hover:bg-emerald-800" disabled={addMut.isPending}>
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Aggiungi il primo serramento
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {serramenti.map((s, idx) => (
              <SerramentoRow
                key={s.id}
                serramento={s}
                index={idx}
                expanded={expanded === s.id}
                onToggle={() => setExpanded((prev) => prev === s.id ? null : s.id)}
                onPatch={(patch) => onPatch(s.id, patch)}
                onDuplicate={() => handleDuplicate(s)}
                onDelete={() => setToDelete(s)}
              />
            ))}
            <Button
              onClick={handleAdd}
              variant="outline"
              className="w-full gap-1 border-dashed border-2 border-emerald-300 hover:bg-emerald-50"
              disabled={addMut.isPending}
            >
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Aggiungi serramento
            </Button>
          </div>
        )}
      </SrCard>

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
}: {
  serramento: SrSerramentoRow;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<SrSerramentoRow>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const tipoLabel = SR_TIPOLOGIE_SERRAMENTO.find((t) => t.value === s.tipologia)?.label ?? s.tipologia;
  const matLabel = s.materiale ? SR_MATERIALI.find((m) => m.value === s.materiale)?.label : null;
  const mq = s.metri_quadri ?? calcolaM2(s.larghezza_mm ?? 0, s.altezza_mm ?? 0, s.quantita ?? 1);

  return (
    <Card className="border-emerald-100">
      <CardHeader
        className="p-3 cursor-pointer hover:bg-emerald-50/30"
        onClick={onToggle}
      >
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <span className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold">
            {index + 1}
          </span>
          <span className="flex-1">
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
          <div className="col-span-4 md:col-span-3">
            <Label className="text-xs">Largh. (mm)</Label>
            <Input
              type="number"
              defaultValue={s.larghezza_mm ?? ""}
              onBlur={(e) => onPatch({ larghezza_mm: e.target.value ? Number(e.target.value) : null })}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-4 md:col-span-3">
            <Label className="text-xs">Altezza (mm)</Label>
            <Input
              type="number"
              defaultValue={s.altezza_mm ?? ""}
              onBlur={(e) => onPatch({ altezza_mm: e.target.value ? Number(e.target.value) : null })}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-4 md:col-span-2">
            <Label className="text-xs">Quantità</Label>
            <Input
              type="number"
              min={1}
              defaultValue={s.quantita}
              onBlur={(e) => onPatch({ quantita: Math.max(1, Number(e.target.value) || 1) })}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs">Prezzo unitario (€)</Label>
            <Input
              type="number"
              step="0.01"
              defaultValue={s.prezzo_unitario ?? ""}
              onBlur={(e) => onPatch({ prezzo_unitario: e.target.value ? Number(e.target.value) : null })}
              className="h-9 text-xs"
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
          <div className="col-span-12 flex justify-end gap-2 mt-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={onDuplicate} className="text-xs">
              <Copy className="h-3.5 w-3.5 mr-1" /> Duplica
            </Button>
            <Button size="sm" variant="outline" onClick={onDelete} className="text-xs text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Elimina
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
