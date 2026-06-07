import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, FileText, Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Adempimento {
  id: string;
  titolo: string;
  descrizione: string | null;
  tipo: string;
  scadenza: string;
  importo_stimato: number | null;
  stato: "aperto" | "pagato" | "prorogato" | "non_dovuto";
  ricorrente: boolean;
  ricorrenza_mesi: number | null;
  note: string | null;
}

const TIPO_LABELS: Record<string, string> = {
  iva: "IVA",
  inps: "INPS",
  irpef: "IRPEF",
  f24: "F24",
  "730": "730",
  cud: "CUD/CU",
  inail: "INAIL",
  acconto: "Acconto",
  saldo: "Saldo",
  altro: "Altro",
};

const STATO_COLORS: Record<string, string> = {
  aperto: "bg-orange-100 text-orange-800",
  pagato: "bg-green-100 text-green-800",
  prorogato: "bg-blue-100 text-blue-800",
  non_dovuto: "bg-muted text-muted-foreground",
};

const STATO_LABELS: Record<string, string> = {
  aperto: "Aperto",
  pagato: "Pagato",
  prorogato: "Prorogato",
  non_dovuto: "Non dovuto",
};

// Italian fiscal calendar suggestions
const ADEMPIMENTI_STANDARD = [
  { titolo: "Versamento IVA mensile", tipo: "iva", mese: null, giorno: 16, ricorrente: true, ricorrenza_mesi: 1 },
  { titolo: "Dichiarazione IVA annuale", tipo: "iva", mese: 4, giorno: 30, ricorrente: false },
  { titolo: "INPS artigiani/commercianti Q1", tipo: "inps", mese: 5, giorno: 16, ricorrente: false },
  { titolo: "INPS artigiani/commercianti Q2", tipo: "inps", mese: 8, giorno: 20, ricorrente: false },
  { titolo: "INPS artigiani/commercianti Q3", tipo: "inps", mese: 11, giorno: 16, ricorrente: false },
  { titolo: "Acconto IRPEF (prima rata)", tipo: "acconto", mese: 6, giorno: 30, ricorrente: false },
  { titolo: "Acconto IRPEF (seconda rata)", tipo: "acconto", mese: 11, giorno: 30, ricorrente: false },
  { titolo: "Saldo IRPEF", tipo: "saldo", mese: 6, giorno: 30, ricorrente: false },
];

const emptyForm = () => ({
  titolo: "",
  descrizione: "",
  tipo: "f24" as const,
  scadenza: "",
  importo_stimato: "",
  stato: "aperto" as const,
  ricorrente: false,
  ricorrenza_mesi: "",
  note: "",
});

