/**
 * Preventivatore Verticalizzato Serramentisti — FASE 10.2
 *
 * Gestione bundle/pacchetti chiavi-in-mano con CRUD completo.
 * Ogni bundle = nome + metadati + N voci (famiglia con config | prodotto legacy | tariffa).
 * Per famiglie si può preimpostare vano_label, misure default (L×H), selezioni assi.
 */

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Copy, Package, Box, Wrench, Home, Sparkles, Search, X,
  CheckCircle2, Minus, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent,
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
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
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
  // FV (solo vertical fotovoltaico): taglia kit + prezzo offerta fisso + copertina PDF
  fv_kwp: number | null;
  fv_accumulo_kwh: number | null;
  prezzo_offerta: number | null;
  cover_image_url: string | null;
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
    fv_kwp: null,
    fv_accumulo_kwh: null,
    prezzo_offerta: null,
    cover_image_url: null,
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
    fv_kwp: b.fv_kwp != null ? Number(b.fv_kwp) : null,
    fv_accumulo_kwh: b.fv_accumulo_kwh != null ? Number(b.fv_accumulo_kwh) : null,
    prezzo_offerta: b.prezzo_offerta != null ? Number(b.prezzo_offerta) : null,
    cover_image_url: b.cover_image_url ?? null,
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
  // Mostra i campi "Kit FV" se l'azienda ha il vertical fotovoltaico OPPURE il modulo
  // FV attivo (aziende "generico" multi-business possono comunque vendere kit FV).
  const { isEnabled: fvModuloAttivo } = useFeatureAccess("modulo_fotovoltaico_attivo");
  const { families } = useFamilies();

  const { bundles, isLoading, refetch } = useBundlesList();
  const upsertMut = useUpsertBundle();
  const deleteMut = useDeleteBundle();
  const toggleMut = useToggleBundleAttivo();

  const installTemplatesMut = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Company non identificata");
      const { data, error } = await supabase.functions.invoke(
        "installa-bundle-template",
        { body: { company_id: companyId, vertical } },
      );
      if (error) throw new Error(error.message);
      return data as { bundles_creati: number; voci_create: number; saltati: string[] };
    },
    onSuccess: (res) => {
      toast.success(
        `${res.bundles_creati} bundle installati, ${res.voci_create} voci. ${res.saltati.length} saltati.`,
      );
      refetch();
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      toast.error(`Installazione fallita: ${msg}`);
    },
  });

  // Articoli e tariffe per i dropdown delle voci
  const { data: articoli = [] } = useQuery({
    queryKey: ["bundle-editor-articoli", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, unit_of_measure, unit_price, prezzo_vendita")
        .eq("company_id", companyId!)
        .order("name")
        .limit(500);
      if (error) throw error;
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
      const { data, error } = await supabase.from("tariffe_aziendali" as never)
        .select("id, nome, prezzo_vendita, unita")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("nome");
      if (error) throw error;
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
  const [search, setSearch] = useState("");
  const [filterAttivi, setFilterAttivi] = useState<"all" | "active" | "inactive">("all");
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // ── Filtered list
  const filteredBundles = useMemo(() => {
    let list = bundles;
    if (filterAttivi === "active") list = list.filter((b) => b.attivo);
    if (filterAttivi === "inactive") list = list.filter((b) => !b.attivo);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((b) =>
        b.nome.toLowerCase().includes(q) ||
        (b.descrizione ?? "").toLowerCase().includes(q) ||
        (b.tipo_lavoro ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [bundles, search, filterAttivi]);

  // ── Stats
  const stats = useMemo(() => {
    const attivi = bundles.filter((b) => b.attivo).length;
    const totaleVoci = bundles.reduce((s, b) => s + (b.voci?.length ?? 0), 0);
    return {
      totali: bundles.length,
      attivi,
      disattivi: bundles.length - attivi,
      totaleVoci,
    };
  }, [bundles]);

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

  const isFvVertical = vertical === "fotovoltaico" || fvModuloAttivo;
  const canSave = useMemo(() => {
    if (!draft.nome.trim()) return false;
    if (draft.voci.length === 0) {
      // Kit FV: può bastare la taglia (kWp) + prezzo offerta, voci opzionali.
      return isFvVertical && draft.fv_kwp != null && draft.prezzo_offerta != null;
    }
    return draft.voci.every((v) => {
      if (v.type === "family") return !!v.family_id;
      if (v.type === "product") return !!v.prodotto_id;
      if (v.type === "tariff") return !!v.tariffa_id;
      return false;
    });
  }, [draft, isFvVertical]);

  const handleCoverUpload = async (file: File) => {
    if (!companyId) return;
    setCoverUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `bundle-covers/${companyId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("fv-progetti")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signedData, error: signErr } = await supabase.storage
        .from("fv-progetti")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      setDraft((d) => ({ ...d, cover_image_url: signedData.signedUrl }));
      toast.success("Immagine caricata");
    } catch (e) {
      toast.error("Upload fallito: " + (e instanceof Error ? e.message : "errore"));
    } finally {
      setCoverUploading(false);
    }
  };

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
        fv_kwp: isFvVertical ? draft.fv_kwp : null,
        fv_accumulo_kwh: isFvVertical ? draft.fv_accumulo_kwh : null,
        prezzo_offerta: isFvVertical ? draft.prezzo_offerta : null,
        cover_image_url: isFvVertical ? draft.cover_image_url : null,
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
      {/* Header pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Bundle &amp; Pacchetti</h1>
            <p className="text-sm text-muted-foreground">
              Pacchetti chiavi-in-mano applicabili a un preventivo con un click.
              Usabili nel preventivatore per partire da una configurazione standard.
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => installTemplatesMut.mutate()}
            disabled={installTemplatesMut.isPending || vertical !== "serramentista"}
            title={vertical !== "serramentista" ? "Template disponibili solo per vertical serramentista" : undefined}
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            {installTemplatesMut.isPending ? "Installazione…" : "Installa 5 template"}
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuovo bundle
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Totali</p>
            <p className="text-xl font-bold mt-0.5">{stats.totali}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Attivi</p>
            </div>
            <p className="text-xl font-bold mt-0.5">{stats.attivi}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-muted">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5">
              <Minus className="h-3 w-3 text-muted-foreground" />
              <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Disattivi</p>
            </div>
            <p className="text-xl font-bold mt-0.5">{stats.disattivi}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-blue-500" />
              <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Voci totali</p>
            </div>
            <p className="text-xl font-bold mt-0.5">{stats.totaleVoci}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Search + filter toggles */}
          {bundles.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 items-stretch">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca nome, descrizione, tipo lavoro…"
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                    aria-label="Pulisci"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant={filterAttivi === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterAttivi("all")}
                >
                  Tutti ({stats.totali})
                </Button>
                <Button
                  variant={filterAttivi === "active" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterAttivi("active")}
                >
                  Attivi ({stats.attivi})
                </Button>
                <Button
                  variant={filterAttivi === "inactive" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterAttivi("inactive")}
                >
                  Disattivi ({stats.disattivi})
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Caricamento…</div>
          ) : bundles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Home className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nessun bundle ancora creato.</p>
              <p className="text-xs mt-1 max-w-sm mx-auto">
                Crea un bundle manualmente oppure installa i template pronti (solo vertical Serramentista).
              </p>
              <Button variant="outline" className="mt-4" onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" /> Crea il primo bundle
              </Button>
            </div>
          ) : filteredBundles.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-sm">Nessun bundle corrisponde ai filtri attuali.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSearch(""); setFilterAttivi("all"); }}>
                Azzera filtri
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
                {filteredBundles.map((b) => (
                  <TableRow key={b.id} className={!b.attivo ? "opacity-60" : ""}>
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

            {/* Kit FV: taglia + prezzo offerta (usati dal wizard Fotovoltaico) */}
            {isFvVertical && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-1">☀ Kit Fotovoltaico</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Taglia e prezzo d'offerta del kit: il wizard FV (Fase 5) li usa quando scegli questo kit. Le voci sotto sono opzionali (servono per magazzino/marginalità).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Potenza (kWp)</Label>
                    <Input
                      type="number" min={0} step={0.1} inputMode="decimal"
                      value={draft.fv_kwp ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, fv_kwp: e.target.value === "" ? null : Number(e.target.value) }))
                      }
                      placeholder="es. 6"
                    />
                  </div>
                  <div>
                    <Label>Accumulo (kWh)</Label>
                    <Input
                      type="number" min={0} step={0.1} inputMode="decimal"
                      value={draft.fv_accumulo_kwh ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, fv_accumulo_kwh: e.target.value === "" ? null : Number(e.target.value) }))
                      }
                      placeholder="0 = senza accumulo"
                    />
                  </div>
                  <div>
                    <Label>Prezzo offerta (€)</Label>
                    <Input
                      type="number" min={0} step={1} inputMode="decimal"
                      value={draft.prezzo_offerta ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, prezzo_offerta: e.target.value === "" ? null : Number(e.target.value) }))
                      }
                      placeholder="chiavi in mano"
                    />
                  </div>
                </div>

                {/* Immagine copertina kit (usata nel PDF preventivo FV) */}
                <div className="mt-3">
                  <Label>Immagine copertina kit (PDF)</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Verrà mostrata nel preventivo PDF nella pagina dedicata al kit scelto.
                  </p>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCoverUpload(f);
                      e.target.value = "";
                    }}
                  />
                  {draft.cover_image_url ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={draft.cover_image_url}
                        alt="Copertina kit"
                        className="h-20 w-32 object-cover rounded border"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => coverInputRef.current?.click()}
                          disabled={coverUploading}
                        >
                          {coverUploading ? "Caricamento…" : "Sostituisci"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDraft((d) => ({ ...d, cover_image_url: null }))}
                        >
                          Rimuovi
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={coverUploading}
                    >
                      {coverUploading ? "Caricamento…" : "Carica immagine"}
                    </Button>
                  )}
                </div>
              </div>
            )}

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
