/**
 * AccessoriSection — sezione "Accessori e complementi" estratta dallo
 * StepAccessori e riusata dentro StepBom (Composizione offerta).
 *
 * Use case: tapparelle, cassonetti, zanzariere, persiane, monoblocchi che
 * spesso hanno le stesse misure dei serramenti già nel preventivo.
 *
 * Feature chiave: "Copia misure dai serramenti" — dialog che mostra i
 * serramenti già nel BOM e permette di selezionare quali importare; per
 * ogni serramento selezionato viene creata una riga accessorio con
 * tipologia comune (es. tapparella) ed esatte misure (larghezza × altezza
 * × quantità). Risolve il workflow "ho 10 finestre, voglio 10 tapparelle
 * con le stesse misure senza re-inserirle tutte".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Image as ImageIcon, Plus, Trash2, Loader2, Copy, Layers, Package, Sparkles,
} from "lucide-react";
import {
  useAddAccessorio, useUpdateAccessorio, useDeleteAccessorio,
  useListinoFamiliesByIds, useListinoGriglia, useTariffeManodopera,
} from "@/lib/serramenti/queries";
import { SR_ACCESSORI_TIPI } from "@/types/serramenti";
import type { SrProgettoDetail, SrAccessorioRow, SrSerramentoRow } from "@/types/serramenti";
import { SrCard } from "@/lib/serramenti/wizardUI";
import { formatEuro } from "@/lib/serramenti/format";
import { toast } from "sonner";
import { ListinoPickerDialog, type ListinoPickResult } from "./ListinoPickerDialog";
import { useFamilies, useFamily } from "@/hooks/useFamilies";
import { useListinoMacrocategorie } from "@/hooks/useListinoMacrocategorie";
import { useListinoCategorie } from "@/hooks/useListinoCategorie";
import { areaDelPreventivatore, comeListinoFamily, tipologieProposte } from "@/lib/serramenti/pickerListino";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { useSupplierProductLines } from "@/features/serramenti-listini/hooks/useSupplierProductLines";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import { applyMaggiorazioniAssi, calcolaPosaInclusa, calcolaPrezzoProdotto } from "@/lib/serramenti/pricing";
import type { ListinoFamily } from "@/lib/serramenti/api";
import { scelteDopo } from "@/lib/listino/scelteVariante";
import { SceltaVariante } from "./SceltaVariante";
import { cn } from "@/lib/utils";
import { misuraDaTesto, quantitaDaTesto } from "@/lib/serramenti/righePreventivo";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

export function AccessoriSection({ progettoId, detail }: Props) {
  const addMut = useAddAccessorio(progettoId);
  const updateMut = useUpdateAccessorio(progettoId);
  const deleteMut = useDeleteAccessorio(progettoId);

  const accessori = detail.accessori;
  const serramenti = detail.serramenti;

  const [toDelete, setToDelete] = useState<SrAccessorioRow | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  /** Picker listino aperto per scegliere un articolo accessorio. */
  const [listinoPickerOpen, setListinoPickerOpen] = useState(false);

  // Gli articoli del listino delle righe, con tariffe e linee fornitore: servono
  // a ricalcolare il prezzo quando cambiano misure, quantità o varianti.
  const familyIdsAccessori = useMemo(
    () => Array.from(new Set(accessori.map((a) => a.family_id).filter((v): v is string => !!v))),
    [accessori],
  );
  const { data: famiglieAccessori = [] } = useListinoFamiliesByIds(familyIdsAccessori);
  const famigliePerId = useMemo(() => new Map(famiglieAccessori.map((f) => [f.id, f])), [famiglieAccessori]);
  const { data: tariffe = [] } = useTariffeManodopera();
  const tariffePrezzi = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => { if (t.prezzo_vendita != null) m.set(t.id, Number(t.prezzo_vendita)); });
    return m;
  }, [tariffe]);
  const { lines: supplierLines = [] } = useSupplierProductLines({ enabled: familyIdsAccessori.length > 0 });
  const supplierLineMap = useMemo(() => {
    const m = new Map<string, SupplierProductLine>();
    supplierLines.forEach((line) => m.set(line.id, line));
    return m;
  }, [supplierLines]);

  const handleAdd = () => {
    addMut.mutate({
      tipo: "avvolgibile",
      quantita: 1,
      position: accessori.length,
    });
  };

  /**
   * Aggiunge un accessorio scegliendolo dal listino prodotti.
   * Il picker ritorna family_id + misure + prezzo già calcolato dalla griglia
   * + variabili. Lo snapshot della modalita_prezzo serve al dialog "Copia da
   * serramenti" per decidere se copiare dims o quantita.
   */
  const handleAddFromListino = (pick: ListinoPickResult) => {
    addMut.mutate({
      tipo: "avvolgibile", // fallback semantic; real type derivato dalla macro
      descrizione: pick.family_nome,
      quantita: pick.quantita,
      larghezza_mm: pick.larghezza_mm,
      altezza_mm: pick.altezza_mm,
      prezzo_unitario: pick.prezzo_unitario,
      prezzo_totale:
        pick.prezzo_unitario != null
          ? Number((pick.prezzo_unitario * pick.quantita).toFixed(2))
          : null,
      family_id: pick.family_id,
      supplier_catalog_id: pick.supplier_catalog_id ?? null,
      supplier_product_line_id: pick.supplier_product_line_id ?? null,
      valori_assi: pick.valori_assi ?? null,
      scelte_assi: pick.scelte_assi ?? {},
      modalita_prezzo: pick.modalita_prezzo,
      position: accessori.length,
    });
    toast.success(`"${pick.family_nome}" aggiunto agli accessori`);
  };

  const onPatch = (id: string, patch: Partial<SrAccessorioRow>) => {
    if (patch.prezzo_unitario !== undefined || patch.quantita !== undefined) {
      const orig = accessori.find((a) => a.id === id);
      if (orig) {
        // Prezzo svuotato vale zero: con `??` si riprendeva quello vecchio e il
        // totale restava nel preventivo accanto a un prezzo vuoto.
        const next = { ...orig, ...patch };
        patch.prezzo_totale = (next.prezzo_unitario ?? 0) * (next.quantita ?? 1);
      }
    }
    updateMut.mutate({ id, patch });
  };

  return (
    <>
      <SrCard
        title="Accessori e complementi"
        description="Tapparelle, cassonetti, zanzariere, persiane, monoblocchi. Possono ereditare le misure dai serramenti già configurati."
        icon={<ImageIcon className="h-4 w-4" />}
      >
        {/* Toolbar: aggiungi vuoto + copia da serramenti */}
        {accessori.length === 0 ? (
          <div className="border-2 border-dashed border-orange-200 rounded-md p-6 text-center space-y-3">
            <ImageIcon className="h-8 w-8 mx-auto text-orange-300" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Nessun accessorio aggiunto
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Aggiungi tapparelle, cassonetti o altri complementi.{" "}
                {serramenti.length > 0 && (
                  <strong>Scorciatoia:</strong>
                )}{" "}
                {serramenti.length > 0 &&
                  "se le tapparelle hanno le stesse misure dei serramenti, copiale in un click."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-1">
              <Button
                size="sm"
                onClick={() => setListinoPickerOpen(true)}
                className="bg-orange-500 hover:bg-orange-600 gap-1.5"
              >
                <Package className="h-4 w-4" />
                Aggiungi da listino
              </Button>
              {serramenti.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCopyDialogOpen(true)}
                  className="gap-1.5 border-orange-300 hover:bg-orange-50"
                >
                  <Copy className="h-4 w-4" />
                  Copia misure dai serramenti ({serramenti.length})
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAdd}
                disabled={addMut.isPending}
              >
                {addMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Riga manuale
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar superiore quando ci sono già accessori */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-xs text-muted-foreground">
                {accessori.length} {accessori.length === 1 ? "accessorio" : "accessori"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => setListinoPickerOpen(true)}
                  className="bg-orange-500 hover:bg-orange-600 gap-1.5 h-8"
                >
                  <Package className="h-3.5 w-3.5" />
                  Da listino
                </Button>
                {serramenti.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCopyDialogOpen(true)}
                    className="gap-1.5 border-orange-300 hover:bg-orange-50 h-8"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copia da serramenti
                  </Button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Descrizione</TableHead>
                    <TableHead className="text-xs w-24">Largh. (mm)</TableHead>
                    <TableHead className="text-xs w-24">Altezza (mm)</TableHead>
                    <TableHead className="text-xs w-16">Q.tà</TableHead>
                    <TableHead className="text-xs w-32">Prezzo unit.</TableHead>
                    <TableHead className="text-xs w-28">Totale</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessori.map((a) => (
                    <AccessorioRiga
                      key={a.id}
                      a={a}
                      family={a.family_id ? famigliePerId.get(a.family_id) : undefined}
                      tariffePrezzi={tariffePrezzi}
                      supplierLineMap={supplierLineMap}
                      onPatch={(patch) => onPatch(a.id, patch)}
                      onDelete={() => setToDelete(a)}
                    />
                  ))}
                </TableBody>
              </Table>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <Button
                  onClick={() => setListinoPickerOpen(true)}
                  variant="outline"
                  className="gap-1 border-dashed border-2 border-orange-300 hover:bg-orange-50 text-orange-700"
                  disabled={addMut.isPending}
                >
                  <Package className="h-4 w-4" />
                  Aggiungi da listino
                </Button>
                <Button
                  onClick={handleAdd}
                  variant="ghost"
                  className="gap-1 border-dashed border-2 border-slate-200 hover:bg-slate-50"
                  disabled={addMut.isPending}
                >
                  {addMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Riga manuale
                </Button>
              </div>
            </div>
          </>
        )}
      </SrCard>

      {/* Dialog "Copia misure da serramenti" */}
      <CopyMisureDialog
        open={copyDialogOpen}
        onClose={() => setCopyDialogOpen(false)}
        serramenti={serramenti}
        progettoId={progettoId}
        position={accessori.length}
      />

      {/* Picker listino prodotti per accessori — usa lo stesso dialog dei
          serramenti (macro → famiglia → misure). L'utente sceglie un articolo
          da una macrocategoria diversa da Infissi (Tapparelle, Zanzariere,
          Cassonetti, Persiane, Monoblocchi). */}
      <ListinoPickerDialog
        open={listinoPickerOpen}
        onOpenChange={setListinoPickerOpen}
        onSelect={(pick) => handleAddFromListino(pick)}
        // Filtro tipo='accessorio': il picker degli accessori mostra solo
        // macrocategorie marcate come "Accessorio" in Listino → Macrocategorie
        // (Tapparelle, Cassonetti, Zanzariere, …). Esclude i prodotti
        // principali (es. Infissi).
        tipo="accessorio"
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare accessorio?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.descrizione || toDelete?.tipo} verrà rimosso dal preventivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Riga accessorio ────────────────────────────────────────────────────────

/**
 * Una riga accessorio. Se viene dal listino, misure, quantità e varianti
 * ricalcolano il prezzo come nei serramenti: prima una tapparella allargata o
 * passata a motorizzata restava al prezzo di prima, e le sue varianti (colore,
 * motore, rete) non si potevano più cambiare dopo averla aggiunta.
 */
function AccessorioRiga({
  a, family, tariffePrezzi, supplierLineMap, onPatch, onDelete,
}: {
  a: SrAccessorioRow;
  /** L'articolo del listino, se la riga ne viene. */
  family?: ListinoFamily;
  tariffePrezzi: Map<string, number>;
  supplierLineMap: Map<string, SupplierProductLine>;
  onPatch: (patch: Partial<SrAccessorioRow>) => void;
  onDelete: () => void;
}) {
  const { data: griglia = [], isLoading: grigliaInCaricamento } = useListinoGriglia(family?.id);
  const { family: conVarianti, isLoading: variantiInCaricamento } = useFamily(family?.id);
  const modalita = family?.modalita_prezzo_base ?? null;
  // «Misura libera»: il prezzo lo scrive il commerciale e il listino non lo tocca.
  const prezzoAutomatico = !!family && modalita !== "misura_libera";
  const datiInArrivo = !!family && (grigliaInCaricamento || variantiInCaricamento);
  const ricalcoloInSospeso = useRef<{
    L: number | null;
    H: number | null;
    Q: number;
    scelte: Record<string, string>;
  } | null>(null);
  const lineaFornitore = a.supplier_product_line_id
    ?? griglia.find((g) => g.id === a.listino_voce_id)?.supplier_product_line_id
    ?? null;

  /** Prezzo unitario da listino, con varianti e posa; null se adesso non si può calcolare. */
  const prezzoDaListino = (L: number | null, H: number | null, Q: number, scelte: Record<string, string>) => {
    if (!family || !prezzoAutomatico) return null;
    const conMisure = modalita === "griglia" || modalita === "mq";
    if (conMisure && (!L || !H)) return null;
    if (modalita === "griglia" && griglia.length === 0) return null;
    if (!conVarianti && Object.keys(scelte).length > 0) return null;
    const q = Q || 1;
    const base = calcolaPrezzoProdotto(family, conMisure ? L : null, conMisure ? H : null, q, griglia, {
      supplierProductLineId: lineaFornitore,
      supplierLines: supplierLineMap,
    });
    if (base.fuoriRange || base.requiresSupplierLine || base.missingSupplierLinePricing) return null;
    const prodotto = conVarianti
      ? applyMaggiorazioniAssi(base.prezzo, scelte, conVarianti.axes, conMisure ? L : null, conMisure ? H : null, q)
      : base.prezzo;
    const posa = a.posa_esclusa ? 0 : calcolaPosaInclusa(family, q, tariffePrezzi);
    return { unitario: Number(((prodotto + posa) / q).toFixed(2)), voce: base.matchedGrigliaId };
  };

  const aggiorna = (patch: Partial<SrAccessorioRow>) => {
    const L = patch.larghezza_mm !== undefined ? patch.larghezza_mm : a.larghezza_mm;
    const H = patch.altezza_mm !== undefined ? patch.altezza_mm : a.altezza_mm;
    const Q = patch.quantita ?? a.quantita ?? 1;
    const scelte = patch.valori_assi ?? a.valori_assi ?? {};
    const prezzo = prezzoDaListino(L, H, Q, scelte);
    if (prezzo) {
      onPatch({ ...patch, prezzo_unitario: prezzo.unitario, ...(prezzo.voce ? { listino_voce_id: prezzo.voce } : {}) });
      return;
    }
    if (prezzoAutomatico && datiInArrivo) ricalcoloInSospeso.current = { L, H, Q, scelte };
    onPatch(patch);
  };

  // Come nei serramenti: il ricalcolo chiesto mentre griglia e varianti erano
  // in arrivo si rifà appena arrivano, con misure e scelte di quel momento.
  useEffect(() => {
    const attesa = ricalcoloInSospeso.current;
    if (!attesa || datiInArrivo) return;
    ricalcoloInSospeso.current = null;
    const prezzo = prezzoDaListino(attesa.L, attesa.H, attesa.Q, attesa.scelte);
    if (!prezzo) return;
    onPatch({
      larghezza_mm: attesa.L,
      altezza_mm: attesa.H,
      quantita: attesa.Q,
      valori_assi: attesa.scelte,
      prezzo_unitario: prezzo.unitario,
      ...(prezzo.voce ? { listino_voce_id: prezzo.voce } : {}),
    });
    // Scatta solo quando i dati arrivano: il ricalcolo usa la richiesta salvata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datiInArrivo]);

  const fuoriMisura = useMemo(() => {
    if (!family || modalita !== "griglia" || griglia.length === 0 || !a.larghezza_mm || !a.altezza_mm) return false;
    return calcolaPrezzoProdotto(family, a.larghezza_mm, a.altezza_mm, a.quantita || 1, griglia, {
      supplierProductLineId: lineaFornitore,
      supplierLines: supplierLineMap,
    }).fuoriRange === true;
  }, [family, modalita, griglia, a.larghezza_mm, a.altezza_mm, a.quantita, lineaFornitore, supplierLineMap]);

  const scelteRiga = a.valori_assi ?? {};
  const assi = (conVarianti?.axes ?? []).filter((ax) => ax.values.some((v) => v.attivo) || !!scelteRiga[ax.codice]);

  return (
    <>
      <TableRow className={assi.length > 0 ? "border-b-0" : undefined}>
        <TableCell>
          <Select value={a.tipo} onValueChange={(v) => onPatch({ tipo: v })}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SR_ACCESSORI_TIPI.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Input
              defaultValue={a.descrizione ?? ""}
              onBlur={(e) => onPatch({ descrizione: e.target.value || null })}
              placeholder="es. Alluminio coibentato"
              className="h-8 text-xs"
            />
            {a.family_id && (
              <Badge
                variant="outline"
                className="h-5 text-[9px] px-1 border-orange-300 text-orange-700 shrink-0"
                title="Articolo collegato al listino prodotti"
              >
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                listino
              </Badge>
            )}
          </div>
          {fuoriMisura && (
            <p className="mt-0.5 text-[10px] font-medium text-rose-700">
              Misure fuori dal listino: il prezzo non si aggiorna
            </p>
          )}
        </TableCell>
        <TableCell>
          <Input
            type="number"
            defaultValue={a.larghezza_mm ?? ""}
            onBlur={(e) => {
              const mm = misuraDaTesto(e.target.value);
              const salvata = a.larghezza_mm ?? null;
              // Non valida (negativa, decimale non intero di mm) torna quella salvata.
              e.target.value = String((mm === undefined ? salvata : mm) ?? "");
              if (mm !== undefined && mm !== salvata) aggiorna({ larghezza_mm: mm });
            }}
            className="h-8 text-xs w-20"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            defaultValue={a.altezza_mm ?? ""}
            onBlur={(e) => {
              const mm = misuraDaTesto(e.target.value);
              const salvata = a.altezza_mm ?? null;
              e.target.value = String((mm === undefined ? salvata : mm) ?? "");
              if (mm !== undefined && mm !== salvata) aggiorna({ altezza_mm: mm });
            }}
            className="h-8 text-xs w-20"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            min={1}
            defaultValue={a.quantita}
            onBlur={(e) => {
              const pezzi = quantitaDaTesto(e.target.value) ?? a.quantita;
              e.target.value = String(pezzi);
              if (pezzi !== a.quantita) aggiorna({ quantita: pezzi });
            }}
            className="h-8 text-xs w-14"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            step="0.01"
            key={`pu-${a.id}-${a.prezzo_unitario ?? ""}`}
            defaultValue={a.prezzo_unitario ?? ""}
            onBlur={(e) => {
              const valore = e.target.value ? Number(e.target.value) : null;
              if (valore !== a.prezzo_unitario) onPatch({ prezzo_unitario: valore });
            }}
            title={prezzoAutomatico ? "Dal listino: si ricalcola quando cambi misure, quantità o varianti." : undefined}
            className="h-8 text-xs w-24"
          />
        </TableCell>
        <TableCell className="text-xs font-semibold text-orange-600">
          {formatEuro(a.prezzo_totale)}
        </TableCell>
        <TableCell>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 sm:h-7 sm:w-7"
            onClick={onDelete}
            aria-label="Elimina accessorio"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </TableCell>
      </TableRow>
      {assi.length > 0 && (
        <TableRow>
          <TableCell colSpan={8} className="pb-3 pt-0">
            <div className="flex flex-wrap items-end gap-2">
              {assi.map((axis) => {
                const scelto = scelteRiga[axis.codice] ?? "";
                const manca = axis.obbligatorio && !scelto;
                return (
                  <div key={axis.id} className="min-w-[150px] space-y-0.5">
                    <Label className={cn("text-[10px]", manca ? "font-semibold text-rose-700" : "text-muted-foreground")}>
                      {axis.nome}
                      {axis.obbligatorio ? " *" : ""}
                    </Label>
                    <SceltaVariante
                      values={axis.values}
                      valueId={scelto}
                      scelta={(a.scelte_assi ?? {})[axis.codice]}
                      onChange={(valueId, voce) => {
                        const scelte_assi = scelteDopo(a.scelte_assi, axis.codice, voce);
                        // Un altro colore della stessa fascia: il prezzo non cambia.
                        if (valueId === scelto) onPatch({ scelte_assi });
                        else aggiorna({ valori_assi: { ...scelteRiga, [axis.codice]: valueId }, scelte_assi });
                      }}
                      placeholder="Scegli…"
                      aria-label={axis.nome}
                      className={cn("h-7 text-xs", manca && "border-rose-300")}
                    />
                  </div>
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Dialog: copia misure dai serramenti ────────────────────────────────────

function CopyMisureDialog({
  open, onClose, serramenti, progettoId, position,
}: {
  open: boolean;
  onClose: () => void;
  serramenti: SrSerramentoRow[];
  progettoId: string;
  position: number;
}) {
  const addMut = useAddAccessorio(progettoId);
  // Mode toggle: "manuale" (legacy, tipo enum) vs "listino" (collega a family
  // del listino prodotti → prezzo calcolato automaticamente + variabili).
  const [mode, setMode] = useState<"manuale" | "listino">("listino");
  const [tipoAccessorio, setTipoAccessorio] = useState<string>("tapparella");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(serramenti.map((s) => s.id)));
  const [descrizionePresetByTipo, setDescrizionePresetByTipo] = useState<string>("");
  // Modalità "listino": tipologia e articolo, dagli stessi accessori di
  // «Aggiungi dal listino»: area Serramenti, proposti nei preventivi, tutti.
  // Prima i primi 100, con categorie di qualunque area.
  const [pickedTipologia, setPickedTipologia] = useState<string | null>(null);
  const [pickedFamilyId, setPickedFamilyId] = useState<string | null>(null);
  const { families, isLoading: loadingFamiglie } = useFamilies();
  const { macrocategorie, isLoading: loadingMacro } = useListinoMacrocategorie();
  const { categorie, isLoading: loadingCategorie } = useListinoCategorie();
  const loadingTipologie = loadingFamiglie || loadingMacro || loadingCategorie;
  const tipologieAccessorio = useMemo(
    () => tipologieProposte(areaDelPreventivatore(families, macrocategorie, categorie, "accessorio")),
    [families, macrocategorie, categorie],
  );
  // Un articolo compare una volta anche con più linee: la linea si sceglie nelle varianti.
  const articoliTipologia = useMemo(() => {
    const articoli = new Map<string, FamilyWithAxes>();
    tipologieAccessorio
      .find((t) => t.chiave === pickedTipologia)
      ?.linee.forEach((l) => l.righe.forEach((r) => {
        if (!articoli.has(r.famiglia.id)) articoli.set(r.famiglia.id, r.famiglia);
      }));
    return [...articoli.values()];
  }, [tipologieAccessorio, pickedTipologia]);

  // Auto-switch a "manuale" quando l'azienda NON ha ancora configurato
  // macrocategorie. Evita il dead-end "Da listino" + 0 macro = utente
  // bloccato senza poter avanzare.
  useEffect(() => {
    if (open && !loadingTipologie && tipologieAccessorio.length === 0 && mode === "listino") {
      setMode("manuale");
    }
  }, [open, loadingTipologie, tipologieAccessorio.length, mode]);

  // Reset selezione e picker quando il dialog si apre o cambia la lista.
  useEffect(() => {
    if (open) {
      setSelected(new Set(serramenti.map((s) => s.id)));
      setPickedTipologia(null);
      setPickedFamilyId(null);
    }
  }, [open, serramenti]);

  const allSelected = serramenti.length > 0 && selected.size === serramenti.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === serramenti.length ? new Set() : new Set(serramenti.map((s) => s.id)),
    );
  };

  // L'articolo arriva dal listino già con le varianti: niente secondo caricamento.
  const pickedFamilyWithAxes = articoliTipologia.find((f) => f.id === pickedFamilyId) ?? null;
  const pickedFamily = useMemo(
    () => (pickedFamilyWithAxes ? comeListinoFamily(pickedFamilyWithAxes) : null),
    [pickedFamilyWithAxes],
  );
  const { data: griglia = [], isLoading: loadingGriglia } = useListinoGriglia(pickedFamily?.id);
  const { data: tariffe = [] } = useTariffeManodopera();
  const tariffePrezzi = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => { if (t.prezzo_vendita != null) m.set(t.id, Number(t.prezzo_vendita)); });
    return m;
  }, [tariffe]);
  const { lines: supplierLines = [] } = useSupplierProductLines({
    enabled: open && mode === "listino" && pickedFamily?.modalita_prezzo_base === "griglia",
  });
  const supplierLineMap = useMemo(() => {
    const m = new Map<string, SupplierProductLine>();
    supplierLines.forEach((line) => m.set(line.id, line));
    return m;
  }, [supplierLines]);
  const availableSupplierProductLineIds = useMemo(
    () => Array.from(new Set(griglia.map((g) => g.supplier_product_line_id).filter((v): v is string => !!v))),
    [griglia],
  );
  const defaultAxisSelection = useMemo(() => {
    const out: Record<string, string> = {};
    for (const axis of pickedFamilyWithAxes?.axes ?? []) {
      const def = axis.values.find((v) => v.attivo && v.is_default);
      if (def) out[axis.codice] = def.id;
    }
    return out;
  }, [pickedFamilyWithAxes]);
  // Le varianti si scelgono qui, partendo da quelle standard. Prima si copiavano
  // solo quelle: senza uno standard l'accessorio nasceva senza colore né motore,
  // e senza la loro maggiorazione nel prezzo.
  // Qui solo le scelte fatte a mano, legate all'articolo: cambiandolo si riparte dagli standard.
  const [sceltePersonali, setSceltePersonali] = useState<{
    familyId: string | null;
    scelte: Record<string, string>;
    /** La voce scelta dentro il valore (il colore di una fascia). */
    voci: Record<string, string>;
  }>({ familyId: null, scelte: {}, voci: {} });
  const pickedFamilyIdCorrente = pickedFamily?.id ?? null;
  const scelte = useMemo(
    () => ({
      ...defaultAxisSelection,
      ...(sceltePersonali.familyId === pickedFamilyIdCorrente ? sceltePersonali.scelte : {}),
    }),
    [defaultAxisSelection, sceltePersonali, pickedFamilyIdCorrente],
  );
  const vociScelte = sceltePersonali.familyId === pickedFamilyIdCorrente ? sceltePersonali.voci : {};
  const scegli = (codice: string, valoreId: string, voce: string | null) =>
    setSceltePersonali((prima) => {
      const stessoArticolo = prima.familyId === pickedFamilyIdCorrente;
      return {
        familyId: pickedFamilyIdCorrente,
        scelte: { ...(stessoArticolo ? prima.scelte : {}), [codice]: valoreId },
        voci: scelteDopo(stessoArticolo ? prima.voci : {}, codice, voce),
      };
    });
  const assiDaScegliere = useMemo(
    () => (pickedFamilyWithAxes?.axes ?? []).filter((ax) => ax.values.some((v) => v.attivo)),
    [pickedFamilyWithAxes],
  );
  const assiMancanti = assiDaScegliere.filter((ax) => ax.obbligatorio && !scelte[ax.codice]);

  const handleCopy = async () => {
    const targets = serramenti.filter((s) => selected.has(s.id));
    if (targets.length === 0) {
      toast.error("Seleziona almeno un serramento");
      return;
    }

    // Validazione modalità listino: serve almeno la family
    if (mode === "listino" && !pickedFamily) {
      toast.error("Scegli un articolo dal listino oppure passa a Manuale");
      return;
    }
    if (
      mode === "listino" &&
      pickedFamily?.modalita_prezzo_base === "griglia" &&
      availableSupplierProductLineIds.length > 1
    ) {
      toast.error("Questo articolo ha più linee fornitore", {
        description: "Usa “Aggiungi da listino” per scegliere la linea prodotto corretta.",
      });
      return;
    }
    if (
      mode === "listino" &&
      pickedFamily?.modalita_prezzo_base === "griglia" &&
      loadingGriglia
    ) {
      toast.error("Griglia prezzi ancora in caricamento");
      return;
    }
    if (mode === "listino" && assiMancanti.length > 0) {
      toast.error(`Scegli ${assiMancanti.map((ax) => ax.nome).join(", ")}`, {
        description: "Senza, l'accessorio nascerebbe senza quella variante e senza il suo prezzo.",
      });
      return;
    }

    try {
      // Si preparano e controllano tutte le righe prima di inserirne una: un
      // serramento senza misure a metà elenco lasciava inseriti i primi, e
      // riprovando si doppiavano.
      const nuovi = targets.map((s, indice): Partial<SrAccessorioRow> => {
        if (mode === "listino" && pickedFamily) {
          // Smart copy: collega all'articolo del listino.
          // Logica dims/quantita basata su modalita_prezzo_base del listino:
          //   - griglia/mq: copia larghezza+altezza dal serramento e calcola
          //     subito prezzo listino reale (griglia/mq + variabili + posa)
          //   - pz/misura_libera: copia solo quantità, niente dims
          const modalita = pickedFamily.modalita_prezzo_base;
          const wantsDims = modalita === "griglia" || modalita === "mq";
          const qty = s.quantita ?? 1;
          if (wantsDims && (!s.larghezza_mm || !s.altezza_mm)) {
            throw new Error(`${pickedFamily.nome}: il serramento "${s.tipologia_label || s.tipologia}" non ha misure complete.`);
          }
          const singleSupplierLineId =
            availableSupplierProductLineIds.length === 1
              ? availableSupplierProductLineIds[0]
              : null;
          const calc = calcolaPrezzoProdotto(
            pickedFamily,
            wantsDims ? s.larghezza_mm : null,
            wantsDims ? s.altezza_mm : null,
            qty,
            griglia,
            { supplierProductLineId: singleSupplierLineId, supplierLines: supplierLineMap },
          );
          if (calc.fuoriRange) {
            throw new Error(`${pickedFamily.nome}: ${calc.note ?? "misura fuori griglia"}`);
          }
          if (calc.requiresSupplierLine || calc.missingSupplierLinePricing) {
            throw new Error(calc.note ?? "Linea fornitore richiesta per calcolare il prezzo");
          }
          const prezzoProdotto = pickedFamilyWithAxes
            ? applyMaggiorazioniAssi(
                calc.prezzo,
                scelte,
                pickedFamilyWithAxes.axes,
                wantsDims ? s.larghezza_mm : null,
                wantsDims ? s.altezza_mm : null,
                qty,
              )
            : calc.prezzo;
          // «Solo fornitura» della finestra vale anche per il suo accessorio:
          // prima la posa si aggiungeva sempre.
          const posaEsclusa = s.posa_esclusa ?? false;
          const posa = posaEsclusa ? 0 : calcolaPosaInclusa(pickedFamily, qty, tariffePrezzi);
          const unit = qty > 0 ? Number(((prezzoProdotto + posa) / qty).toFixed(2)) : 0;
          return {
            tipo: tipoAccessorio,
            descrizione: pickedFamily.nome,
            quantita: qty,
            larghezza_mm: wantsDims ? s.larghezza_mm : null,
            altezza_mm: wantsDims ? s.altezza_mm : null,
            prezzo_unitario: unit,
            prezzo_totale: Number((unit * qty).toFixed(2)),
            family_id: pickedFamily.id,
            supplier_catalog_id: calc.supplierCatalogId ?? null,
            supplier_product_line_id: calc.supplierProductLineId ?? singleSupplierLineId,
            listino_voce_id: calc.matchedGrigliaId,
            valori_assi: scelte,
            scelte_assi: vociScelte,
            modalita_prezzo:
              (modalita === "pz" || modalita === "mq" || modalita === "griglia" || modalita === "misura_libera")
                ? modalita
                : null,
            posa_esclusa: posaEsclusa,
            serramento_id: s.id,
            position: position + indice,
          };
        }
        // Modalità manuale (legacy): tipo enum + descrizione opzionale.
        return {
          tipo: tipoAccessorio,
          descrizione: descrizionePresetByTipo.trim() ||
            (s.ambiente ? `${tipoLabel(tipoAccessorio)} ${s.ambiente}` : null),
          quantita: s.quantita ?? 1,
          larghezza_mm: s.larghezza_mm,
          altezza_mm: s.altezza_mm,
          serramento_id: s.id,
          position: position + indice,
        };
      });
      for (const accessorio of nuovi) {
        await addMut.mutateAsync(accessorio);
      }
      const count = nuovi.length;
      const label = count === 1 ? "accessorio creato" : "accessori creati";
      toast.success(
        `${count} ${label} dalle misure dei serramenti`,
        pickedFamily ? { description: `Collegati a "${pickedFamily.nome}"` } : undefined,
      );
      onClose();
    } catch (err) {
      toast.error("Errore copia misure", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center shrink-0">
              <Layers className="h-4.5 w-4.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <DialogTitle>Copia misure dai serramenti</DialogTitle>
              <DialogDescription>
                Crea automaticamente un accessorio per ogni serramento selezionato,
                con le stesse misure (larghezza × altezza × quantità). Utile per
                tapparelle, cassonetti, persiane, zanzariere.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Toggle mode: Listino (smart, prezzo automatico) vs Manuale (legacy). */}
          <div className="flex items-center gap-1 p-1 rounded-md bg-muted/50 w-fit">
            <button
              type="button"
              onClick={() => setMode("listino")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === "listino"
                  ? "bg-white dark:bg-slate-900 text-orange-700 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="h-3.5 w-3.5 inline mr-1.5" />
              Da listino prodotti
            </button>
            <button
              type="button"
              onClick={() => setMode("manuale")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === "manuale"
                  ? "bg-white dark:bg-slate-900 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Manuale
            </button>
          </div>

          {mode === "listino" ? (
            /* Mode LISTINO: macro picker + family picker. Prezzo + variabili
               ereditati dal listino. UX: chips macro orizzontali, poi list
               articoli verticale con prezzo base.  */
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Tipologia accessorio</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {loadingTipologie ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground italic py-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Caricamento tipologie…
                    </div>
                  ) : tipologieAccessorio.length === 0 ? (
                    /* NB: l'auto-switch a 'manuale' partito sopra dovrebbe
                       coprire questo caso, ma lo lasciamo come safety net
                       (se l'utente ri-cambia manualmente a 'listino'). */
                    <p className="text-xs text-muted-foreground italic">
                      Nessun accessorio da proporre. Nel <strong>Listino</strong> servono tipologie segnate come
                      accessorio (tapparelle, zanzariere, cassonetti) con prodotti attivi e proposti nei preventivi.
                    </p>
                  ) : (
                    tipologieAccessorio.map((t) => (
                      <button
                        key={t.chiave}
                        type="button"
                        onClick={() => { setPickedTipologia(t.chiave); setPickedFamilyId(null); }}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          pickedTipologia === t.chiave
                            ? "bg-orange-100 border-orange-400 text-orange-700"
                            : "bg-background border-slate-200 hover:border-orange-300"
                        }`}
                      >
                        {t.nome}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {pickedTipologia && (
                <div>
                  <Label className="text-xs">
                    Articolo {articoliTipologia.length > 0 && `(${articoliTipologia.length})`}
                  </Label>
                  {articoliTipologia.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic mt-1 rounded-md border border-dashed p-3 text-center">
                      Nessun articolo in questa tipologia.
                      <br />
                      Aggiungi articoli da <strong>Impostazioni → Listino prodotti</strong>,
                      oppure passa a <button
                        type="button"
                        className="underline hover:text-foreground"
                        onClick={() => setMode("manuale")}
                      >Manuale</button> per inserirli senza listino.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mt-1 max-h-48 overflow-y-auto pr-1">
                      {articoliTipologia.map((f) => {
                        const isSelected = pickedFamilyId === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setPickedFamilyId(f.id)}
                            className={`text-left flex items-center gap-2 px-2.5 py-2 rounded border transition-colors ${
                              isSelected
                                ? "border-orange-400 bg-orange-50/60"
                                : "border-slate-200 hover:bg-accent/30"
                            }`}
                          >
                            {f.immagine_url ? (
                              <img width={32} height={32} loading="lazy" src={f.immagine_url} alt="" className="h-8 w-8 object-cover rounded shrink-0" />
                            ) : (
                              <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                <Package className="h-3.5 w-3.5 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{f.nome}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {modalitaLabel(f.modalita_prezzo_base)}
                                {f.prezzo_base_vendita != null && f.prezzo_base_vendita > 0 && (
                                  <> · <span className="font-semibold text-emerald-700">{formatEuro(f.prezzo_base_vendita)}</span></>
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {pickedFamily && (
                <div className="rounded-md border border-orange-200 bg-orange-50/40 p-2.5 text-[11px] text-orange-900">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3 w-3 text-orange-600" />
                    <strong>Cosa copiamo dai serramenti:</strong>
                  </div>
                  {pickedFamily.modalita_prezzo_base === "griglia" || pickedFamily.modalita_prezzo_base === "mq" ? (
                    <span>Larghezza × Altezza × Quantità (l'articolo è venduto {pickedFamily.modalita_prezzo_base === "mq" ? "al mq" : "a griglia L×H"}).</span>
                  ) : (
                    <span>Solo la quantità (l'articolo è venduto a pezzo — niente dimensioni).</span>
                  )}
                  {pickedFamily.modalita_prezzo_base === "griglia" && availableSupplierProductLineIds.length > 1 && (
                    <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                      Questo articolo ha più linee fornitore: per scegliere quella corretta usa “Aggiungi da listino”.
                    </p>
                  )}
                </div>
              )}

              {pickedFamily && assiDaScegliere.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {assiDaScegliere.map((axis) => {
                    const manca = axis.obbligatorio && !scelte[axis.codice];
                    return (
                      <div key={axis.id} className="space-y-1">
                        <Label className={cn("text-xs", manca && "font-semibold text-rose-700")}>
                          {axis.nome}
                          {axis.obbligatorio ? " *" : ""}
                        </Label>
                        <SceltaVariante
                          values={axis.values}
                          valueId={scelte[axis.codice]}
                          scelta={vociScelte[axis.codice]}
                          onChange={(valueId, voce) => scegli(axis.codice, valueId, voce)}
                          placeholder="Scegli…"
                          aria-label={axis.nome}
                          className={cn("h-9 text-xs", manca && "border-rose-300")}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Mode MANUALE (legacy): tipo enum + descrizione free-form. */
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-5">
                <Label className="text-xs">Tipo di accessorio</Label>
                <Select value={tipoAccessorio} onValueChange={setTipoAccessorio}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SR_ACCESSORI_TIPI.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 md:col-span-7">
                <Label className="text-xs">Descrizione (opzionale)</Label>
                <Input
                  value={descrizionePresetByTipo}
                  onChange={(e) => setDescrizionePresetByTipo(e.target.value)}
                  placeholder="Lascia vuoto per generare automaticamente"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}

          {/* Lista serramenti con checkbox */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                />
                Seleziona {selected.size > 0 ? `(${selected.size}/${serramenti.length})` : "tutti"}
              </Label>
              <Badge variant="secondary" className="text-[10px]">
                {selected.size} {selected.size === 1 ? "selezionato" : "selezionati"}
              </Badge>
            </div>

            <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
              {serramenti.map((s) => {
                const isSel = selected.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors ${
                      isSel ? "bg-orange-50/40 dark:bg-orange-950/20" : ""
                    }`}
                  >
                    <Checkbox checked={isSel} onCheckedChange={() => toggleOne(s.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {s.tipologia_label || s.tipologia}
                        </span>
                        {s.ambiente && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {s.ambiente}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.larghezza_mm && s.altezza_mm
                          ? `${s.larghezza_mm}×${s.altezza_mm} mm`
                          : "Misure non impostate"}
                        {" · "}×{s.quantita ?? 1}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">Annulla</Button>
          <Button
            onClick={handleCopy}
            disabled={
              selected.size === 0 ||
              addMut.isPending ||
              (mode === "listino" && !pickedFamily) ||
              (mode === "listino" && pickedFamily?.modalita_prezzo_base === "griglia" && availableSupplierProductLineIds.length > 1)
            }
            className="w-full gap-1.5 bg-orange-500 hover:bg-orange-600 sm:w-auto"
          >
            {addMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Copy className="h-4 w-4" />
            Crea {selected.size} {selected.size === 1 ? "accessorio" : "accessori"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function tipoLabel(value: string): string {
  return SR_ACCESSORI_TIPI.find((t) => t.value === value)?.label ?? value;
}

function modalitaLabel(value: string | null | undefined): string {
  switch (value) {
    case "pz": return "A pezzo";
    case "mq": return "Al mq";
    case "griglia": return "Griglia L×H";
    case "misura_libera": return "Misura libera";
    default: return "Modalità non impostata";
  }
}
