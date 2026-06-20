/**
 * ListinoLavorazioniEditor — gestione del listino lavorazioni del verticale
 * Ristrutturazione (Fase 1, Task 7).
 *
 * Capitoli in accordion → voci in tabella editabile (codice, descrizione, UdM,
 * costo materiali, costo manodopera, ricarico %, prezzo). `prezzo_unitario` è
 * ricalcolato live da `calcPrezzoVoce` mentre si digita.
 *
 * Bottoni:
 *   - "Aggiungi capitolo" / "Aggiungi voce"
 *   - "Da listino prodotti"   → dialog ricerca `article_templates` → prefill costo_materiali
 *   - "Da listino manodopera" → dialog ricerca `tariffe_aziendali` → prefill costo_manodopera
 *   - "Importa set standard"  → conferma → useImportSeedListino
 *
 * Nessun setState-in-effect: le righe in editing usano un draft locale resettato
 * via `key={voce.id}` e committato on-blur.
 */
import { useMemo, useState } from "react";
import {
  Hammer,
  Plus,
  Trash2,
  Package,
  Wrench,
  Download,
  Search,
  Loader2,
  FolderPlus,
  Pencil,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calcPrezzoVoce } from "@/lib/ristrutturazione/calcoli";
import type {
  RstListinoCapitolo,
  RstListinoVoce,
  RstUnitaMisura,
} from "@/types/ristrutturazione";
import {
  useListinoCapitoli,
  useListinoVoci,
  useUpsertCapitolo,
  useUpsertVoce,
  useDeleteVoce,
  useDeleteCapitolo,
  useImportSeedListino,
  usePrefillFromArticolo,
  usePrefillFromTariffa,
  mapUnitaMisura,
  type VocePayload,
  type PrefillArticoloOption,
  type PrefillTariffaOption,
} from "@/hooks/useListinoLavorazioni";
import { ImportaPrezzarioDialog } from "@/components/ristrutturazione/ImportaPrezzarioDialog";

const UNITA_OPZIONI: RstUnitaMisura[] = [
  "mq",
  "ml",
  "cad",
  "corpo",
  "kg",
  "h",
  "a corpo",
];

// ─── Riga voce editabile ─────────────────────────────────────────────────────

interface VoceEditRowProps {
  voce: RstListinoVoce;
  onCommit: (patch: Partial<VocePayload>) => void;
  onDelete: () => void;
}

/**
 * Riga in editing. Mantiene un draft locale (inizializzato dalle props) e lo
 * committa on-blur. Niente useEffect di sync: il reset del draft quando cambia
 * la voce è garantito dal `key={voce.id}` impostato dal parent.
 */