export default function AdempimentiFiscali() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

  const years = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() + i - 1));

  const { data: adempimenti = [], isLoading } = useQuery({
    queryKey: ["adempimenti-fiscali", companyId, filterYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("adempimenti_fiscali")
        .select("*")
        .eq("company_id", companyId!)
        .gte("scadenza", `${filterYear}-01-01`)
        .lte("scadenza", `${filterYear}-12-31`)
        .order("scadenza", { ascending: true });
      if (error) throw error;
      return (data || []) as Adempimento[];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.titolo.trim()) throw new Error("Titolo obbligatorio");
      if (!form.scadenza) throw new Error("Scadenza obbligatoria");
      const { error } = await supabase.from("adempimenti_fiscali").insert({
        company_id: companyId,
        titolo: form.titolo.trim(),
        descrizione: form.descrizione.trim() || null,
        tipo: form.tipo,
        scadenza: form.scadenza,
        importo_stimato: form.importo_stimato ? parseFloat(form.importo_stimato) : null,
        stato: form.stato,
        ricorrente: form.ricorrente,
        ricorrenza_mesi: form.ricorrente && form.ricorrenza_mesi ? parseInt(form.ricorrenza_mesi) : null,
        note: form.note.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Adempimento aggiunto");
      queryClient.invalidateQueries({ queryKey: ["adempimenti-fiscali", companyId] });
      setDialogOpen(false);
      setForm(emptyForm());
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateStatoMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await supabase
        .from("adempimenti_fiscali")
        .update({ stato })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adempimenti-fiscali", companyId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const today = new Date().toLocaleDateString("en-CA");
  const aperti = adempimenti.filter((a) => a.stato === "aperto");
  const scaduti = aperti.filter((a) => a.scadenza < today);
  const inScadenza = aperti.filter(
    (a) => a.scadenza >= today && a.scadenza <= new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-CA")
  );

  if (!companyId) return null;

  return (
    <div className="space-y-4 mt-4">
      {/* Summary banners */}
      {(scaduti.length > 0 || inScadenza.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {scaduti.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
              <span className="text-red-700 font-medium">{scaduti.length} adempiment{scaduti.length === 1 ? "o" : "i"} scadut{scaduti.length === 1 ? "o" : "i"}</span>
            </div>
          )}
          {inScadenza.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-sm">
              <Clock className="h-4 w-4 text-orange-600" aria-hidden="true" />
              <span className="text-orange-700 font-medium">{inScadenza.length} in scadenza entro 30gg</span>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">Adempimenti Fiscali</h3>
          <Badge variant="secondary">{adempimenti.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Aggiungi
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : adempimenti.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Nessun adempimento per il {filterYear}</p>
            <p className="text-xs text-muted-foreground">Aggiungi le scadenze fiscali per tenerti aggiornato</p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi adempimento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titolo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Importo stimato</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {adempimenti.map((a) => {
                const isScaduto = a.stato === "aperto" && a.scadenza < today;
                return (
                  <TableRow
                    key={a.id}
                    className={cn(isScaduto && "bg-red-50/50")}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {isScaduto && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" aria-hidden="true" />}
                        {a.stato === "pagato" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" aria-hidden="true" />}
                        <span className="text-sm font-medium">{a.titolo}</span>
                        {a.ricorrente && <Badge variant="outline" className="text-[9px] h-4 px-1">Ricorrente</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{TIPO_LABELS[a.tipo] ?? a.tipo}</Badge>
                    </TableCell>
                    <TableCell className={cn("text-sm", isScaduto ? "text-red-600 font-medium" : "")}>
                      {new Date(a.scadenza).toLocaleDateString("it-IT")}
                    </TableCell>
                    <TableCell className="text-right text-sm hidden sm:table-cell">
                      {a.importo_stimato != null ? formatCurrency(a.importo_stimato) : "—"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={a.stato}
                        onValueChange={(v) => updateStatoMutation.mutate({ id: a.id, stato: v })}
                      >
                        <SelectTrigger className="h-7 text-xs w-28 border-none p-1">
                          <SelectValue>
                            <Badge className={cn("text-xs border-0", STATO_COLORS[a.stato])}>
                              {STATO_LABELS[a.stato]}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(["aperto", "pagato", "prorogato", "non_dovuto"] as const).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{STATO_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo adempimento fiscale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Titolo *</Label>
              <Input
                value={form.titolo}
                onChange={(e) => setForm((p) => ({ ...p, titolo: e.target.value }))}
                placeholder="Es. Versamento IVA mensile"
              />
            </div>
            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-1">
              {ADEMPIMENTI_STANDARD.slice(0, 4).map((s) => (
                <button
                  key={s.titolo}
                  type="button"
                  onClick={() => {
                    const year = parseInt(filterYear);
                    const month = s.mese ?? new Date().getMonth() + 1;
                    const scadenza = `${year}-${String(month).padStart(2, "0")}-${String(s.giorno).padStart(2, "0")}`;
                    setForm((p) => ({ ...p, titolo: s.titolo, tipo: s.tipo as any, scadenza, ricorrente: s.ricorrente ?? false, ricorrenza_mesi: (s as any).ricorrenza_mesi ? String((s as any).ricorrenza_mesi) : "" }));
                  }}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                >
                  {s.titolo}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((p) => ({ ...p, tipo: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Scadenza *</Label>
                <Input type="date" value={form.scadenza} onChange={(e) => setForm((p) => ({ ...p, scadenza: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Importo stimato (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.importo_stimato} onChange={(e) => setForm((p) => ({ ...p, importo_stimato: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Stato</Label>
                <Select value={form.stato} onValueChange={(v) => setForm((p) => ({ ...p, stato: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["aperto", "pagato", "prorogato", "non_dovuto"] as const).map((s) => (
                      <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ricorrente"
                checked={form.ricorrente}
                onChange={(e) => setForm((p) => ({ ...p, ricorrente: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="ricorrente" className="cursor-pointer text-sm font-normal">Ricorrente</Label>
              {form.ricorrente && (
                <Input
                  type="number"
                  min="1"
                  max="12"
                  className="w-20 h-8 ml-2"
                  placeholder="mesi"
                  value={form.ricorrenza_mesi}
                  onChange={(e) => setForm((p) => ({ ...p, ricorrenza_mesi: e.target.value }))}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} rows={2} placeholder="Note opzionali..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
