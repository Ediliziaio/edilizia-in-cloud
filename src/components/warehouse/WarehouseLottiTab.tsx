/**
 * WarehouseLottiTab — gestione lotti di magazzino (refactor 2026-05-20).
 *
 * Cambio architetturale: prima usava la tabella legacy `warehouse_lotti`
 * (testi liberi, NO FK al catalogo). Ora usa `stock_lotti` con FK opzionali
 * a warehouse_stock + suppliers + warehouses. Effetto:
 *  - il filtro lotto in /azienda/magazzino vede ANCHE questi lotti
 *  - drill-down "Vedi seriali del lotto" funziona quando articolo è serialized
 *  - report fornitore + magazzino per lotto possibili senza join testuale
 *
 * Form Nuovo Lotto migliorato:
 *  - Selettore articolo (autocomplete su nome + internal_code + barcode)
 *  - Selettore fornitore (dropdown con tutti i fornitori company)
 *  - Selettore magazzino destinazione
 *  - Posizione fisica (testo libero)
 *  - Data scadenza
 *  - Note
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Package, Loader2, AlertTriangle, Clock, ListPlus, Eye, ScanLine } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { StockUnitsDrilldownSheet } from "@/components/warehouse/StockUnitsDrilldownSheet";
import { AssignSerialsToLottoDialog } from "@/components/warehouse/AssignSerialsToLottoDialog";

interface Lotto {
  id: string;
  codice_lotto: string;
  articolo: string | null;
  descrizione: string | null;
  fornitore: string | null;
  supplier_id: string | null;
  stock_item_id: string | null;
  warehouse_id: string | null;
  quantita: number;
  unita_misura: string | null;
  data_scadenza: string | null;
  posizione: string | null;
  note: string | null;
  created_at: string;
}

interface LottoForm {
  codice_lotto: string;
  articolo: string;
  stock_item_id: string;       // "" = libero
  supplier_id: string;          // "" = libero
  fornitore_libero: string;
  warehouse_id: string;         // "" = nessuno
  quantita: string;
  unita_misura: string;
  data_scadenza: string;
  posizione: string;
  note: string;
}

const emptyForm: LottoForm = {
  codice_lotto: "",
  articolo: "",
  stock_item_id: "",
  supplier_id: "",
  fornitore_libero: "",
  warehouse_id: "",
  quantita: "",
  unita_misura: "pz",
  data_scadenza: "",
  posizione: "",
  note: "",
};

function ScadenzaBadge({ data }: { data: string | null }) {
  if (!data) return <span className="text-muted-foreground text-xs">—</span>;
  const days = differenceInDays(parseISO(data), new Date());
  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  let label = format(parseISO(data), "dd/MM/yyyy");
  if (days < 0) {
    variant = "destructive";
    label = `Scaduto (${Math.abs(days)}gg fa)`;
  } else if (days <= 30) {
    variant = "outline";
    label = `${label} (${days}gg)`;
  }
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

interface WarehouseLottiTabProps {
  readOnly?: boolean;
}

export default function WarehouseLottiTab({ readOnly = false }: WarehouseLottiTabProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lotto | null>(null);
  const [form, setForm] = useState<LottoForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [drilldownLottoId, setDrilldownLottoId] = useState<string | null>(null);
  const [assignLottoId, setAssignLottoId] = useState<string | null>(null);

  // ── Lista lotti ─────────────────────────────────────────────────────────
  const { data: lotti = [], isLoading } = useQuery({
    queryKey: ["warehouse-lotti-list-full", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Lotto[]> => {
      const { data, error } = await supabase
        .from("stock_lotti")
        .select(
          "id, codice_lotto, articolo, descrizione, fornitore, supplier_id, stock_item_id, warehouse_id, quantita, unita_misura, data_scadenza, posizione, note, created_at",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Lotto[];
    },
  });

  // ── Cataloghi per i selettori ───────────────────────────────────────────
  const { data: stockItems = [] } = useQuery({
    queryKey: ["lotti-stock-items", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, name, internal_code, barcode, tracking_mode")
        .eq("company_id", companyId!)
        .order("name")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["lotti-suppliers", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["lotti-warehouses", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, is_default")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Selected stock item info (per auto-popolamento) ─────────────────────
  const selectedStockItem = useMemo(
    () => stockItems.find((s) => s.id === form.stock_item_id),
    [stockItems, form.stock_item_id],
  );

  // ── Drilldown lotto selezionato (per nome del Sheet) ────────────────────
  const drilldownLotto = useMemo(
    () => lotti.find((l) => l.id === drilldownLottoId),
    [lotti, drilldownLottoId],
  );
  const assignLotto = useMemo(
    () => lotti.find((l) => l.id === assignLottoId),
    [lotti, assignLottoId],
  );

  // ── Mutations ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stock_lotti").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lotto eliminato");
      queryClient.invalidateQueries({ queryKey: ["warehouse-lotti-list-full", companyId] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-lotti-list", companyId] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      toast.error(e.message || "Errore nell'eliminazione del lotto");
      setDeleteTarget(null);
    },
  });

  const handleCreate = async () => {
    if (readOnly) return;
    // Guard interno contro double-submit: prima il button era `disabled={isSaving}`
    // ma tra il primo click e il setIsSaving(true) c'è una micro-finestra in cui
    // un doppio click ravvicinato passa entrambi → crea 2 lotti duplicati.
    if (isSaving) return;
    if (!form.codice_lotto.trim()) {
      toast.error("Inserisci il codice lotto");
      return;
    }
    if (!form.articolo.trim() && !form.stock_item_id) {
      toast.error("Seleziona un articolo dal catalogo o inserisci il nome");
      return;
    }
    if (!form.quantita || isNaN(Number(form.quantita)) || Number(form.quantita) < 0) {
      toast.error("Inserisci una quantità valida");
      return;
    }
    setIsSaving(true);
    try {
      // Articolo: usa nome catalogo se selezionato, altrimenti testo libero.
      const articoloName =
        selectedStockItem?.name?.trim() || form.articolo.trim();
      // Fornitore: usa supplier_id se selezionato, altrimenti testo libero.
      const fornitoreText =
        suppliers.find((s) => s.id === form.supplier_id)?.name ||
        form.fornitore_libero.trim() ||
        null;

      const { error } = await supabase.from("stock_lotti").insert({
        company_id: companyId!,
        codice_lotto: form.codice_lotto.trim(),
        articolo: articoloName,
        descrizione: articoloName, // legacy NOT NULL
        stock_item_id: form.stock_item_id || null,
        supplier_id: form.supplier_id || null,
        fornitore: fornitoreText,
        warehouse_id: form.warehouse_id || null,
        quantita: Number(form.quantita),
        unita_misura: form.unita_misura || "pz",
        data_scadenza: form.data_scadenza || null,
        posizione: form.posizione.trim() || null,
        note: form.note.trim() || null,
      } as never);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Lotto creato");
      setDialogOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["warehouse-lotti-list-full", companyId] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-lotti-list", companyId] });
    } finally {
      setIsSaving(false);
    }
  };

  const setField =
    <K extends keyof LottoForm>(field: K) =>
    (value: LottoForm[K]) =>
      setForm((prev) => ({ ...prev, [field]: value }));

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  const today = new Date();
  const expiredLotti = lotti.filter(
    (l) => l.data_scadenza && differenceInDays(parseISO(l.data_scadenza), today) < 0,
  );
  const expiringLotti = lotti.filter(
    (l) =>
      l.data_scadenza &&
      differenceInDays(parseISO(l.data_scadenza), today) >= 0 &&
      differenceInDays(parseISO(l.data_scadenza), today) <= 30,
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Lotti</h2>
          <Badge variant="outline">{lotti.length}</Badge>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" /> Nuovo lotto
          </Button>
        )}
      </div>

      {/* Expiry alerts */}
      {expiredLotti.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 mb-4">
          <CardContent className="py-3 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {expiredLotti.length} lott{expiredLotti.length === 1 ? "o" : "i"} scadut{expiredLotti.length === 1 ? "o" : "i"}
              </p>
              <p className="text-xs text-destructive/80">
                {expiredLotti.map((l) => `${l.codice_lotto} (${l.articolo || "—"})`).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {expiringLotti.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 mb-4">
          <CardContent className="py-3 flex items-start gap-2">
            <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {expiringLotti.length} lott{expiringLotti.length === 1 ? "o" : "i"} in scadenza entro 30 giorni
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {lotti.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center justify-center gap-3 text-center">
            <Package className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Nessun lotto registrato</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tieni traccia di numeri lotto, scadenze, fornitori e magazzino per ogni materiale.
              </p>
            </div>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Crea primo lotto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Lotto</TableHead>
                  <TableHead>Articolo</TableHead>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Quantità</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotti.map((lotto) => (
                  <TableRow key={lotto.id}>
                    <TableCell className="font-mono text-sm font-medium">{lotto.codice_lotto}</TableCell>
                    <TableCell>{lotto.articolo || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{lotto.fornitore || "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {lotto.quantita} {lotto.unita_misura || "pz"}
                    </TableCell>
                    <TableCell>
                      <ScadenzaBadge data={lotto.data_scadenza} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setAssignLottoId(lotto.id)}
                            aria-label="Assegna seriali al lotto"
                            title="Assegna seriali al lotto"
                          >
                            <ScanLine className="h-3.5 w-3.5 text-orange-600" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setDrilldownLottoId(lotto.id)}
                          aria-label="Vedi seriali del lotto"
                          title="Vedi seriali del lotto"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setDeleteTarget(lotto)}
                            aria-label={`Elimina lotto ${lotto.codice_lotto}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo Lotto</DialogTitle>
            <DialogDescription>
              Crea un nuovo lotto associandolo al catalogo articoli, fornitore e magazzino di destinazione.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Codice lotto */}
            <div className="space-y-1">
              <Label htmlFor="lotto-codice">
                Codice lotto <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lotto-codice"
                value={form.codice_lotto}
                onChange={(e) => setField("codice_lotto")(e.target.value)}
                placeholder="LOT-2026-001"
                className="font-mono"
              />
            </div>

            {/* Articolo: catalogo o libero */}
            <div className="space-y-1">
              <Label>
                Articolo <span className="text-destructive">*</span>
              </Label>
              {stockItems.length > 0 ? (
                <>
                  <Select
                    value={form.stock_item_id || "__free__"}
                    onValueChange={(v) => {
                      if (v === "__free__") {
                        setField("stock_item_id")("");
                      } else {
                        setField("stock_item_id")(v);
                        const it = stockItems.find((s) => s.id === v);
                        if (it) {
                          setField("articolo")(it.name);
                        }
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Scegli dal catalogo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__free__">— Inserimento libero (testo) —</SelectItem>
                      {stockItems.map((it) => (
                        <SelectItem key={it.id} value={it.id}>
                          <div className="flex items-center gap-2">
                            <span>{it.name}</span>
                            {it.internal_code && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {it.internal_code}
                              </span>
                            )}
                            {it.tracking_mode === "serialized" && (
                              <Badge variant="outline" className="text-[9px]">SER</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!form.stock_item_id && (
                    <Input
                      value={form.articolo}
                      onChange={(e) => setField("articolo")(e.target.value)}
                      placeholder="Nome articolo (es. Cemento Portland)"
                      className="mt-1"
                    />
                  )}
                  {selectedStockItem?.tracking_mode === "serialized" && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded">
                      Articolo serializzato: dopo aver creato il lotto potrai assegnare i singoli seriali via{" "}
                      <strong>"Gestisci seriali"</strong> nell'inventario o nella commessa.
                    </p>
                  )}
                </>
              ) : (
                <Input
                  value={form.articolo}
                  onChange={(e) => setField("articolo")(e.target.value)}
                  placeholder="Nome articolo (es. Cemento Portland)"
                />
              )}
            </div>

            {/* Fornitore: catalogo o libero */}
            <div className="space-y-1">
              <Label>Fornitore</Label>
              {suppliers.length > 0 ? (
                <Select
                  value={form.supplier_id || "__free__"}
                  onValueChange={(v) => {
                    if (v === "__free__") {
                      setField("supplier_id")("");
                    } else {
                      setField("supplier_id")(v);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Scegli fornitore..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__free__">— Nessuno / Libero —</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.fornitore_libero}
                  onChange={(e) => setField("fornitore_libero")(e.target.value)}
                  placeholder="Italcementi S.p.A."
                />
              )}
              {!form.supplier_id && suppliers.length > 0 && (
                <Input
                  value={form.fornitore_libero}
                  onChange={(e) => setField("fornitore_libero")(e.target.value)}
                  placeholder="Oppure inserisci manualmente"
                  className="mt-1"
                />
              )}
            </div>

            {/* Magazzino destinazione */}
            <div className="space-y-1">
              <Label>Magazzino destinazione</Label>
              <Select
                value={form.warehouse_id || "__none__"}
                onValueChange={(v) => setField("warehouse_id")(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scegli magazzino..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nessuno —</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.is_default && <span className="ml-1 text-[9px] text-muted-foreground">(default)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantità + UM */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>
                  Quantità <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.quantita}
                  onChange={(e) => setField("quantita")(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>U.M.</Label>
                <Input
                  value={form.unita_misura}
                  onChange={(e) => setField("unita_misura")(e.target.value)}
                  placeholder="pz"
                />
              </div>
            </div>

            {/* Scadenza + Posizione */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data scadenza</Label>
                <Input
                  type="date"
                  value={form.data_scadenza}
                  onChange={(e) => setField("data_scadenza")(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Posizione fisica</Label>
                <Input
                  value={form.posizione}
                  onChange={(e) => setField("posizione")(e.target.value)}
                  placeholder="Scaffale A3 / Bay 12"
                />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1">
              <Label>Note</Label>
              <Input
                value={form.note}
                onChange={(e) => setField("note")(e.target.value)}
                placeholder="Opzionali..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Annulla
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <ListPlus className="h-4 w-4 mr-1" />
              {isSaving ? "Salvataggio..." : "Crea lotto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina lotto</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il lotto <strong>{deleteTarget?.codice_lotto}</strong>?
              Questa azione non è reversibile. I seriali assegnati al lotto resteranno ma perderanno il link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drill-down seriali del lotto */}
      <StockUnitsDrilldownSheet
        open={!!drilldownLottoId}
        onOpenChange={(o) => !o && setDrilldownLottoId(null)}
        title={drilldownLotto ? `Seriali del lotto ${drilldownLotto.codice_lotto}` : undefined}
        lotti={lotti.map((l) => ({ id: l.id, codice_lotto: l.codice_lotto }))}
        // Pre-filter via stockItemId del lotto (se collegato) — nella Sheet
        // l'utente può poi aggiungere ulteriori filtri.
        stockItemId={drilldownLotto?.stock_item_id ?? undefined}
      />

      {/* Assegna nuovi seriali al lotto */}
      {!readOnly && assignLottoId && (
        <AssignSerialsToLottoDialog
          open={!!assignLottoId}
          onOpenChange={(o) => !o && setAssignLottoId(null)}
          lottoId={assignLottoId}
          lottoCode={assignLotto?.codice_lotto}
          articolo={assignLotto?.articolo}
        />
      )}
    </>
  );
}