function VoceEditRow({ voce, onCommit, onDelete }: VoceEditRowProps) {
  const [codice, setCodice] = useState(voce.codice ?? "");
  const [descrizione, setDescrizione] = useState(voce.descrizione);
  const [unita, setUnita] = useState<RstUnitaMisura>(voce.unita_misura);
  const [mat, setMat] = useState(String(voce.costo_materiali ?? 0));
  const [mano, setMano] = useState(String(voce.costo_manodopera ?? 0));
  const [ricarico, setRicarico] = useState(String(voce.ricarico_pct ?? 0));

  const num = (s: string) => {
    const v = Number(s.replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  };

  const prezzo = calcPrezzoVoce({
    costo_materiali: num(mat),
    costo_manodopera: num(mano),
    ricarico_pct: num(ricarico),
  });

  const commit = (extra: Partial<VocePayload> = {}) =>
    onCommit({
      codice: codice.trim() || null,
      descrizione: descrizione.trim() || voce.descrizione,
      unita_misura: unita,
      costo_materiali: num(mat),
      costo_manodopera: num(mano),
      ricarico_pct: num(ricarico),
      ...extra,
    });

  return (
    <TableRow className="align-top">
      <TableCell className="w-[88px] p-1.5">
        <Input
          value={codice}
          onChange={(e) => setCodice(e.target.value)}
          onBlur={() => commit()}
          placeholder="cod."
          className="h-8 text-xs"
        />
      </TableCell>
      <TableCell className="min-w-[220px] p-1.5">
        <Input
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          onBlur={() => commit()}
          placeholder="Descrizione lavorazione"
          className="h-8 text-sm"
        />
      </TableCell>
      <TableCell className="w-[112px] p-1.5">
        <Select
          value={unita}
          onValueChange={(v) => {
            const u = v as RstUnitaMisura;
            setUnita(u);
            commit({ unita_misura: u });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNITA_OPZIONI.map((u) => (
              <SelectItem key={u} value={u} className="text-xs">
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="w-[104px] p-1.5">
        <Input
          inputMode="decimal"
          value={mat}
          onChange={(e) => setMat(e.target.value)}
          onBlur={() => commit()}
          className="h-8 text-right text-sm tabular-nums"
        />
      </TableCell>
      <TableCell className="w-[104px] p-1.5">
        <Input
          inputMode="decimal"
          value={mano}
          onChange={(e) => setMano(e.target.value)}
          onBlur={() => commit()}
          className="h-8 text-right text-sm tabular-nums"
        />
      </TableCell>
      <TableCell className="w-[88px] p-1.5">
        <Input
          inputMode="decimal"
          value={ricarico}
          onChange={(e) => setRicarico(e.target.value)}
          onBlur={() => commit()}
          className="h-8 text-right text-sm tabular-nums"
        />
      </TableCell>
      <TableCell className="w-[112px] p-1.5 text-right">
        <span className="inline-flex h-8 items-center justify-end font-semibold tabular-nums text-primary">
          {formatCurrency(prezzo)}
        </span>
      </TableCell>
      <TableCell className="w-[44px] p-1.5 text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label="Elimina voce"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Dialog di prefill (prodotti / manodopera) ───────────────────────────────

type PrefillKind = "articolo" | "tariffa" | null;

interface PrefillDialogProps {
  kind: PrefillKind;
  onClose: () => void;
  onPickArticolo: (opt: PrefillArticoloOption) => void;
  onPickTariffa: (opt: PrefillTariffaOption) => void;
}

function PrefillDialog({
  kind,
  onClose,
  onPickArticolo,
  onPickTariffa,
}: PrefillDialogProps) {
  const [term, setTerm] = useState("");
  const isArticolo = kind === "articolo";
  // Entrambe le query sono montate ma `enabled` solo quella attiva via il termine.
  const articoli = usePrefillFromArticolo(isArticolo ? term : "");
  const tariffe = usePrefillFromTariffa(kind === "tariffa" ? term : "");

  const loading = isArticolo ? articoli.isLoading : tariffe.isLoading;
  const articoliRows = isArticolo ? articoli.data ?? [] : [];
  const tariffeRows = kind === "tariffa" ? tariffe.data ?? [] : [];
  const isEmpty = isArticolo ? articoliRows.length === 0 : tariffeRows.length === 0;

  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isArticolo ? (
              <Package className="h-4 w-4 text-primary" />
            ) : (
              <Wrench className="h-4 w-4 text-primary" />
            )}
            {isArticolo ? "Da listino prodotti" : "Da listino manodopera"}
          </DialogTitle>
          <DialogDescription>
            {isArticolo
              ? "Cerca un prodotto: il costo d'acquisto verrà inserito nel costo materiali della nuova voce."
              : "Cerca una tariffa: il costo interno verrà inserito nel costo manodopera della nuova voce."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={isArticolo ? "Nome, SKU o marca…" : "Nome tariffa…"}
            className="pl-8"
          />
        </div>

        <div className="max-h-[48vh] overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
            </div>
          ) : isEmpty ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nessun risultato. {isArticolo ? "Aggiungi prodotti dal listino articoli." : "Aggiungi tariffe dal listino manodopera."}
            </div>
          ) : isArticolo ? (
            <ul className="divide-y">
              {articoliRows.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onPickArticolo(a)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[a.marca, a.sku].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {formatCurrency(a.costo)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">costo materiali</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y">
              {tariffeRows.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPickTariffa(t)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[t.tipo, t.unita].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {formatCurrency(t.costo)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">costo manodopera</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sezione capitolo ────────────────────────────────────────────────────────

interface CapitoloAccordionItemProps {
  capitolo: RstListinoCapitolo;
  onRename: (nome: string) => void;
  onDelete: () => void;
  onAddVoce: () => void;
  onOpenPrefill: (kind: Exclude<PrefillKind, null>) => void;
}

function CapitoloAccordionItem({
  capitolo,
  onRename,
  onDelete,
  onAddVoce,
  onOpenPrefill,
}: CapitoloAccordionItemProps) {
  const { data: voci = [], isLoading } = useListinoVoci(capitolo.id);
  const upsertVoce = useUpsertVoce();
  const deleteVoce = useDeleteVoce();
  const confirm = useConfirm();

  const [editingNome, setEditingNome] = useState(false);
  const [nomeDraft, setNomeDraft] = useState(capitolo.nome);

  const subtotale = useMemo(
    () => voci.reduce((s, v) => s + (Number(v.prezzo_unitario) || 0), 0),
    [voci],
  );

  const commitVoce = (voce: RstListinoVoce, patch: Partial<VocePayload>) => {
    upsertVoce.mutate(
      {
        id: voce.id,
        capitolo_id: voce.capitolo_id,
        codice: voce.codice,
        descrizione: voce.descrizione,
        unita_misura: voce.unita_misura,
        costo_materiali: voce.costo_materiali,
        costo_manodopera: voce.costo_manodopera,
        ricarico_pct: voce.ricarico_pct,
        articolo_id: voce.articolo_id,
        tariffa_id: voce.tariffa_id,
        note: voce.note,
        ordine: voce.ordine,
        ...patch,
      },
      { onError: (e) => toast.error("Salvataggio voce non riuscito", { description: (e as Error).message }) },
    );
  };

  const handleDeleteVoce = async (voce: RstListinoVoce) => {
    const ok = await confirm({
      title: "Eliminare la voce?",
      description: voce.descrizione,
      confirmLabel: "Elimina",
      variant: "destructive",
    });
    if (ok) deleteVoce.mutate(voce.id, { onError: (e) => toast.error((e as Error).message) });
  };

  return (
    <AccordionItem value={capitolo.id} className="rounded-lg border bg-card px-3">
      <div className="flex items-center gap-2">
        {editingNome ? (
          <Input
            autoFocus
            value={nomeDraft}
            onChange={(e) => setNomeDraft(e.target.value)}
            onBlur={() => {
              setEditingNome(false);
              const t = nomeDraft.trim();
              if (t && t !== capitolo.nome) onRename(t);
              else setNomeDraft(capitolo.nome);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setNomeDraft(capitolo.nome);
                setEditingNome(false);
              }
            }}
            className="my-2 h-9 max-w-sm font-semibold"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <AccordionTrigger className="flex-1 py-3 hover:no-underline">
            <span className="flex items-center gap-2 text-left">
              <span className="font-semibold">{capitolo.nome}</span>
              <Badge variant="secondary" className="font-normal">
                {voci.length} {voci.length === 1 ? "voce" : "voci"}
              </Badge>
              {subtotale > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(subtotale)}
                </span>
              )}
            </span>
          </AccordionTrigger>
        )}
        {!editingNome && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => {
                setNomeDraft(capitolo.nome);
                setEditingNome(true);
              }}
              aria-label="Rinomina capitolo"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label="Elimina capitolo"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <AccordionContent className="pt-1">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento voci…
          </div>
        ) : voci.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            Nessuna voce in questo capitolo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 text-xs">Codice</TableHead>
                  <TableHead className="h-9 text-xs">Descrizione</TableHead>
                  <TableHead className="h-9 text-xs">UdM</TableHead>
                  <TableHead className="h-9 text-right text-xs">Materiali €</TableHead>
                  <TableHead className="h-9 text-right text-xs">Manodopera €</TableHead>
                  <TableHead className="h-9 text-right text-xs">Ricarico %</TableHead>
                  <TableHead className="h-9 text-right text-xs">Prezzo</TableHead>
                  <TableHead className="h-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {voci.map((v) => (
                  <VoceEditRow
                    key={v.id}
                    voce={v}
                    onCommit={(patch) => commitVoce(v, patch)}
                    onDelete={() => void handleDeleteVoce(v)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onAddVoce}>
            <Plus className="mr-1.5 h-4 w-4" /> Aggiungi voce
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenPrefill("articolo")}
          >
            <Package className="mr-1.5 h-4 w-4" /> Da listino prodotti
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenPrefill("tariffa")}
          >
            <Wrench className="mr-1.5 h-4 w-4" /> Da listino manodopera
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ─── Editor principale ───────────────────────────────────────────────────────

export interface ListinoLavorazioniEditorProps {
  className?: string;
}

export function ListinoLavorazioniEditor({ className }: ListinoLavorazioniEditorProps) {
  const { data: capitoli = [], isLoading } = useListinoCapitoli();
  const upsertCapitolo = useUpsertCapitolo();
  const deleteCapitolo = useDeleteCapitolo();
  const upsertVoce = useUpsertVoce();
  const importSeed = useImportSeedListino();
  const confirm = useConfirm();

  // Capitolo target del dialog di prefill (e quale tab aperta).
  const [prefillKind, setPrefillKind] = useState<PrefillKind>(null);
  const [prefillCapitoloId, setPrefillCapitoloId] = useState<string | null>(null);

  // Dialog "Importa da prezzario regionale" (adozione voci dalla libreria centrale).
  const [prezzarioOpen, setPrezzarioOpen] = useState(false);

  const handleAddCapitolo = () => {
    upsertCapitolo.mutate(
      { nome: "Nuovo capitolo", ordine: capitoli.length },
      {
        onSuccess: () => toast.success("Capitolo aggiunto"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const handleRenameCapitolo = (cap: RstListinoCapitolo, nome: string) => {
    upsertCapitolo.mutate(
      { id: cap.id, nome, ordine: cap.ordine },
      { onError: (e) => toast.error((e as Error).message) },
    );
  };

  const handleDeleteCapitolo = async (cap: RstListinoCapitolo) => {
    const ok = await confirm({
      title: "Eliminare il capitolo?",
      description: `"${cap.nome}" e tutte le sue voci verranno rimossi. L'operazione non può essere annullata.`,
      confirmLabel: "Elimina capitolo",
      variant: "destructive",
    });
    if (ok)
      deleteCapitolo.mutate(cap.id, {
        onSuccess: () => toast.success("Capitolo eliminato"),
        onError: (e) => toast.error((e as Error).message),
      });
  };

  const addVoce = (capitoloId: string, payload?: Partial<VocePayload>) => {
    upsertVoce.mutate(
      {
        capitolo_id: capitoloId,
        descrizione: payload?.descrizione ?? "Nuova voce",
        unita_misura: payload?.unita_misura ?? "cad",
        costo_materiali: payload?.costo_materiali ?? 0,
        costo_manodopera: payload?.costo_manodopera ?? 0,
        ricarico_pct: payload?.ricarico_pct ?? 0,
        codice: payload?.codice ?? null,
        articolo_id: payload?.articolo_id ?? null,
        tariffa_id: payload?.tariffa_id ?? null,
        ordine: 0,
      },
      { onError: (e) => toast.error("Aggiunta voce non riuscita", { description: (e as Error).message }) },
    );
  };

  const handleImportSeed = async () => {
    const ok = await confirm({
      title: "Importare il set standard?",
      description:
        "Verranno aggiunti capitoli e voci edili tipiche (demolizioni, murature, impianti, finiture…) con costi indicativi modificabili. Le voci già presenti non vengono toccate.",
      confirmLabel: "Importa",
    });
    if (!ok) return;
    importSeed.mutate(undefined, {
      onSuccess: (r) =>
        toast.success("Set standard importato", {
          description: `${r.capitoli} capitoli, ${r.voci} voci aggiunte al listino.`,
        }),
      onError: (e) => toast.error("Import non riuscito", { description: (e as Error).message }),
    });
  };

  const openPrefill = (capitoloId: string, kind: Exclude<PrefillKind, null>) => {
    setPrefillCapitoloId(capitoloId);
    setPrefillKind(kind);
  };

  const closePrefill = () => {
    setPrefillKind(null);
    setPrefillCapitoloId(null);
  };

  const onPickArticolo = (opt: PrefillArticoloOption) => {
    if (prefillCapitoloId) {
      addVoce(prefillCapitoloId, {
        descrizione: opt.name,
        unita_misura: mapUnitaMisura(opt.unita),
        costo_materiali: opt.costo,
        costo_manodopera: 0,
        codice: opt.sku,
        articolo_id: opt.id,
      });
      toast.success("Voce creata dal prodotto", { description: opt.name });
    }
    closePrefill();
  };

  const onPickTariffa = (opt: PrefillTariffaOption) => {
    if (prefillCapitoloId) {
      addVoce(prefillCapitoloId, {
        descrizione: opt.nome,
        unita_misura: mapUnitaMisura(opt.unita),
        costo_materiali: 0,
        costo_manodopera: opt.costo,
        tariffa_id: opt.id,
      });
      toast.success("Voce creata dalla tariffa", { description: opt.nome });
    }
    closePrefill();
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Hammer className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold leading-tight">Listino lavorazioni</h3>
            <p className="text-xs text-muted-foreground">
              Capitoli e voci con prezzo calcolato da materiali, manodopera e ricarico.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPrezzarioOpen(true)}
          >
            <Library className="mr-1.5 h-4 w-4" /> Importa da prezzario regionale
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleImportSeed()}
            disabled={importSeed.isPending}
          >
            {importSeed.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Importa set standard
          </Button>
          <Button type="button" size="sm" onClick={handleAddCapitolo} disabled={upsertCapitolo.isPending}>
            <FolderPlus className="mr-1.5 h-4 w-4" /> Aggiungi capitolo
          </Button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento listino…
        </div>
      ) : capitoli.length === 0 ? (
        <EmptyState
          onAddCapitolo={handleAddCapitolo}
          onImportSeed={() => void handleImportSeed()}
          importing={importSeed.isPending}
        />
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {capitoli.map((cap) => (
            <CapitoloAccordionItem
              key={cap.id}
              capitolo={cap}
              onRename={(nome) => handleRenameCapitolo(cap, nome)}
              onDelete={() => void handleDeleteCapitolo(cap)}
              onAddVoce={() => addVoce(cap.id)}
              onOpenPrefill={(kind) => openPrefill(cap.id, kind)}
            />
          ))}
        </Accordion>
      )}

      <PrefillDialog
        kind={prefillKind}
        onClose={closePrefill}
        onPickArticolo={onPickArticolo}
        onPickTariffa={onPickTariffa}
      />

      <ImportaPrezzarioDialog open={prezzarioOpen} onOpenChange={setPrezzarioOpen} />
    </div>
  );
}

// ─── Empty state guidato ─────────────────────────────────────────────────────

function EmptyState({
  onAddCapitolo,
  onImportSeed,
  importing,
}: {
  onAddCapitolo: () => void;
  onImportSeed: () => void;
  importing: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Hammer className="h-7 w-7" />
      </span>
      <h3 className="text-lg font-semibold">Costruisci il tuo listino lavorazioni</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Parti dal set standard di capitoli e voci edili (demolizioni, murature, impianti,
        finiture…) e personalizza costi e ricarichi, oppure crea il tuo da zero.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={onImportSeed} disabled={importing}>
          {importing ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          Importa set standard
        </Button>
        <Button type="button" variant="outline" onClick={onAddCapitolo}>
          <FolderPlus className="mr-1.5 h-4 w-4" /> Crea capitolo vuoto
        </Button>
      </div>
    </div>
  );
}

export default ListinoLavorazioniEditor;
