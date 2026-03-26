import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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

// ─── Types ────────────────────────────────────────────────────────────────────
type TipoTariffa = "posa" | "trasporto" | "tiro_piano" | "smaltimento" | "nolo" | "altro";

// DB columns for tariffe_aziendali:
// id, company_id, nome, tipo, prezzo_vendita, prezzo_costo, unita, piano_base, prezzo_piano_aggiuntivo
interface Tariffa {
  id: string;
  company_id: string;
  nome: string;
  tipo: TipoTariffa;
  unita?: string;
  prezzo_vendita?: number;
  prezzo_costo?: number;
  piano_base?: number;
  prezzo_piano_aggiuntivo?: number;
}

interface Categoria { id: string; nome: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const TIPO_TABS: { value: TipoTariffa | "altro"; label: string }[] = [
  { value: "posa", label: "Posa" },
  { value: "trasporto", label: "Trasporto" },
  { value: "tiro_piano", label: "Tiro Piano" },
  { value: "smaltimento", label: "Smaltimento" },
  { value: "nolo", label: "Nolo" },
  { value: "altro", label: "Altro" },
];

const UM_BY_TIPO: Record<string, string[]> = {
  posa: ["pz", "mq", "ml", "h", "fisso"],
  trasporto: ["fisso", "km", "pz"],
  tiro_piano: ["piano", "fisso", "pz"],
  smaltimento: ["pz", "mc", "mq", "fisso"],
  nolo: ["fisso", "mq", "gg", "sett"],
  altro: ["pz", "mq", "h", "fisso", "ml"],
};

// NOTE: categoria_prodotto and descrizione are NOT in the tariffe_aziendali schema.
// attiva is NOT in the schema either — removed from all payloads.
const DEFAULT_TARIFFE: Omit<Tariffa, "id" | "company_id">[] = [
  { nome: "Posa finestra singola", tipo: "posa", unita: "pz", prezzo_vendita: 85, prezzo_costo: 55 },
  { nome: "Posa porta interna", tipo: "posa", unita: "pz", prezzo_vendita: 65, prezzo_costo: 40 },
  { nome: "Posa pavimento", tipo: "posa", unita: "mq", prezzo_vendita: 18, prezzo_costo: 11 },
  { nome: "Posa rivestimento bagno", tipo: "posa", unita: "mq", prezzo_vendita: 22, prezzo_costo: 14 },
  { nome: "Posa cappotto termico", tipo: "posa", unita: "mq", prezzo_vendita: 25, prezzo_costo: 16 },
  { nome: "Manodopera generica", tipo: "posa", unita: "h", prezzo_vendita: 45, prezzo_costo: 30 },
  { nome: "Trasporto fisso cantiere", tipo: "trasporto", unita: "fisso", prezzo_vendita: 65, prezzo_costo: 40 },
  { nome: "Trasporto al km", tipo: "trasporto", unita: "km", prezzo_vendita: 0.8, prezzo_costo: 0.5 },
  { nome: "Tiro al piano", tipo: "tiro_piano", unita: "piano", prezzo_vendita: 12, prezzo_costo: 8, piano_base: 1, prezzo_piano_aggiuntivo: 5 },
  { nome: "Smaltimento serramento", tipo: "smaltimento", unita: "pz", prezzo_vendita: 22, prezzo_costo: 15 },
  { nome: "Smaltimento porta", tipo: "smaltimento", unita: "pz", prezzo_vendita: 35, prezzo_costo: 22 },
  { nome: "Smaltimento materiale", tipo: "smaltimento", unita: "mc", prezzo_vendita: 95, prezzo_costo: 70 },
  { nome: "Trabattello giornaliero", tipo: "nolo", unita: "fisso", prezzo_vendita: 55, prezzo_costo: 35 },
  { nome: "Ponteggio mq/sett", tipo: "nolo", unita: "mq", prezzo_vendita: 9, prezzo_costo: 6 },
];

function tipoBadgeClass(tipo: string) {
  const map: Record<string, string> = {
    posa: "bg-green-100 text-green-700",
    trasporto: "bg-blue-100 text-blue-700",
    tiro_piano: "bg-purple-100 text-purple-700",
    smaltimento: "bg-orange-100 text-orange-700",
    nolo: "bg-yellow-100 text-yellow-700",
    altro: "bg-gray-100 text-gray-700",
  };
  return map[tipo] ?? map.altro;
}

function calcMargine(pv: number, pa: number) {
  if (!pv) return 0;
  return ((pv - pa) / pv) * 100;
}

// ─── Tariffa Dialog ───────────────────────────────────────────────────────────
function TariffaDialog({
  open, onClose, editing, companyId, isAdmin, onSaved,
}: {
  open: boolean; onClose: () => void; editing: Tariffa | null;
  companyId: string; isAdmin: boolean; onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [tipo, setTipo] = useState<TipoTariffa>(editing?.tipo ?? "posa");
  const [unita, setUnita] = useState(editing?.unita ?? "pz");
  const [prezzoVendita, setPrezzoVendita] = useState(String(editing?.prezzo_vendita ?? ""));
  const [prezzoCosto, setPrezzoCosto] = useState(String(editing?.prezzo_costo ?? ""));
  const [pianoBase, setPianoBase] = useState(String(editing?.piano_base ?? "1"));
  const [prezzoPianoAgg, setPrezzoPianoAgg] = useState(String(editing?.prezzo_piano_aggiuntivo ?? ""));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload: any = {
        company_id: companyId,
        nome: nome.trim(),
        tipo,
        unita: unita || null,
        prezzo_vendita: prezzoVendita.trim() !== "" ? parseFloat(prezzoVendita) : null,
        piano_base: tipo === "tiro_piano"
          ? (pianoBase.trim() !== "" ? parseInt(pianoBase, 10) : 1)
          : null,
        prezzo_piano_aggiuntivo: tipo === "tiro_piano"
          ? (prezzoPianoAgg.trim() !== "" ? parseFloat(prezzoPianoAgg) : null)
          : null,
      };
      // prezzo_costo only visible/writable by admins
      if (isAdmin) {
        payload.prezzo_costo = prezzoCosto.trim() !== "" ? parseFloat(prezzoCosto) : null;
      }

      if (editing) {
        const { error } = await (supabase.from("tariffe_aziendali") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("tariffe_aziendali") as any)
          .insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tariffa aggiornata" : "Tariffa creata");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const unitOptions = UM_BY_TIPO[tipo] ?? UM_BY_TIPO.altro;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tariffa" : "Nuova tariffa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome tariffa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => {
                setTipo(v as TipoTariffa);
                setUnita(UM_BY_TIPO[v]?.[0] ?? "pz");
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_TABS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unità di misura</Label>
              <Select value={unita} onValueChange={setUnita}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isAdmin && (
              <div>
                <Label>Prezzo costo €</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prezzoCosto}
                  onChange={(e) => setPrezzoCosto(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
            <div>
              <Label>Prezzo vendita €</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={prezzoVendita}
                onChange={(e) => setPrezzoVendita(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          {tipo === "tiro_piano" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
              <div>
                <Label>Piano base (soglia)</Label>
                <Input
                  type="number"
                  min="0"
                  value={pianoBase}
                  onChange={(e) => setPianoBase(e.target.value)}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Piani ≥ soglia aggiungono il prezzo extra
                </p>
              </div>
              <div>
                <Label>Prezzo piano aggiuntivo €</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prezzoPianoAgg}
                  onChange={(e) => setPrezzoPianoAgg(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── TariffeTable (outside main component to avoid remount on every render) ───
function TariffeTable({
  items, isAdmin, colCount, onEdit, onDelete,
}: {
  items: Tariffa[];
  isAdmin: boolean;
  colCount: number;
  onEdit: (t: Tariffa) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>UM</TableHead>
            <TableHead>Prezzo vendita</TableHead>
            {isAdmin && <TableHead>Prezzo costo</TableHead>}
            {isAdmin && <TableHead>Margine %</TableHead>}
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="text-center py-6 text-muted-foreground">
                Nessuna tariffa in questa categoria. Clicca "Nuova tariffa" per aggiungerne una.
              </TableCell>
            </TableRow>
          ) : items.map((t) => {
            const pv = t.prezzo_vendita ?? 0;
            const pc = t.prezzo_costo ?? 0;
            const margine = calcMargine(pv, pc);
            return (
              <TableRow key={t.id}>
                <TableCell>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tipoBadgeClass(t.tipo)}`}>
                    {TIPO_TABS.find((x) => x.value === t.tipo)?.label ?? t.tipo}
                  </span>
                </TableCell>
                <TableCell className="font-medium">
                  {t.nome}
                  {t.tipo === "tiro_piano" && t.prezzo_piano_aggiuntivo != null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      +{formatCurrency(t.prezzo_piano_aggiuntivo)}/piano
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.unita ?? "—"}</TableCell>
                <TableCell>{pv ? formatCurrency(pv) : "—"}</TableCell>
                {isAdmin && <TableCell>{pc ? formatCurrency(pc) : "—"}</TableCell>}
                {isAdmin && (
                  <TableCell>
                    {pc && pv ? (
                      <span className={`text-sm font-medium ${
                        margine >= 25 ? "text-green-600" : margine >= 15 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {margine.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="text-destructive"
                      onClick={() => onDelete(t.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SettingsTariffe() {
  const { effectiveCompany, role } = useAuth() as any;
  const isAdmin = role === "company_admin" || role === "super_admin";
  const companyId = effectiveCompany?.id as string | undefined;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("posa");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tariffa | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmStandard, setConfirmStandard] = useState(false);
  const [creatingStandard, setCreatingStandard] = useState(false);

  const { data: tariffe = [], isLoading } = useQuery({
    queryKey: ["tariffe-aziendali-full", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("tariffe_aziendali") as any)
        .select("id, company_id, nome, tipo, unita, prezzo_vendita, prezzo_costo, piano_base, prezzo_piano_aggiuntivo")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Tariffa[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("tariffe_aziendali") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] });
      toast.success("Tariffa eliminata");
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createStandardTariffe = async (skipExisting = true) => {
    setCreatingStandard(true);
    try {
      const existingNames = new Set(tariffe.map((t) => t.nome));
      const toInsert = DEFAULT_TARIFFE
        .filter((d) => !skipExisting || !existingNames.has(d.nome))
        .map((d) => ({ ...d, company_id: companyId }));
      if (!toInsert.length) {
        toast.info("Tutte le tariffe standard sono già presenti");
        return;
      }
      const { error } = await (supabase.from("tariffe_aziendali") as any).insert(toInsert);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] });
      toast.success(`${toInsert.length} tariffe standard create`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingStandard(false);
      setConfirmStandard(false);
    }
  };

  const handleCreateStandard = () => {
    if (tariffe.length > 0) { setConfirmStandard(true); }
    else { createStandardTariffe(false); }
  };

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (t: Tariffa) => { setEditing(t); setDialogOpen(true); };

  const tariffeByTipo = (tipo: string) =>
    tariffe.filter((t) =>
      tipo === "altro"
        ? !["posa", "trasporto", "tiro_piano", "smaltimento", "nolo"].includes(t.tipo)
        : t.tipo === tipo
    );

  const colCount = isAdmin ? 7 : 5;

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tariffe Aziendali</h1>
          <p className="text-muted-foreground text-sm">Gestisci le tariffe di posa, trasporto e servizi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCreateStandard} disabled={creatingStandard}>
            <Zap className="h-4 w-4 mr-2" />Crea tariffe standard
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />Nuova tariffa
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {TIPO_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {tariffeByTipo(t.value).length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs">
                  {tariffeByTipo(t.value).length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {TIPO_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            {isLoading
              ? <p className="text-center py-8 text-muted-foreground">Caricamento...</p>
              : <TariffeTable items={tariffeByTipo(t.value)} isAdmin={isAdmin} colCount={colCount} onEdit={openEdit} onDelete={setDeleteId} />
            }
          </TabsContent>
        ))}
      </Tabs>

      {dialogOpen && (
        <TariffaDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editing={editing}
          companyId={companyId}
          isAdmin={isAdmin}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] })}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina tariffa</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. La tariffa verrà rimossa definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm standard tariffe */}
      <AlertDialog open={confirmStandard} onOpenChange={setConfirmStandard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Crea tariffe standard</AlertDialogTitle>
            <AlertDialogDescription>
              Esistono già alcune tariffe. Verranno aggiunte solo le tariffe mancanti (quelle con lo stesso nome non verranno duplicate).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => createStandardTariffe(true)}>
              Aggiungi mancanti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
