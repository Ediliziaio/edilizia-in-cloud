/**
 * Preventivatore Verticalizzato Serramentisti — FASE 10.2
 *
 * Gestione bundle/pacchetti chiavi-in-mano con CRUD completo.
 * Ogni bundle = nome + metadati + N voci (famiglia con config | prodotto legacy | tariffa).
 * Per famiglie si può preimpostare vano_label, misure default (L×H), selezioni assi.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy, Package, Box, Wrench, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useVertical } from "@/hooks/useVertical";
import { useFamilies } from "@/hooks/useFamilies";
import {
  useBundlesList,
  useUpsertBundle,
  useDeleteBundle,
  useToggleBundleAttivo,
  type Bundle,
  type BundleVoceInput,
  type BundleTipoLavoro,
} from "@/hooks/useBundles";
import type { AxisSelection } from "@/types/articleFamily";

type VoceType = "family" | "product" | "tariff";

interface DraftVoce {
  _key: string;
  type: VoceType;
  family_id: string | null;
  prodotto_id: string | null;
  tariffa_id: string | null;
  vano_label: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  axis_selections: AxisSelection;
  quantita: number;
}

interface DraftBundle {
  id?: string;
  nome: string;
  descrizione: string;
  sconto_bundle_pct: number;
  attivo: boolean;
  tipo_lavoro: BundleTipoLavoro | null;
  voci: DraftVoce[];
}

const TIPO_LAVORO_OPTIONS: { value: BundleTipoLavoro; label: string }[] = [
  { value: "sostituzione", label: "Sostituzione" },
  { value: "nuova", label: "Nuova installazione" },
  { value: "ristrutturazione", label: "Ristrutturazione" },
];

function emptyDraft(): DraftBundle {
  return {
    nome: "",
    descrizione: "",
    sconto_bundle_pct: 0,
    attivo: true,
    tipo_lavoro: null,
    voci: [],
  };
}

function newKey(): string {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function bundleToDraft(b: Bundle): DraftBundle {
  return {
    id: b.id,
    nome: b.nome,
    descrizione: b.descrizione ?? "",
    sconto_bundle_pct: Number(b.sconto_bundle_pct ?? 0),
    attivo: b.attivo,
    tipo_lavoro: b.tipo_lavoro,
    voci: (b.voci ?? [])
      .slice()
      .sort((a, z) => a.sort_order - z.sort_order)
      .map((v): DraftVoce => ({
        _key: v.id,
        type: v.family_id
          ? "family"
          : v.prodotto_id
            ? "product"
            : "tariff",
        family_id: v.family_id,
        prodotto_id: v.prodotto_id,
        tariffa_id: v.tariffa_id,
        vano_label: v.vano_label ?? "",
        larghezza_mm: v.larghezza_mm_default,
        altezza_mm: v.altezza_mm_default,
        axis_selections: (v.axis_selections ?? {}) as AxisSelection,
        quantita: Number(v.quantita ?? 1),
      })),
  };
}

export default function SettingsBundle() {
  const companyId = useEffectiveCompanyId();
  const { vertical } = useVertical();
  const { families } = useFamilies();

  const { bundles, isLoading, refetch } = useBundlesList();
  const upsertMut = useUpsertBundle();
  const deleteMut = useDeleteBundle();
  const toggleMut = useToggleBundleAttivo();

  // Articoli e tariffe per i dropdown delle voci
  const { data: articoli = [] } = useQuery({
    queryKey: ["bundle-editor-articoli", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("article_templates")
        .select("id, name, unit_of_measure, unit_price, prezzo_vendita")
        .eq("company_id", companyId!)
        .order("name")
        .limit(500);
      return (data ?? []) as Array<{
        id: string;
        name: string;
        unit_of_measure: string | null;
        unit_price: number | null;
        prezzo_vendita: number | null;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: tariffe = [] } = useQuery({
    queryKey: ["bundle-editor-tariffe", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("tariffe_aziendali") as any)
        .select("id, nome, prezzo_vendita, unita")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("nome");
      return (data ?? []) as Array<{
        id: string;
        nome: string;
        prezzo_vendita: number | null;
        unita: string | null;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── UI state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftBundle>(emptyDraft());
  const [deleteTarget, setDeleteTarget] = useState<Bundle | null>(null);

  const openNew = () => {
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (b: Bundle) => {
    setDraft(bundleToDraft(b));
    setDialogOpen(true);
  };

  const openDuplicate = (b: Bundle) => {
    const d = bundleToDraft(b);
    setDraft({
      ...d,
      id: undefined,
      nome: `${d.nome} (copia)`,
      voci: d.voci.map((v) => ({ ...v, _key: newKey() })),
    });
    setDialogOpen(true);
  };

  const addVoce = (type: VoceType) => {
    setDraft((prev) => ({
      ...prev,
      voci: [
        ...prev.voci,
        {
          _key: newKey(),
          type,
          family_id: null,
          prodotto_id: null,
          tariffa_id: null,
          vano_label: "",
          larghezza_mm: null,
          altezza_mm: null,
          axis_selections: {},
          quantita: 1,
        },
      ],
    }));
  };

  const updateVoce = (key: string, patch: Partial<DraftVoce>) => {
    setDraft((prev) => ({
      ...prev,
      voci: prev.voci.map((v) => (v._key === key ? { ...v, ...patch } : v)),
    }));
  };

  const removeVoce = (key: string) => {
    setDraft((prev) => ({
      ...prev,
      voci: prev.voci.filter((v) => v._key !== key),
    }));
  };

  const canSave = useMemo(() => {
    if (!draft.nome.trim()) return false;
    if (draft.voci.length === 0) return false;
    return draft.voci.every((v) => {
      if (v.type === "family") return !!v.family_id;
      if (v.type === "product") return !!v.prodotto_id;
      if (v.type === "tariff") return !!v.tariffa_id;
      return false;
    });
  }, [draft]);

  const handleSave = async () => {
    try {
      const voci: BundleVoceInput[] = draft.voci.map((v, idx) => ({
        prodotto_id: v.type === "product" ? v.prodotto_id : null,
        tariffa_id: v.type === "tariff" ? v.tariffa_id : null,
        family_id: v.type === "family" ? v.family_id : null,
        axis_selections: v.axis_selections,
        larghezza_mm_default: v.type === "family" ? v.larghezza_mm : null,
        altezza_mm_default: v.type === "family" ? v.altezza_mm : null,
        vano_label: v.vano_label.trim() || null,
        quantita: v.quantita,
        sort_order: idx,
      }));
      await upsertMut.mutateAsync({
        id: draft.id,
        nome: draft.nome.trim(),
        descrizione: draft.descrizione.trim() || null,
        sconto_bundle_pct: draft.sconto_bundle_pct,
        attivo: draft.attivo,
        vertical,
        tipo_lavoro: draft.tipo_lavoro,
        voci,
      });
      toast.success(draft.id ? "Bundle aggiornato" : "Bundle creato");
      setDialogOpen(false);
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      toast.error(`Salvataggio fallito: ${msg}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success("Bundle eliminato");
      setDeleteTarget(null);
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      toast.error(`Eliminazione fallita: ${msg}`);
    }
  };

  const handleToggle = async (b: Bundle) => {
    try {
      await toggleMut.mutateAsync({ id: b.id, attivo: !b.attivo });
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      toast.error(`Toggle fallito: ${msg}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bundle & Pacchetti</h1>
          <p className="text-muted-foreground">
            Pacchetti chiavi-in-mano pre-configurati applicabili a un preventivo con un click.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo bundle
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            I tuoi bundle
          </CardTitle>
          <CardDescription>
            {bundles.length === 0 ? "Nessun bundle configurato." : `${bundles.length} bundle totali`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Caricamento…</div>
          ) : bundles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Home className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nessun bundle ancora creato.</p>
              <Button variant="outline" className="mt-4" onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" /> Crea il primo bundle
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo lavoro</TableHead>
                  <TableHead>Voci</TableHead>
                  <TableHead>Sconto</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <div>{b.nome}</div>
                      {b.descrizione && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{b.descrizione}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.tipo_lavoro ? (
                        <Badge variant="outline">{b.tipo_lavoro}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{b.voci?.length ?? 0}</TableCell>
                    <TableCell>
                      {Number(b.sconto_bundle_pct) > 0 ? `${b.sconto_bundle_pct}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={b.attivo}
                        onCheckedChange={() => handleToggle(b)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openDuplicate(b)} title="Duplica">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(b)} title="Modifica">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(b)}
                          title="Elimina"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Editor dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Modifica bundle" : "Nuovo bundle"}</DialogTitle>
            <DialogDescription>
              Un bundle è un pacchetto pre-configurato di voci applicabile a un preventivo con un click.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Master fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input
                  value={draft.nome}
                  onChange={(e) => setDraft((d) => ({ ...d, nome: e.target.value }))}
                  placeholder="Es. Bilocale standard — sostituzione 3 finestre + 1 portafinestra"
                />
              </div>
              <div className="col-span-2">
                <Label>Descrizione</Label>
                <Textarea
                  value={draft.descrizione}
                  onChange={(e) => setDraft((d) => ({ ...d, descrizione: e.target.value }))}
                  rows={2}
                />
              </div>
              <div>
                <Label>Tipo lavoro</Label>
                <Select
                  value={draft.tipo_lavoro ?? ""}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, tipo_lavoro: (v || null) as BundleTipoLavoro | null }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona (opzionale)" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_LAVORO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sconto bundle (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={draft.sconto_bundle_pct}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sconto_bundle_pct: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            {/* Voci */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Voci del bundle</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => addVoce("family")}>
                    <Home className="h-4 w-4 mr-1" /> Famiglia
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addVoce("product")}>
                    <Box className="h-4 w-4 mr-1" /> Prodotto
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addVoce("tariff")}>
                    <Wrench className="h-4 w-4 mr-1" /> Tariffa
                  </Button>
                </div>
              </div>

              {draft.voci.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6 border rounded-md">
                  Aggiungi almeno una voce (famiglia, prodotto o tariffa).
                </div>
              ) : (
                <div className="space-y-2">
                  {draft.voci.map((v, idx) => (
                    <VoceRow
                      key={v._key}
                      index={idx}
                      voce={v}
                      families={families}
                      articoli={articoli}
                      tariffe={tariffe}
                      onUpdate={(patch) => updateVoce(v._key, patch)}
                      onRemove={() => removeVoce(v._key)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={draft.attivo}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, attivo: v }))}
                id="bundle-attivo"
              />
              <Label htmlFor="bundle-attivo">Attivo (visibile nel wizard)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={!canSave || upsertMut.isPending}>
              {upsertMut.isPending ? "Salvataggio…" : draft.id ? "Salva modifiche" : "Crea bundle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina bundle</AlertDialogTitle>
            <AlertDialogDescription>
              Confermi l'eliminazione del bundle &ldquo;{deleteTarget?.nome}&rdquo;? L'operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── VoceRow ─────────────────────────────────────────────────────────────────

interface VoceRowProps {
  index: number;
  voce: DraftVoce;
  families: ReturnType<typeof useFamilies>["families"];
  articoli: Array<{ id: string; name: string; unit_of_measure: string | null }>;
  tariffe: Array<{ id: string; nome: string; unita: string | null }>;
  onUpdate: (patch: Partial<DraftVoce>) => void;
  onRemove: () => void;
}

function VoceRow({ index, voce, families, articoli, tariffe, onUpdate, onRemove }: VoceRowProps) {
  const selectedFamily = families.find((f) => f.id === voce.family_id) ?? null;

  return (
    <div className="border rounded-md p-3 bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">#{index + 1}</Badge>
          <Badge variant="outline">
            {voce.type === "family" ? "Famiglia" : voce.type === "product" ? "Prodotto" : "Tariffa"}
          </Badge>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-2">
        {/* Selezione item */}
        <div className="col-span-12 md:col-span-6">
          <Label className="text-xs">
            {voce.type === "family" ? "Famiglia" : voce.type === "product" ? "Prodotto" : "Tariffa"}
          </Label>
          {voce.type === "family" && (
            <Select
              value={voce.family_id ?? ""}
              onValueChange={(v) => onUpdate({ family_id: v || null, axis_selections: {} })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona famiglia" />
              </SelectTrigger>
              <SelectContent>
                {families.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {voce.type === "product" && (
            <Select
              value={voce.prodotto_id ?? ""}
              onValueChange={(v) => onUpdate({ prodotto_id: v || null })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona prodotto" />
              </SelectTrigger>
              <SelectContent>
                {articoli.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {voce.type === "tariff" && (
            <Select
              value={voce.tariffa_id ?? ""}
              onValueChange={(v) => onUpdate({ tariffa_id: v || null })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tariffa" />
              </SelectTrigger>
              <SelectContent>
                {tariffe.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="col-span-6 md:col-span-3">
          <Label className="text-xs">Quantità</Label>
          <Input
            type="number"
            min={0.01}
            step={0.5}
            value={voce.quantita}
            onChange={(e) => onUpdate({ quantita: Number(e.target.value) || 1 })}
          />
        </div>

        <div className="col-span-6 md:col-span-3">
          <Label className="text-xs">Vano (opzionale)</Label>
          <Input
            value={voce.vano_label}
            onChange={(e) => onUpdate({ vano_label: e.target.value })}
            placeholder="Es. Cucina"
          />
        </div>

        {/* Misure default solo per famiglia */}
        {voce.type === "family" && (
          <>
            <div className="col-span-6 md:col-span-3">
              <Label className="text-xs">Larghezza default (mm)</Label>
              <Input
                type="number"
                min={0}
                value={voce.larghezza_mm ?? ""}
                onChange={(e) =>
                  onUpdate({
                    larghezza_mm: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label className="text-xs">Altezza default (mm)</Label>
              <Input
                type="number"
                min={0}
                value={voce.altezza_mm ?? ""}
                onChange={(e) =>
                  onUpdate({
                    altezza_mm: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </>
        )}

        {/* Assi solo per famiglia selezionata */}
        {voce.type === "family" && selectedFamily && selectedFamily.axes.length > 0 && (
          <div className="col-span-12 grid grid-cols-2 md:grid-cols-3 gap-2">
            {selectedFamily.axes.map((axis) => (
              <div key={axis.id}>
                <Label className="text-xs">{axis.nome}</Label>
                <Select
                  value={voce.axis_selections[axis.codice] ?? ""}
                  onValueChange={(val) =>
                    onUpdate({
                      axis_selections: { ...voce.axis_selections, [axis.codice]: val },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Preset (opzionale)" />
                  </SelectTrigger>
                  <SelectContent>
                    {axis.values.map((val) => (
                      <SelectItem key={val.id} value={val.valore}>
                        {val.label || val.valore}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
