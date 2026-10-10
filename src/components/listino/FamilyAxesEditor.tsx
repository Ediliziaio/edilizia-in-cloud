/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.4
 *
 * Editor assi (article_family_axes) + valori (article_family_axis_values)
 * con maggiorazioni. Ogni asse è una dimensione di variazione (es. materiale,
 * vetro, apertura). Ogni valore ha una maggiorazione che si applica al prezzo
 * base della famiglia quando quel valore è selezionato.
 *
 * Vincoli UX applicati:
 *  - Un solo is_default per asse (rispettato nel handler)
 *  - Assi obbligatori devono avere almeno un valore default
 *  - Codice asse suggerito da slug del nome
 *  - Ordinamento via pulsanti freccia (up/down)
 */

import { useEffect, useMemo, useState, useRef, type ChangeEvent } from "react";
import {
  Plus,
  ChevronRight,
  Loader2,
  Pencil,
  Sparkles,
  ChevronsUpDown,
  Image as ImageIcon,
  MoreHorizontal,
} from "lucide-react";
import { problemaCondizione, prezzoOpzioneValido } from "@/lib/listino/opzioniProdotto";
import { BulkOpzioniDialog } from "./BulkOpzioniDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { messaggioErroreListino } from "@/lib/listinoErrors";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  FamilyWithAxes,
  FamilyAxis,
  AxisValue,
  AxisTipo,
  MaggiorazioneTipo,
  ModalitaPrezzoBase,
} from "@/types/articleFamily";
import { AxisPresetsDialog } from "./AxisPresetsDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { ArticlePdfDocumentsSection } from "./ArticlePdfDocumentsSection";
import { formattaMaggiorazione } from "@/lib/listino/maggiorazione";
import { dividiVoci, problemaVoci, pulisciVoci, vociDi } from "@/lib/listino/scelteVariante";
import { parseImporto } from "@/lib/listino/listinoFornitore";
import { CatalogoColoriEditor } from "./CatalogoColoriEditor";

/**
 * Label compatto per il tipo maggiorazione (usato nei badge valore).
 * Mostra l'unità con cui si applica la maggiorazione al prezzo.
 */
function maggiorazioneLabel(tipo: MaggiorazioneTipo, valore: number): string {
  return formattaMaggiorazione(tipo, valore);
}

/** Classi Tailwind per il badge maggiorazione: codice colore semantico. */
function maggiorazioneBadgeClass(tipo: MaggiorazioneTipo): string {
  // bianco/none → grigio soft; % → ambra (moltiplicativo); fisso → indigo (additivo)
  switch (tipo) {
    case "none":
      return "bg-muted text-muted-foreground";
    case "percentuale":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border-amber-200 dark:border-amber-800";
    case "fisso_pz":
    case "fisso_mq":
    case "fisso_ml":
    case "fisso_mc":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

const MAGGIORAZIONE_OPTIONS: Array<{
  value: MaggiorazioneTipo;
  label: string;
  hint: string;
}> = [
  {
    value: "none",
    label: "Nessuna",
    hint: "Stesso prezzo del valore default — nessun ricarico.",
  },
  {
    value: "percentuale",
    label: "% sul prezzo base",
    hint: "Ricarico proporzionale al prezzo. Ideale per varianti strutturali (colore, apertura).",
  },
  {
    value: "fisso_pz",
    label: "€ fissi per pezzo",
    hint: "Importo fisso per unità venduta. Indipendente da taglia e mq.",
  },
  {
    value: "fisso_mq",
    label: "€ fissi al m²",
    hint: "Moltiplicato per la superficie del serramento (es. vetri).",
  },
  {
    value: "fisso_ml",
    label: "€ fissi al metro lineare",
    hint: "Moltiplicato per i metri lineari: nel preventivo serramenti è la larghezza (es. davanzali, coprifili).",
  },
  {
    value: "fisso_mc",
    label: "€ fissi al m³",
    hint: "Moltiplicato per il volume (raro, usato per imballaggi).",
  },
];

/**
 * Suggerimenti rapidi per il nome asse — mostrati come chip sopra l'input
 * nella creazione manuale. Copertura tipica serramenti / porte / persiane.
 */
const AXIS_NAME_SUGGESTIONS: Array<{
  nome: string;
  icona: string;
  hint: string;
}> = [
  { nome: "Colore", icona: "🎨", hint: "Finitura/colorazione esterna" },
  { nome: "Vetro", icona: "🪟", hint: "Tipologia di vetrata" },
  { nome: "Apertura", icona: "↔️", hint: "Tipo apertura/meccanismo" },
  { nome: "Materiale", icona: "🪵", hint: "Materiale del pannello/struttura" },
  { nome: "Finitura", icona: "✨", hint: "Rivestimento superficiale" },
  { nome: "Ferramenta", icona: "🔧", hint: "Tipo ferramenta/maniglia" },
  { nome: "Verso apertura", icona: "↩️", hint: "Destra/sinistra/reversibile" },
  { nome: "Maniglia", icona: "✋", hint: "Tipologia maniglia/pomolo" },
  { nome: "Chiusura", icona: "🔐", hint: "Cilindro/defender/smart lock" },
  { nome: "Meccanismo", icona: "⚙️", hint: "Manuale o motorizzato" },
  { nome: "Taglia", icona: "📏", hint: "Dimensioni preimpostate" },
];

function slugifyCodice(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Upload immagine propria della variante sul bucket pubblico article-images
 *  (path {company}/variant-{valueId}.ext), ritorna URL pubblico con cache-bust. */
async function uploadVariantImage(companyId: string, valueId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${companyId}/variant-${valueId}.${ext}`;
  const { error } = await supabase.storage
    .from("article-images")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from("article-images").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

interface Props {
  family: FamilyWithAxes;
}

export function FamilyAxesEditor({ family }: Props) {
  const {
    createAxis,
    updateAxis,
    deleteAxis,
    createAxisValue,
    updateAxisValue,
    deleteAxisValue,
    bulkInsertAxesWithValues,
    saveOptions,
  } = useFamilyMutations();

  const companyId = useEffectiveCompanyId();
  // Variante di cui gestire le schede PDF (Dialog dedicato).
  const [docsForValue, setDocsForValue] = useState<AxisValue | null>(null);
  // Conteggio schede per variante → badge sul pulsante 📄 (1 query, no N+1).
  const {
    data: variantDocCounts = {},
    refetch: refetchDocCounts,
    isError: docCountsError,
  } = useQuery({
    queryKey: ["family-variant-doc-counts", family.id],
    enabled: !!family.id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("article_family_documents")
        .select("axis_value_id")
        .eq("family_id", family.id)
        .not("axis_value_id", "is", null);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ axis_value_id: string | null }>) {
        if (r.axis_value_id) m[r.axis_value_id] = (m[r.axis_value_id] ?? 0) + 1;
      }
      return m;
    },
  });

  // M-33 (audit): in errore i badge documenti mostravano 0 schede come se
  // fosse il dato reale. Toast una-tantum per rendere visibile il fallimento.
  useEffect(() => {
    if (docCountsError) {
      toast.warning("Conteggio schede PDF non disponibile", {
        description:
          "I badge documenti delle varianti potrebbero essere incompleti. Ricarica la pagina per riprovare.",
      });
    }
  }, [docCountsError]);

  // Immagine propria della variante: input file riusabile (pattern come foto lotto).
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const imgTargetIdRef = useRef<string | null>(null);
  const [uploadingImgId, setUploadingImgId] = useState<string | null>(null);
  const handlePickImageFor = (valueId: string) => {
    imgTargetIdRef.current = valueId;
    imgInputRef.current?.click();
  };
  const handleImgInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const valueId = imgTargetIdRef.current;
    e.target.value = "";
    imgTargetIdRef.current = null;
    if (!file || !valueId || !companyId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Seleziona un'immagine");
      return;
    }
    setUploadingImgId(valueId);
    try {
      const url = await uploadVariantImage(companyId, valueId, file);
      await updateAxisValue.mutateAsync({ id: valueId, familyId: family.id, patch: { immagine_url: url } });
      toast.success("Immagine variante aggiornata");
    } catch (err) {
      toast.error("Immagine non caricata", { description: messaggioErroreListino(err) });
    } finally {
      setUploadingImgId(null);
    }
  };

  const [newAxisOpen, setNewAxisOpen] = useState(false);
  // Multi-open: più assi possono essere espansi insieme (era single prima).
  // Comportamento più utile nel configurare N assi in parallelo.
  const [expandedAxisIds, setExpandedAxisIds] = useState<Set<string>>(
    new Set(),
  );
  const [editingAxis, setEditingAxis] = useState<FamilyAxis | null>(null);
  const [axisToDelete, setAxisToDelete] = useState<FamilyAxis | null>(null);
  const [newValueAxisId, setNewValueAxisId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<AxisValue | null>(null);
  const [valueToDelete, setValueToDelete] = useState<AxisValue | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);

  // Statistiche famiglia per header (evita ricalcolo inline in 3+ posti).
  const stats = useMemo(() => {
    const totValori = family.axes.reduce(
      (acc, ax) => acc + ax.values.length,
      0,
    );
    const obbligatori = family.axes.filter((a) => a.obbligatorio).length;
    const conMaggiorazione = family.axes.reduce(
      (acc, ax) =>
        acc +
        ax.values.filter((v) => v.maggiorazione_tipo !== "none").length,
      0,
    );
    const senzaDefault = family.axes.filter(
      (a) => a.obbligatorio && a.values.every((v) => !v.is_default || !v.attivo),
    ).length;
    return { totValori, obbligatori, conMaggiorazione, senzaDefault };
  }, [family.axes]);

  const allExpanded =
    family.axes.length > 0 && expandedAxisIds.size === family.axes.length;
  const toggleExpandAll = () => {
    if (allExpanded) setExpandedAxisIds(new Set());
    else setExpandedAxisIds(new Set(family.axes.map((a) => a.id)));
  };
  const toggleExpandOne = (id: string) => {
    setExpandedAxisIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Prossimo sort_order (step 10) — utility usata dai dialog e dal bulk preset.
  const nextAxisSortOrder = useMemo(
    () =>
      family.axes.length > 0
        ? Math.max(...family.axes.map((a) => a.sort_order)) + 10
        : 0,
    [family.axes],
  );

  // ── Riordino assi ──────────────────────────────────────────────────────
  // M-S (audit): niente più swap dei due sort_order — sulle righe legacy
  // (tutte a sort_order 0) lo swap era un no-op e le frecce non muovevano
  // nulla. Rinumeriamo l'intera lista a passi di 10 dopo lo scambio di
  // posizione, aggiornando solo le righe il cui sort_order cambia. Il catch
  // mostra un toast: l'onError del hook fa solo telemetria (finding 12).
  const moveAxis = async (axis: FamilyAxis, direction: "up" | "down") => {
    const sorted = [...family.axes].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((a) => a.id === axis.id);
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sorted.length) return;

    [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
    try {
      await Promise.all(
        sorted
          .map((a, i) => ({ row: a, order: i * 10 }))
          .filter(({ row, order }) => row.sort_order !== order)
          .map(({ row, order }) =>
            updateAxis.mutateAsync({
              id: row.id,
              familyId: family.id,
              patch: { sort_order: order },
            }),
          ),
      );
    } catch (err) {
      toast.error("Opzioni non riordinate", {
        description: messaggioErroreListino(err),
      });
    }
  };

  // ── #9 Riordino valori dentro un asse ────────────────────────────────
  const moveValue = async (
    axis: FamilyWithAxes["axes"][number],
    valueId: string,
    direction: "up" | "down",
  ) => {
    const sorted = [...axis.values].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((v) => v.id === valueId);
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sorted.length) return;

    [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
    try {
      await Promise.all(
        sorted
          .map((v, i) => ({ row: v, order: i * 10 }))
          .filter(({ row, order }) => row.sort_order !== order)
          .map(({ row, order }) =>
            updateAxisValue.mutateAsync({
              id: row.id,
              familyId: family.id,
              patch: { sort_order: order },
            }),
          ),
      );
    } catch (err) {
      toast.error("Scelte non riordinate", {
        description: messaggioErroreListino(err),
      });
    }
  };

  // ── #10 Bulk operations sui valori ──────────────────────────────────
  const [selectedValueIds, setSelectedValueIds] = useState<Set<string>>(new Set());
  const toggleValueSelection = (id: string) => {
    setSelectedValueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedValueIds(new Set());
  const [bulkType, setBulkType] = useState<"percentuale" | "fisso_pz" | null>(null);

  const bulkActivity = async (attivo: boolean) => {
    try {
      await saveOptions.mutateAsync({ familyId: family.id, valueIds: [...selectedValueIds], patch: { attivo } });
      toast.success(`${selectedValueIds.size} scelte ${attivo ? "attivate" : "disattivate"}`);
      clearSelection();
    } catch (err) {
      toast.error("Modifica non salvata", { description: messaggioErroreListino(err) });
    }
  };
  const bulkDeactivate = () => bulkActivity(false);
  const bulkActivate = () => bulkActivity(true);
  const bulkApplyMaggiorazione = async (tipo: MaggiorazioneTipo, vendita: number, acquisto?: number) => {
    try {
      await saveOptions.mutateAsync({
        familyId: family.id, valueIds: [...selectedValueIds],
        patch: { maggiorazione_tipo: tipo, maggiorazione_valore: vendita,
          ...(acquisto === undefined ? {} : { maggiorazione_acquisto: acquisto }) },
      });
      toast.success("Supplementi aggiornati");
      setBulkType(null); clearSelection();
    } catch (err) {
      toast.error("Modifica non salvata", { description: messaggioErroreListino(err) });
    }
  };

  // Applica un preset: traduce PresetAxis[] → payload bulkInsertAxesWithValues.
  // Il sort_order parte da `nextAxisSortOrder` e cresce di 10 per asse (mantiene
  // spazio per riordini manuali successivi). Idem per i valori (step 10).
  const handleApplyPresets = async (
    presets: import("@/lib/axisPresets").PresetAxis[],
  ) => {
    try {
      const payloadAxes = presets.map((p, i) => ({
        nome: p.nome,
        codice: p.codice,
        descrizione: p.descrizione ?? null,
        tipo: "discrete" as AxisTipo,
        obbligatorio: p.obbligatorio,
        sort_order: nextAxisSortOrder + i * 10,
        values: p.values.map((v, j) => ({
          valore: v.valore,
          label: v.label,
          descrizione: v.descrizione ?? null,
          is_default: v.is_default ?? false,
          maggiorazione_tipo: v.maggiorazione_tipo,
          maggiorazione_valore: v.maggiorazione_valore,
          maggiorazione_acquisto:
            v.maggiorazione_acquisto ?? v.maggiorazione_valore,
          sort_order: j * 10,
          attivo: true,
        })),
      }));
      const res = await bulkInsertAxesWithValues.mutateAsync({
        familyId: family.id,
        axes: payloadAxes,
      });
      toast.success(
        `Preset applicato: ${res.axesCreated} variabili, ${res.valuesCreated} valori`,
      );
      setPresetsOpen(false);
    } catch (err) {
      toast.error("Modello non applicato", {
        description: messaggioErroreListino(err),
      });
    }
  };

  // Duplica un valore: crea una copia incrementando il codice con "_copia".
  // Non imposta is_default (mai duplicare il default — creerebbe conflitti).
  const duplicateValue = async (ax: FamilyWithAxes["axes"][number], v: AxisValue) => {
    try {
      const baseCodice = v.valore;
      const existingCodici = new Set(ax.values.map((x: any) => x.valore));
      let newCodice = `${baseCodice}_copia`;
      let i = 2;
      while (existingCodici.has(newCodice)) {
        newCodice = `${baseCodice}_copia${i}`;
        i++;
      }
      const maxSort = Math.max(...ax.values.map((x: any) => x.sort_order), 0);
      // M-T (audit): la copia perdeva codice SKU, prezzi assoluti di variante
      // e immagine — chi duplicava un modulo FV si ritrovava una variante a
      // prezzo base. Il codice viene suffissato per non duplicare lo SKU
      // (collegherebbe la stessa giacenza magazzino a due varianti).
      const existingSku = new Set(
        ax.values.map((x: any) => x.codice).filter(Boolean) as string[],
      );
      let newSku = v.codice ? `${v.codice}_copia` : null;
      let s = 2;
      while (newSku && existingSku.has(newSku)) {
        newSku = `${v.codice}_copia${s}`;
        s++;
      }
      await createAxisValue.mutateAsync({
        familyId: family.id,
        axis_id: ax.id,
        valore: newCodice,
        label: `${v.label} (copia)`,
        descrizione: v.descrizione,
        is_default: false,
        maggiorazione_tipo: v.maggiorazione_tipo,
        maggiorazione_valore: v.maggiorazione_valore,
        maggiorazione_acquisto: v.maggiorazione_acquisto,
        codice: newSku,
        prezzo_vendita: v.prezzo_vendita,
        prezzo_acquisto: v.prezzo_acquisto,
        immagine_url: v.immagine_url,
        opzioni: vociDi(v),
        sort_order: maxSort + 10,
        attivo: v.attivo,
      });
      toast.success(`Valore "${v.label}" duplicato`);
    } catch (err) {
      toast.error("Scelta non duplicata", {
        description: messaggioErroreListino(err),
      });
    }
  };

  return (
    <div className="space-y-3">
      <CatalogoColoriEditor key={family.id} family={family} />
      {/* Header: titolo + statistiche + azioni globali */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium flex items-center gap-2">
            Opzioni prodotto
            {family.axes.length > 0 ? (
              <span className="text-xs font-normal text-muted-foreground">
                ({family.axes.length} gruppi · {stats.totValori} scelte)
              </span>
            ) : null}
          </h3>
          {family.axes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {stats.obbligatori > 0 ? (
                <Badge variant="secondary" className="text-[10px]">
                  {stats.obbligatori} obbligator{stats.obbligatori === 1 ? "io" : "i"}
                </Badge>
              ) : null}
              {stats.conMaggiorazione > 0 ? (
                <Badge variant="outline" className="text-[10px]">
                  {stats.conMaggiorazione} con maggiorazione
                </Badge>
              ) : null}
              {stats.senzaDefault > 0 ? (
                <Badge
                  variant="outline"
                  className="text-[10px] border-destructive text-destructive"
                  role="alert"
                >
                  ⚠ {stats.senzaDefault} obbligatori senza default
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {family.axes.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleExpandAll}
              className="h-9"
              aria-label={allExpanded ? "Chiudi tutte le variabili" : "Espandi tutte le variabili"}
            >
              <ChevronsUpDown className="h-4 w-4 mr-1" aria-hidden="true" />
              {allExpanded ? "Chiudi tutto" : "Espandi tutto"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPresetsOpen(true)}
            className="h-9"
          >
            <Sparkles className="h-4 w-4 mr-1" aria-hidden="true" />
            Applica preset
          </Button>
          <Button
            size="sm"
            onClick={() => setNewAxisOpen(true)}
            className="h-9"
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            Aggiungi opzione
          </Button>
        </div>
      </div>

      {/* #10 — Barra bulk actions (visibile solo se ≥1 valore selezionato) */}
      {selectedValueIds.size > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-primary/10 border border-primary/30 rounded-md px-3 py-2 text-sm">
          <span className="font-medium">{selectedValueIds.size} selezionati</span>
          <span className="flex-1" />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={bulkActivate} disabled={saveOptions.isPending}>
            Attiva
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={bulkDeactivate} disabled={saveOptions.isPending}>
            Disattiva
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setBulkType("percentuale")}
            disabled={saveOptions.isPending}
          >
            Applica %
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setBulkType("fisso_pz")}
            disabled={saveOptions.isPending}
          >
            Applica €
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearSelection} disabled={saveOptions.isPending}>
            Annulla
          </Button>
        </div>
      ) : null}

      {family.axes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Nessuna variabile configurata. Puoi partire da zero o applicare un{" "}
              <strong className="text-foreground">preset rapido</strong> per serramenti
              (colore, vetro, apertura, ferramenta).
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                size="sm"
                onClick={() => setPresetsOpen(true)}
                className="w-full sm:w-auto"
              >
                <Sparkles className="h-4 w-4 mr-1" aria-hidden="true" />
                Applica preset serramenti
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNewAxisOpen(true)}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                Crea manualmente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Hint educativo: chiarisce all'admin il rapporto tra "valore
              standard" (is_default) e prezzo base dell'articolo. Senza
              questa nota e' facile confondersi pensando che ogni valore
              debba avere una maggiorazione esplicita. */}
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-[11px] text-emerald-900 leading-relaxed">
            <span className="font-semibold">Come funziona:</span> la scelta <strong>predefinita</strong> è proposta nel preventivo. Il suo prezzo può essere incluso, avere un supplemento oppure sostituire il prezzo base: sono impostazioni separate.
          </div>
          {family.axes.map((axis, idx) => {
            const isExpanded = expandedAxisIds.has(axis.id);
            // Solo i valori accesi: uno standard spento nel preventivo non si propone.
            const defaults = axis.values.filter((v) => v.is_default && v.attivo).length;
            return (
              <Card key={axis.id}>
                <CardHeader className="pb-2 p-3 sm:p-4">
                  <div className="flex items-start gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpandOne(axis.id)}
                      className="flex-1 text-left flex items-start gap-2 min-w-0 py-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Chiudi" : "Apri"} variabile ${axis.nome}`}
                    >
                      <ChevronRight
                        className={`h-4 w-4 mt-0.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm truncate">
                          {axis.nome}

                        </CardTitle>
                        <div className="flex flex-wrap gap-1.5 items-center mt-1">
                          <Badge variant="outline" className="text-[10px] sm:text-xs">
                            {axis.tipo === "boolean" ? "Sì / No" : "Scelta"}
                          </Badge>
                          {axis.obbligatorio ? (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">
                              obbligatorio
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {axis.values.filter(v => v.attivo).length} scelte attive
                          </span>
                          {axis.visibile_se ? <span className="text-xs text-muted-foreground">Solo con {family.axes.find(a => a.codice === axis.visibile_se?.asse)?.nome ?? axis.visibile_se.asse}</span> : null}
                          {defaults > 1 ? <span className="text-xs text-destructive" role="alert">Più scelte predefinite: da correggere</span> : null}
                          {axis.obbligatorio && defaults === 0 ? (
                            <span className="text-xs text-destructive" role="alert">⚠ nessuno standard acceso</span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingAxis(axis)} aria-label="Modifica variabile"><Pencil className="h-4 w-4" /></Button>
                      <DropdownMenu><DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Altre azioni ${axis.nome}`}><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger><DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={idx === 0 || updateAxis.isPending} onSelect={() => moveAxis(axis, "up")}>Sposta su</DropdownMenuItem>
                        <DropdownMenuItem disabled={idx === family.axes.length - 1 || updateAxis.isPending} onSelect={() => moveAxis(axis, "down")}>Sposta giù</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => setAxisToDelete(axis)}>Elimina opzione</DropdownMenuItem>
                      </DropdownMenuContent></DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded ? (
                  <CardContent className="pt-0 p-3 sm:p-4 space-y-2">
                    {axis.values.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nessun valore. Aggiungi almeno un valore.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {axis.values.map((v) => {
                          const magLabel = maggiorazioneLabel(
                            v.maggiorazione_tipo,
                            v.maggiorazione_valore,
                          );
                          const magBadgeClass = maggiorazioneBadgeClass(
                            v.maggiorazione_tipo,
                          );
                          return (
                            <li
                              key={v.id}
                              className={`flex items-start gap-1.5 sm:gap-2 text-sm p-2 rounded-md border ${
                                selectedValueIds.has(v.id) ? "bg-primary/5 border-primary/40" : ""
                              }`}
                            >
                              {/* #10 — Checkbox bulk-select */}
                              <Checkbox
                                checked={selectedValueIds.has(v.id)}
                                onCheckedChange={() => toggleValueSelection(v.id)}
                                className="mt-1 shrink-0"
                                aria-label={`Seleziona ${v.label}`}
                              />
                              {/* Immagine propria della variante — click per caricare/cambiare */}
                              <button
                                type="button"
                                onClick={() => handlePickImageFor(v.id)}
                                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted"
                                title={v.immagine_url ? "Cambia immagine variante" : "Aggiungi immagine variante"}
                                aria-label={`Immagine variante ${v.label}`}
                              >
                                {uploadingImgId === v.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : v.immagine_url ? (
                                  <img src={v.immagine_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium break-words">
                                    {v.label}
                                  </span>

                                  {vociDi(v).length > 0 ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] sm:text-xs"
                                      title={vociDi(v).join(", ")}
                                    >
                                      comprende {vociDi(v).length} {vociDi(v).length === 1 ? "voce" : "voci"}
                                    </Badge>
                                  ) : null}
                                  {v.prezzo_vendita != null && v.prezzo_vendita > 0 ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] sm:text-xs border-emerald-300 text-emerald-700"
                                      title={
                                        family.modalita_prezzo_base === "griglia"
                                          ? prezzoProprioVariante("griglia").aiuto
                                          : undefined
                                      }
                                    >
                                      Vendita €{Number(v.prezzo_vendita).toLocaleString("it-IT")}
                                      {family.modalita_prezzo_base === "mq" ? "/m²" : ""}
                                    </Badge>
                                  ) : null}
                                  {v.is_default ? (
                                    // Preselezione e inclusione nel prezzo sono indipendenti.
                                    <Badge
                                      className="text-[10px] sm:text-xs bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                    >
                                      Predefinita
                                    </Badge>
                                  ) : null}
                                  {!v.attivo ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] sm:text-xs"
                                    >
                                      non attivo
                                    </Badge>
                                  ) : null}
                                  {magLabel ? (
                                    <Badge
                                      className={`text-[10px] sm:text-xs ${magBadgeClass}`}
                                      title={
                                        v.maggiorazione_tipo === "percentuale"
                                          ? "Maggiorazione percentuale sul prezzo base"
                                          : "Maggiorazione fissa additiva"
                                      }
                                    >
                                      Vendita {magLabel}
                                    </Badge>
                                  ) : null}
                                  {v.maggiorazione_tipo !== "none" &&
                                  !(Number(v.prezzo_vendita) > 0) ? (
                                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                                      Costo {formattaMaggiorazione(v.maggiorazione_tipo, v.maggiorazione_acquisto) || "nessun supplemento"}
                                    </span>
                                  ) : null}
                                  {Number(v.prezzo_vendita) > 0 ? (
                                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                                      {Number(v.prezzo_acquisto) > 0
                                        ? `Costo €${Number(v.prezzo_acquisto).toLocaleString("it-IT")}${family.modalita_prezzo_base === "mq" ? "/m²" : ""}`
                                        : "Costo da impostare"}
                                    </span>
                                  ) : null}
                                </div>
                                {v.descrizione ? (
                                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                                    {v.descrizione}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingValue(v)} aria-label="Modifica valore"><Pencil className="h-4 w-4" /></Button>
                                <DropdownMenu><DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Altre azioni ${v.label}`}><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger><DropdownMenuContent align="end">
                                  <DropdownMenuItem disabled={axis.values[0]?.id === v.id || updateAxisValue.isPending} onSelect={() => moveValue(axis, v.id, "up")}>Sposta su</DropdownMenuItem>
                                  <DropdownMenuItem disabled={axis.values.at(-1)?.id === v.id || updateAxisValue.isPending} onSelect={() => moveValue(axis, v.id, "down")}>Sposta giù</DropdownMenuItem>
                                  <DropdownMenuItem disabled={createAxisValue.isPending} onSelect={() => duplicateValue(axis, v)}>Duplica scelta</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => setDocsForValue(v)}>Schede / PDF ({variantDocCounts[v.id] ?? "—"})</DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onSelect={() => setValueToDelete(v)}>Elimina scelta</DropdownMenuItem>
                                </DropdownMenuContent></DropdownMenu>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNewValueAxisId(axis.id)}
                      className="h-9 w-full sm:w-auto"
                    >
                      <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                      Aggiungi valore
                    </Button>
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {bulkType ? <BulkOpzioniDialog key={bulkType} initialType={bulkType}
        values={family.axes.flatMap(a => a.values).filter(v => selectedValueIds.has(v.id))}
        busy={saveOptions.isPending} onClose={() => setBulkType(null)} onApply={bulkApplyMaggiorazione} /> : null}

      {/* Dialog nuovo asse / edit asse */}
      <AxisFormDialog
        key={`axis:${newAxisOpen || !!editingAxis}:${editingAxis?.id ?? "new"}`}
        open={newAxisOpen || editingAxis !== null}
        axis={editingAxis}
        availableAxes={family.axes}
        existingCodici={family.axes.map((a) => a.codice)}
        nextSortOrder={nextAxisSortOrder}
        onClose={() => {
          setNewAxisOpen(false);
          setEditingAxis(null);
        }}
        onSave={async (values) => {
          try {
            if (editingAxis) {
              await updateAxis.mutateAsync({
                id: editingAxis.id,
                familyId: family.id,
                patch: values,
              });
              toast.success("Variabile aggiornata");
            } else {
              await createAxis.mutateAsync({
                family_id: family.id,
                nome: values.nome,
                codice: values.codice,
                descrizione: values.descrizione ?? null,
                tipo: values.tipo,
                visibile_se: values.visibile_se,
                obbligatorio: values.obbligatorio,
                sort_order: values.sort_order,
              });
              toast.success("Variabile creata");
            }
            setNewAxisOpen(false);
            setEditingAxis(null);
          } catch (err) {
            toast.error("Opzione non salvata", {
              description: messaggioErroreListino(err),
            });
          }
        }}
        saving={createAxis.isPending || updateAxis.isPending}
      />

      {/* Dialog nuovo valore / edit valore */}
      <ValueFormDialog
        key={`value:${!!newValueAxisId || !!editingValue}:${editingValue?.id ?? newValueAxisId ?? "new"}`}
        open={newValueAxisId !== null || editingValue !== null}
        value={editingValue}
        axisId={editingValue?.axis_id ?? newValueAxisId ?? ""}
        modalitaPrezzoBase={family.modalita_prezzo_base}
        existingValori={
          editingValue
            ? family.axes
                .find((a) => a.id === editingValue.axis_id)
                ?.values.filter((v) => v.id !== editingValue.id)
                .map((v) => v.valore) ?? []
            : family.axes.find((a) => a.id === newValueAxisId)?.values.map((v) => v.valore) ?? []
        }
        otherDefaultIds={
          editingValue
            ? family.axes
                .find((a) => a.id === editingValue.axis_id)
                ?.values.filter((v) => v.is_default && v.id !== editingValue.id)
                .map((v) => v.id) ?? []
            : family.axes
                .find((a) => a.id === newValueAxisId)
                ?.values.filter((v) => v.is_default)
                .map((v) => v.id) ?? []
        }
        nextSortOrder={
          editingValue
            ? editingValue.sort_order
            : (() => {
                const ax = family.axes.find((a) => a.id === newValueAxisId);
                return ax && ax.values.length > 0
                  ? Math.max(...ax.values.map((v) => v.sort_order)) + 10
                  : 0;
              })()
        }
        onClose={() => {
          setNewValueAxisId(null);
          setEditingValue(null);
        }}
        onSave={async (values) => {
          try {
            await saveOptions.mutateAsync({
              familyId: family.id, axisId: editingValue?.axis_id ?? newValueAxisId ?? "",
              valueId: editingValue?.id, patch: values,
            });
            toast.success(editingValue ? "Scelta aggiornata" : "Scelta creata");
            setNewValueAxisId(null); setEditingValue(null);
          } catch (err) {
            toast.error("Scelta non salvata", { description: messaggioErroreListino(err) });
          }
        }}
        saving={saveOptions.isPending}
      />

      {/* AlertDialog elimina asse */}
      <AlertDialog
        open={!!axisToDelete}
        onOpenChange={(open) => {
          if (deleteAxis.isPending) return;
          if (!open) setAxisToDelete(null);
        }}
      >
        <AlertDialogContent className="w-[96vw] sm:w-full sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">Eliminare variabile "{axisToDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              Verranno cancellati anche tutti i valori associati. Questa operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel disabled={deleteAxis.isPending} className="h-10 w-full sm:w-auto mt-0">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!axisToDelete) return;
                try {
                  await deleteAxis.mutateAsync({
                    id: axisToDelete.id,
                    familyId: family.id,
                  });
                  toast.success("Variabile eliminata");
                  setAxisToDelete(null);
                } catch (err) {
                  toast.error("Non eliminato", {
                    description: messaggioErroreListino(err),
                  });
                }
              }}
              disabled={deleteAxis.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog elimina valore */}
      <AlertDialog
        open={!!valueToDelete}
        onOpenChange={(open) => {
          if (deleteAxisValue.isPending) return;
          if (!open) setValueToDelete(null);
        }}
      >
        <AlertDialogContent className="w-[96vw] sm:w-full sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">Eliminare valore "{valueToDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              Sparisce anche dai preventivi che l&apos;hanno già scelto: il prezzo resta, ma la scelta non si legge più
              né nella riga né nel PDF. Se non lo vendi più, spegnilo invece di eliminarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel disabled={deleteAxisValue.isPending} className="h-10 w-full sm:w-auto mt-0">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!valueToDelete) return;
                try {
                  await deleteAxisValue.mutateAsync({
                    id: valueToDelete.id,
                    familyId: family.id,
                  });
                  toast.success("Valore eliminato");
                  setValueToDelete(null);
                } catch (err) {
                  toast.error("Non eliminato", {
                    description: messaggioErroreListino(err),
                  });
                }
              }}
              disabled={deleteAxisValue.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog preset assi — bootstrap rapido delle dimensioni tipiche */}
      <AxisPresetsDialog
        open={presetsOpen}
        onOpenChange={setPresetsOpen}
        existingCodici={family.axes.map((a) => a.codice)}
        onApply={handleApplyPresets}
        saving={bulkInsertAxesWithValues.isPending}
      />

      {/* Input file riusabile per l'immagine della variante */}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImgInputChange}
      />

      {/* Schede PDF per singola variante */}
      <Dialog
        open={!!docsForValue}
        onOpenChange={(o) => {
          if (!o) {
            setDocsForValue(null);
            refetchDocCounts();
          }
        }}
      >
        <DialogContent className="w-[96vw] sm:w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Schede della variante</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {docsForValue?.label} — carica la scheda tecnica/PDF specifica di questa variante.
            </DialogDescription>
          </DialogHeader>
          {docsForValue ? (
            <ArticlePdfDocumentsSection
              companyId={companyId}
              familyId={family.id}
              axisValueId={docsForValue.id}
              ensureFamilyId={async () => family.id}
              title="Schede della variante (PDF)"
              hint="Documenti specifici di questa variante (scheda tecnica, certificazioni). Più file, max 15 MB ciascuno."
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Dialog: Asse ────────────────────────────────────────────────────────────

interface AxisFormValues {
  nome: string;
  codice: string;
  descrizione: string | null;
  tipo: AxisTipo;
  obbligatorio: boolean;
  sort_order: number;
  visibile_se: FamilyAxis["visibile_se"];
}

function AxisFormDialog({
  open,
  axis,
  availableAxes,
  existingCodici,
  nextSortOrder,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  axis: FamilyAxis | null;
  availableAxes: FamilyWithAxes["axes"];
  existingCodici: string[];
  nextSortOrder: number;
  onClose: () => void;
  onSave: (values: AxisFormValues) => void | Promise<void>;
  saving: boolean;
}) {
  // FIX: inizializzatori lazy leggono da `axis` fin dal primo render. Sync via
  // useEffect copre il caso in cui il dialog si riusa per record diversi senza
  // unmount (Radix non sempre invoca onOpenAutoFocus al cambio key).
  const [nome, setNome] = useState<string>(() => axis?.nome ?? "");
  const [codice, setCodice] = useState<string>(() => axis?.codice ?? "");
  const [descrizione, setDescrizione] = useState<string>(() => axis?.descrizione ?? "");
  const [tipo, setTipo] = useState<AxisTipo>(() => axis?.tipo ?? "discrete");
  const [obbligatorio, setObbligatorio] = useState<boolean>(() => axis?.obbligatorio ?? true);
  const [codiceManuallyEdited, setCodiceManuallyEdited] = useState<boolean>(() => axis !== null);

  const [condizione, setCondizione] = useState<FamilyAxis["visibile_se"]>(() => axis?.visibile_se ?? null);
  const editing = axis !== null;
  const conflict =
    !editing && codice && existingCodici.includes(codice)
      ? `Codice già usato nella famiglia`
      : null;
  const problemaVisibilita = problemaCondizione(codice, condizione, availableAxes);
  const canSave = nome.trim() && codice.trim() && !conflict && !problemaVisibilita && !saving;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="flex w-[96vw] flex-col overflow-hidden sm:w-full sm:max-w-lg max-h-[90dvh]"
        key={axis?.id ?? "new"}
      >
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{editing ? "Modifica variazione" : "Nuova variazione"}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Le variazioni rappresentano le dimensioni di personalizzazione del prodotto (es. "Apertura", "Vetro", "Materiale").
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto">
          {/* Chips suggerimenti rapidi nome asse: compilano sia nome che codice
              (lo slugify si aggancia on-name-change nella textbox sottostante). */}
          {!editing ? (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">
                Suggerimenti rapidi
              </div>
              <div className="flex flex-wrap gap-1">
                {AXIS_NAME_SUGGESTIONS.map((sug) => (
                  <button
                    key={sug.nome}
                    type="button"
                    onClick={() => {
                      setNome(sug.nome);
                      setCodice(slugifyCodice(sug.nome));
                      setCodiceManuallyEdited(false);
                    }}
                    className="text-[11px] px-2 py-0.5 rounded-full border bg-muted/40 hover:bg-primary/10 hover:border-primary transition"
                    title={sug.hint}
                  >
                    {sug.icona} {sug.nome}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="axis-nome" className="text-sm font-medium">Nome</label>
            <Input
              id="axis-nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (!codiceManuallyEdited && !editing) {
                  setCodice(slugifyCodice(e.target.value));
                }
              }}
              placeholder="es. Apertura"
              autoFocus
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="axis-codice" className="text-sm font-medium">
              Codice
              {codice && !codiceManuallyEdited ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  (auto-generato dal nome)
                </span>
              ) : null}
            </label>
            <Input
              id="axis-codice"
              value={codice}
              onChange={(e) => {
                setCodice(slugifyCodice(e.target.value));
                setCodiceManuallyEdited(true);
              }}
              placeholder="apertura"
              disabled={editing}
              aria-invalid={!!conflict}
              aria-describedby={conflict ? "axis-codice-error" : "axis-codice-hint"}
              className="h-10 font-mono"
            />
            <p id="axis-codice-hint" className="text-xs text-muted-foreground">
              Identificatore snake_case usato nelle selezioni del preventivo.
            </p>
            {conflict ? (
              <p id="axis-codice-error" className="text-xs text-destructive" role="alert">{conflict}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="axis-descrizione" className="text-sm font-medium">Descrizione (opzionale)</label>
            <Textarea
              id="axis-descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={2}
              className="resize-none"
              placeholder="Dettaglio visibile ai configuratori (tooltip, aiuto contestuale)…"
            />
          </div>
          <div className="rounded-lg border p-3 space-y-2">
            <label className="text-sm font-medium">Quando mostrare questa opzione</label>
            <Select value={condizione?.asse ?? "__sempre"} onValueChange={v => setCondizione(v === "__sempre" ? null : { asse: v, valori: [] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__sempre">Sempre</SelectItem>
                {availableAxes.filter(a => a.id !== axis?.id && a.values.some(v => v.attivo)).map(a => <SelectItem key={a.id} value={a.codice}>Solo in base a {a.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {condizione ? <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Mostra quando è selezionata almeno una di queste scelte:</p>
              {availableAxes.find(a => a.codice === condizione.asse)?.values.filter(v => v.attivo).map(v => <label key={v.id} className="flex gap-2 items-center text-sm">
                <Checkbox checked={condizione.valori.includes(v.valore)} onCheckedChange={checked => setCondizione({ ...condizione, valori: checked ? [...condizione.valori, v.valore] : condizione.valori.filter(x => x !== v.valore) })} />{v.label}
              </label>)}
            </div> : null}
            {problemaVisibilita ? <p role="alert" className="text-xs text-destructive">{problemaVisibilita}</p> : null}
          </div>
          {/* Tipo asse come cards cliccabili: aumenta la leggibilità rispetto
              a un select opaco, specialmente per utenti non-tecnici. */}
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Tipo di variabile</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTipo("discrete")}
                aria-pressed={tipo === "discrete"}
                className={`text-left p-2.5 rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  tipo === "discrete"
                    ? "border-primary bg-primary/5"
                    : "hover:border-foreground/30"
                }`}
              >
                <div className="text-xs sm:text-sm font-medium">
                  📋 Lista di valori
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                  Più opzioni (es. bianco/antracite/noce)
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTipo("boolean")}
                aria-pressed={tipo === "boolean"}
                className={`text-left p-2.5 rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  tipo === "boolean"
                    ? "border-primary bg-primary/5"
                    : "hover:border-foreground/30"
                }`}
              >
                <div className="text-xs sm:text-sm font-medium">
                  ⏼ Sì / No
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                  Solo attivo/disattivo (es. "con fori ventilazione")
                </div>
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2 py-1 p-2.5 rounded-md border bg-muted/30">
            <Checkbox
              id="obbl"
              checked={obbligatorio}
              onCheckedChange={(c) => setObbligatorio(c === true)}
              className="h-5 w-5 mt-0.5"
            />
            <label htmlFor="obbl" className="text-sm cursor-pointer select-none flex-1">
              <span className="font-medium">Obbligatorio</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Se attivo, richiede una selezione esplicita nel preventivo e
                deve avere almeno un valore "default".
              </span>
            </label>
          </div>
        </div>

        <DialogFooter className="flex shrink-0 flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-10 w-full sm:w-auto"
          >
            Annulla
          </Button>
          <Button
            onClick={() =>
              onSave({
                nome: nome.trim(),
                codice: codice.trim(),
                descrizione: descrizione.trim() || null,
                tipo,
                obbligatorio,
                sort_order: axis?.sort_order ?? nextSortOrder,
                visibile_se: condizione ?? null,
              })
            }
            disabled={!canSave}
            className="h-10 w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : editing ? (
              "Aggiorna"
            ) : (
              "Crea variabile"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog: Valore ──────────────────────────────────────────────────────────

interface ValueFormValues {
  valore: string;
  label: string;
  descrizione: string | null;
  is_default: boolean;
  maggiorazione_tipo: MaggiorazioneTipo;
  maggiorazione_valore: number;
  maggiorazione_acquisto: number;
  codice: string | null;
  prezzo_vendita: number | null;
  prezzo_acquisto: number | null;
  sort_order: number;
  attivo: boolean;
  /** Cosa comprende: i colori di «Colore Standard». */
  opzioni: string[];
}

// Importi del dialog: virgola decimale (la tastiera iOS con inputMode="decimal"
// la produce) e punto delle migliaia, come nel listino fornitore. Prima
// «1.234,56» diventava 0.
// Il prezzo proprio della variante non è mai negativo; la maggiorazione sì
// (05/10/2026): una linea che costa meno si scrive −8 (%), e il vecchio minimo
// a 0 la riportava a 0% a ogni salvataggio, anche solo rinominando il valore.
export const leggiPrezzo = (raw: string): number => Math.max(0, parseImporto(raw) || 0);
export const leggiMaggiorazione = (raw: string): number => parseImporto(raw) || 0;

/**
 * Il tasto «±» accanto alla maggiorazione: la tastiera decimale di iOS non ha
 * il meno, e da telefono una linea che costa meno non si poteva scrivere.
 */
export function cambiaSegno(raw: string): string {
  const s = raw.trim();
  if (!s || leggiMaggiorazione(s) === 0) return s;
  return s.startsWith("-") ? s.slice(1) : `-${s}`;
}

/** Una riduzione percentuale oltre il 100% porterebbe il prezzo sotto zero. */
export function problemaMaggiorazione(
  tipo: MaggiorazioneTipo,
  vendita: number,
  acquisto: number,
): string | null {
  if (tipo === "percentuale" && (vendita < -100 || acquisto < -100)) {
    return "Una riduzione non può superare il 100%: il prezzo andrebbe sotto zero.";
  }
  return null;
}

/** Valore dei prompt «Applica %/€» (stesse regole del dialog). Null se non va. */
export function leggiValoreBulk(raw: string, percentuale: boolean): number | null {
  const n = Number(raw.trim().replace(/[−–]/g, "-").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (percentuale && n < -100) return null;
  return n;
}

/**
 * Unità e spiegazione del prezzo proprio della variante, per il prodotto che
 * si sta modificando (05/10/2026). Nei preventivi (calcolaPrezzoFamiglia e il
 * motore serramenti) sostituisce il prezzo base, moltiplicato per i m² nei
 * prodotti al m², e non si applica ai prodotti a griglia, dove il prezzo è
 * quello della cella L×H. Prima diceva «€» e «vale ovunque» per tutti: chi
 * vende al m² scriveva il prezzo del pezzo intero.
 */
export function prezzoProprioVariante(
  modalita: ModalitaPrezzoBase | null | undefined,
): { unita: string; aiuto: string } {
  if (modalita === "mq") {
    return {
      unita: "€/m²",
      aiuto:
        "Prezzo al m²: nel preventivo si moltiplica per la superficie e sostituisce il prezzo base al m², non lo modifica. Cambiarlo per questa variante non tocca le altre. Lasciato vuoto, conta la maggiorazione qui sotto.",
    };
  }
  if (modalita === "griglia") {
    return {
      unita: "€",
      aiuto:
        "Questo prodotto prende il prezzo dalla griglia L×H: nei preventivi il prezzo proprio non si applica e conta la maggiorazione qui sotto.",
    };
  }
  return {
    unita: "€",
    aiuto:
      "Il prezzo proprio vale ovunque — ordini, commesse e preventivi (serramenti compresi) — quando la variante è un prodotto a sé: sostituisce il prezzo base, non lo modifica. Cambiarlo per questa variante non tocca le altre. Lasciato vuoto, conta la maggiorazione qui sotto.",
  };
}

function ValueFormDialog({
  open,
  value,
  axisId,
  modalitaPrezzoBase,
  existingValori,
  otherDefaultIds,
  nextSortOrder,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  value: AxisValue | null;
  axisId: string;
  modalitaPrezzoBase: ModalitaPrezzoBase;
  existingValori: string[];
  otherDefaultIds: string[];
  nextSortOrder: number;
  onClose: () => void;
  onSave: (values: ValueFormValues, otherDefaultIds: string[]) => void | Promise<void>;
  saving: boolean;
}) {
  // FIX edit dialog precarica vuoto: gli useState dovevano leggere da `value`
  // fin dal primo render. Inizializzatori lazy + sync via useEffect risolvono
  // il caso in cui il dialog si riusa per record diversi senza unmount
  // (onOpenAutoFocus di Radix non sempre scatta in re-mount via key).
  const [valore, setValore] = useState<string>(() => value?.valore ?? "");
  const [label, setLabel] = useState<string>(() => value?.label ?? "");
  const [descrizione, setDescrizione] = useState<string>(() => value?.descrizione ?? "");
  const [isDefault, setIsDefault] = useState<boolean>(() => value?.is_default ?? (otherDefaultIds.length === 0));
  const [attivo, setAttivo] = useState<boolean>(() => value?.attivo ?? true);
  const [magTipo, setMagTipo] = useState<MaggiorazioneTipo>(() => value?.maggiorazione_tipo ?? "none");
  const [magValore, setMagValore] = useState<string>(() => (value ? String(value.maggiorazione_valore) : "0"));
  const [magAcquisto, setMagAcquisto] = useState<string>(() => (value ? String(value.maggiorazione_acquisto) : "0"));
  const [codiceArt, setCodiceArt] = useState<string>(() => value?.codice ?? "");
  const [prezzoV, setPrezzoV] = useState<string>(() => (value?.prezzo_vendita != null ? String(value.prezzo_vendita) : ""));
  const [prezzoA, setPrezzoA] = useState<string>(() => (value?.prezzo_acquisto != null ? String(value.prezzo_acquisto) : ""));
  const [modoPrezzo, setModoPrezzo] = useState<"incluso" | "supplemento" | "sostitutivo">(() =>
    Number(value?.prezzo_vendita) > 0 && modalitaPrezzoBase !== "griglia" ? "sostitutivo" : value?.maggiorazione_tipo && value.maggiorazione_tipo !== "none" ? "supplemento" : "incluso");
  const [voci, setVoci] = useState<string>(() => vociDi(value).join("\n"));
  const [valoreManuallyEdited, setValoreManuallyEdited] = useState<boolean>(() => value !== null);

  // Sincronizza il form ogni volta che cambia il record selezionato (open→close→
  // open su record diverso) o si apre/chiude. Difende dal caso in cui Radix
  // non chiama onOpenAutoFocus al re-mount via `key`.
  const editing = value !== null;
  const conflict =
    !editing && valore && existingValori.includes(valore)
      ? "Valore già presente su questa variabile"
      : null;
  const vociPulite = pulisciVoci(dividiVoci(voci));
  const problemaElenco = problemaVoci(label.trim() || "Questo valore", vociPulite);
  const problemaMagg = problemaMaggiorazione(
    magTipo,
    leggiMaggiorazione(magValore),
    leggiMaggiorazione(magAcquisto),
  );
  const prezzoProprio = prezzoProprioVariante(modalitaPrezzoBase);
  const prezziValidi = prezzoOpzioneValido(prezzoV) && prezzoOpzioneValido(prezzoA);
  const supplementiValidi = magTipo === "none" || [magValore, magAcquisto].every(s => s.trim() && Number.isFinite(Number(s.replace(",", "."))));
  const canSave =
    label.trim() && valore.trim() && !conflict && !problemaElenco && !problemaMagg && prezziValidi &&
    supplementiValidi && (!isDefault || attivo) && (modoPrezzo !== "sostitutivo" || Number(prezzoV) > 0) && !saving;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="flex w-[96vw] flex-col overflow-hidden sm:w-full sm:max-w-3xl max-h-[90dvh]"
        key={value?.id ?? `new-${axisId}`}
      >
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{editing ? "Modifica scelta" : "Nuova scelta"}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Nome e disponibilità a sinistra. Prezzo di vendita e costo fornitore a destra.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-5 overflow-y-auto sm:grid-cols-2">
          <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="val-label" className="text-sm font-medium">Nome della scelta</label>
            <Input
              id="val-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!valoreManuallyEdited && !editing) {
                  setValore(slugifyCodice(e.target.value));
                }
              }}
              placeholder="es. PVC bianco"
              autoFocus
              className="h-10"
            />
          </div>
          <details className="rounded-lg border p-3" open={!!conflict}>
            <summary className="cursor-pointer text-sm text-muted-foreground">Codice e descrizione</summary>
          <div className="space-y-1.5 pt-2">
            <label htmlFor="val-codice" className="text-sm font-medium">Codice valore</label>
            <Input
              id="val-codice"
              value={valore}
              onChange={(e) => {
                setValore(slugifyCodice(e.target.value));
                setValoreManuallyEdited(true);
              }}
              disabled={editing}
              placeholder="pvc_bianco"
              aria-invalid={!!conflict}
              aria-describedby={conflict ? "val-codice-error" : undefined}
              className="h-10 font-mono"
            />
            {conflict ? (
              <p id="val-codice-error" className="text-xs text-destructive" role="alert">{conflict}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="val-descrizione" className="text-sm font-medium">Descrizione (opzionale)</label>
            <Textarea
              id="val-descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          </details>
          {/* Cosa comprende: per una fascia come «Colore Standard» i colori veri.
              Nel preventivo si sceglie uno di questi, al prezzo del valore. */}
          <details className="rounded-lg border p-3" open={!!problemaElenco}>
            <summary className="cursor-pointer text-sm text-muted-foreground">Colori e scelte comprese ({vociPulite.length})</summary>
            <div className="space-y-1.5 pt-2">
            <label htmlFor="val-voci" className="text-sm font-medium">Cosa comprende (opzionale)</label>
            <Textarea
              id="val-voci"
              value={voci}
              onChange={(e) => setVoci(e.target.value)}
              rows={3}
              placeholder={"Uno per riga, per esempio:\nGrigio antracite RAL 7016\nEffetto legno noce"}
              aria-describedby="val-voci-aiuto"
              className="resize-y"
            />
            <p id="val-voci-aiuto" className="text-[11px] text-muted-foreground">
              Per una fascia di prezzo come «Colore Standard»: i colori che ci stanno dentro. Nel preventivo si sceglie
              uno di questi, al prezzo di questo valore.
            </p>
            {problemaElenco ? (
              <p className="text-xs text-destructive" role="alert">{problemaElenco}</p>
            ) : null}
            </div>
          </details>

          {!prezziValidi ? <p role="alert" className="text-xs text-destructive">I prezzi devono essere numeri validi, non negativi.</p> : null}
          {isDefault && !attivo ? <p role="alert" className="text-xs text-destructive">Una scelta predefinita deve essere attiva.</p> : null}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 py-1">
              <Checkbox
                id="val-default"
                checked={isDefault}
                onCheckedChange={(c) => setIsDefault(c === true)}
                className="h-5 w-5"
              />
              <label htmlFor="val-default" className="text-sm cursor-pointer select-none">
                Predefinita nel preventivo
              </label>
            </div>
            <div className="flex items-center gap-2 py-1">
              <Checkbox
                id="val-attivo"
                checked={attivo}
                onCheckedChange={(c) => setAttivo(c === true)}
                className="h-5 w-5"
              />
              <label htmlFor="val-attivo" className="text-sm cursor-pointer select-none">
                Attivo
              </label>
            </div>
          </div>

          </div>
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <label htmlFor="val-modo-prezzo" className="text-sm font-medium">Prezzo della scelta</label>
            <Select value={modoPrezzo} onValueChange={v => {
              const mode = v as typeof modoPrezzo; setModoPrezzo(mode);
              if (mode !== "sostitutivo") { setPrezzoV(""); setPrezzoA(""); }
              if (mode !== "supplemento") { setMagTipo("none"); setMagValore("0"); setMagAcquisto("0"); }
              else if (magTipo === "none") setMagTipo("percentuale");
            }}>
              <SelectTrigger id="val-modo-prezzo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incluso">Inclusa nel prezzo base</SelectItem>
                <SelectItem value="supplemento">Supplemento / riduzione</SelectItem>
                {modalitaPrezzoBase !== "griglia" ? <SelectItem value="sostitutivo">Sostituisce il prezzo base</SelectItem> : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{modoPrezzo === "incluso" ? "Nessuna variazione di vendita sul prezzo base." : modoPrezzo === "sostitutivo" ? "La vendita parte da questo prezzo, non dalla base del prodotto." : "Si applica al prezzo base solo quando viene selezionata."}</p>
            {Number(prezzoV) > 0 && magTipo !== "none" && modalitaPrezzoBase !== "griglia" ? <p role="note" className="text-xs text-amber-800">Configurazione esistente: il prezzo sostitutivo prevale sul supplemento. I dati restano invariati finché non cambi modalità.</p> : null}
          </div>
          {/* Prezzi sostitutivi e dati tecnici legacy delle griglie. */}
          {(modoPrezzo === "sostitutivo" || prezzoV.trim() || prezzoA.trim()) ? <div className="rounded-md border p-3 space-y-2.5">
            <div className="text-sm font-medium">Codice e prezzo variante</div>
            <div className="space-y-1">
              <label htmlFor="val-codice-art" className="text-xs text-muted-foreground">
                Codice articolo / SKU <span className="text-[10px]">(collega alla giacenza di magazzino)</span>
              </label>
              <Input
                id="val-codice-art"
                value={codiceArt}
                onChange={(e) => setCodiceArt(e.target.value)}
                placeholder="es. 0541"
                className="h-10 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="val-prezzo-v" className="text-xs text-muted-foreground">
                  Prezzo vendita {prezzoProprio.unita}
                </label>
                <Input id="val-prezzo-v" type="number" inputMode="decimal" step="0.01" min={0} value={prezzoV}
                  onChange={(e) => setPrezzoV(e.target.value)} placeholder="0,00" className="h-10 font-mono" />
              </div>
              <div className="space-y-1">
                <label htmlFor="val-prezzo-a" className="text-xs text-muted-foreground">
                  Prezzo acquisto {prezzoProprio.unita}
                </label>
                <Input id="val-prezzo-a" type="number" inputMode="decimal" step="0.01" min={0} value={prezzoA}
                  onChange={(e) => setPrezzoA(e.target.value)} placeholder="0,00" className="h-10 font-mono" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{prezzoProprio.aiuto}</p>
          </div>

          : <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">Codice articolo / SKU</summary>
              <Input aria-label="Codice articolo / SKU" className="mt-2" value={codiceArt} onChange={e => setCodiceArt(e.target.value)} />
            </details>}
          {(modoPrezzo === "supplemento" || magTipo !== "none") ? <div className="border rounded-md p-3 space-y-2.5 bg-muted/30">
            <div className="text-sm font-medium">Supplemento / riduzione</div>
            <div className="space-y-1">
              <label htmlFor="val-mag-tipo" className="text-xs text-muted-foreground">Tipo</label>
              <Select
                value={magTipo}
                onValueChange={(v) => setMagTipo(v as MaggiorazioneTipo)}
              >
                <SelectTrigger id="val-mag-tipo" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAGGIORAZIONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Hint contestuale sul tipo selezionato: aiuta a capire quando
                  scegliere ogni opzione senza dover indovinare. */}
              <p className="text-[11px] text-muted-foreground pt-0.5">
                {MAGGIORAZIONE_OPTIONS.find((o) => o.value === magTipo)?.hint}
              </p>
            </div>
            {magTipo !== "none" ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="val-mag-vendita"
                      className="text-xs text-muted-foreground flex items-center gap-1"
                    >
                      Valore vendita
                      <span className="text-[10px] text-primary">(listino)</span>
                    </label>
                    {/* Niente minimo a 0: una linea che costa meno è −8 (05/10/2026). */}
                    <div className="flex gap-1.5">
                      <Input
                        id="val-mag-vendita"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={magTipo === "percentuale" ? -100 : undefined}
                        value={magValore}
                        onChange={(e) => setMagValore(e.target.value)}
                        aria-invalid={!!problemaMagg}
                        className="h-10 font-mono min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMagValore((s) => cambiaSegno(s))}
                        aria-label="Cambia segno al valore vendita"
                        className="h-10 w-10 shrink-0 p-0 font-mono sm:hidden"
                      >
                        ±
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="val-mag-acquisto"
                      className="text-xs text-muted-foreground flex items-center gap-1"
                    >
                      Valore acquisto
                      <span className="text-[10px] text-muted-foreground">
                        (costo fornitore)
                      </span>
                    </label>
                    <div className="flex gap-1.5">
                      <Input
                        id="val-mag-acquisto"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={magTipo === "percentuale" ? -100 : undefined}
                        value={magAcquisto}
                        onChange={(e) => setMagAcquisto(e.target.value)}
                        aria-invalid={!!problemaMagg}
                        className="h-10 font-mono min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMagAcquisto((s) => cambiaSegno(s))}
                        aria-label="Cambia segno al valore acquisto"
                        className="h-10 w-10 shrink-0 p-0 font-mono sm:hidden"
                      >
                        ±
                      </Button>
                    </div>
                  </div>
                </div>
                {problemaMagg ? (
                  <p className="text-xs text-destructive" role="alert">{problemaMagg}</p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  La differenza fra <strong>vendita</strong> e{" "}
                  <strong>acquisto</strong> è il margine per il serramentista
                  su questo valore.
                </p>

                <details className="rounded-lg border bg-background p-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Confronto ed esempio di calcolo</summary>
                  <div className="space-y-2 pt-2">
                {/* #11 — Diff prezzi quando si modifica un valore esistente */}
                {editing && value ? (
                  <div className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900 rounded px-2 py-1.5 space-y-0.5">
                    <div className="font-medium text-amber-900 dark:text-amber-200">
                      Confronto con valore originale:
                    </div>
                    <div className="flex justify-between">
                      <span>Prima:</span>
                      <span className="font-mono">
                        {formattaMaggiorazione(value.maggiorazione_tipo, value.maggiorazione_valore) || "Nessuna"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Dopo:</span>
                      <span className="font-mono">
                        {/* Il segno dal numero: prima «+-8%». */}
                        {formattaMaggiorazione(magTipo, leggiMaggiorazione(magValore)) || "Nessuna"}
                      </span>
                    </div>
                    {(() => {
                      const oldV = value.maggiorazione_tipo === "none" ? 0 : value.maggiorazione_valore;
                      // Qui magTipo non è mai "none" (blocco mostrato solo con una maggiorazione).
                      const newV = leggiMaggiorazione(magValore);
                      const diff = newV - oldV;
                      const sameType = value.maggiorazione_tipo === magTipo;
                      if (!sameType) {
                        return (
                          <div className="flex justify-between text-rose-700 font-medium">
                            <span>⚠ Tipo diverso</span>
                            <span>impatto da valutare</span>
                          </div>
                        );
                      }
                      if (Math.abs(diff) < 0.001) return null;
                      return (
                        <div
                          className={`flex justify-between font-medium ${
                            diff > 0 ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          <span>Variazione:</span>
                          <span className="font-mono">
                            {diff > 0 ? "+" : ""}
                            {magTipo === "percentuale" ? `${diff.toFixed(2)}%` : `${diff.toFixed(2)} €`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}

                {/* Preview prezzo live: aiuta a validare il valore inserito
                    evitando errori grossolani (un "+5" percentuale letto come
                    "+500%" su un'interfaccia opaca). */}
                <PricePreviewRow
                  tipo={magTipo}
                  vendita={leggiMaggiorazione(magValore)}
                  acquisto={leggiMaggiorazione(magAcquisto)}
                />
                  </div>
                </details>
              </>
            ) : null}
          </div> : null}
          </div>
        </div>

        <DialogFooter className="flex shrink-0 flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-10 w-full sm:w-auto"
          >
            Annulla
          </Button>
          <Button
            onClick={() =>
              onSave(
                {
                  valore: valore.trim(),
                  label: label.trim(),
                  descrizione: descrizione.trim() || null,
                  is_default: isDefault,
                  attivo,
                  maggiorazione_tipo: magTipo,
                  maggiorazione_valore: leggiMaggiorazione(magValore),
                  maggiorazione_acquisto: leggiMaggiorazione(magAcquisto),
                  codice: codiceArt.trim() || null,
                  prezzo_vendita: prezzoV.trim() ? leggiPrezzo(prezzoV) : null,
                  prezzo_acquisto: prezzoA.trim() ? leggiPrezzo(prezzoA) : null,
                  sort_order: value?.sort_order ?? nextSortOrder,
                  opzioni: vociPulite,
                },
                isDefault ? otherDefaultIds : [],
              )
            }
            disabled={!canSave}
            className="h-10 w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : editing ? (
              "Aggiorna"
            ) : (
              "Crea valore"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Preview prezzo live per il ValueFormDialog ───────────────────────────
//
// Mostra l'effetto della maggiorazione su esempi concreti: per
// percentuali un prezzo base fittizio di 1000 €, per fissi una tabella
// con le unità tipiche.

function PricePreviewRow({
  tipo,
  vendita,
  acquisto,
}: {
  tipo: MaggiorazioneTipo;
  vendita: number;
  acquisto: number;
}) {
  // Formatter EUR coerente con il resto dell'app
  const eur = (n: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2, useGrouping: true }).format(n);
  // Il segno lo porta il numero (05/10/2026): con le maggiorazioni negative
  // ammesse, «+ -8%» e «+-8,00 €» avrebbero confuso chi controlla il prezzo.
  const conSegnoEur = (n: number) => `${n < 0 ? "−" : "+"}${eur(Math.abs(n))}`;
  const conSegnoPct = (n: number) => formattaMaggiorazione("percentuale", n) || "+0%";

  if (tipo === "percentuale") {
    const base = 1000;
    const incV = (base * vendita) / 100;
    const incA = (base * acquisto) / 100;
    const finV = base + incV;
    const finA = base + incA;
    const mrg = finV - finA;
    return (
      <div className="rounded-md border bg-background p-2 text-[11px] space-y-1">
        <div className="font-medium text-foreground">
          Esempio su prezzo base {eur(base)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Vendita → </span>
          <span className="font-mono">
            {eur(base)} {conSegnoPct(vendita)} = <strong>{eur(finV)}</strong>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Acquisto → </span>
          <span className="font-mono">
            {eur(base)} {conSegnoPct(acquisto)} = <strong>{eur(finA)}</strong>
          </span>
        </div>
        <div className="flex items-center justify-between pt-0.5 border-t">
          <span className="text-muted-foreground">Margine per pz</span>
          <span className="font-mono font-semibold text-primary">
            {eur(mrg)}
          </span>
        </div>
      </div>
    );
  }

  if (
    tipo === "fisso_pz" ||
    tipo === "fisso_mq" ||
    tipo === "fisso_ml" ||
    tipo === "fisso_mc"
  ) {
    const unita =
      tipo === "fisso_pz"
        ? "pz"
        : tipo === "fisso_mq"
          ? "m²"
          : tipo === "fisso_ml"
            ? "ml"
            : "m³";
    const margine = vendita - acquisto;
    return (
      <div className="rounded-md border bg-background p-2 text-[11px] space-y-1">
        <div className="font-medium text-foreground">
          Esempio con 1 {unita}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{vendita < 0 ? "Riduzione" : "Ricarico"} vendita</span>
          <span className="font-mono font-semibold">
            {conSegnoEur(vendita)} / {unita}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{acquisto < 0 ? "Riduzione" : "Ricarico"} acquisto</span>
          <span className="font-mono">
            {conSegnoEur(acquisto)} / {unita}
          </span>
        </div>
        <div className="flex items-center justify-between pt-0.5 border-t">
          <span className="text-muted-foreground">Margine per {unita}</span>
          <span className="font-mono font-semibold text-primary">
            {eur(margine)}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
