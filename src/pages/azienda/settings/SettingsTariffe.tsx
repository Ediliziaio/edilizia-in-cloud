import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVertical } from "@/hooks/useVertical";
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
import { TariffaVariantiEditor } from "@/components/settings/TariffaVariantiEditor";
import { useUserPermissions } from "@/hooks/useUserPermissions";

// ─── Types ────────────────────────────────────────────────────────────────────
// FASE 6: tipo esteso con tariffe serramentista + unita_fatturazione canonica.
type TipoTariffa =
  | "posa" | "trasporto" | "tiro_piano" | "smaltimento" | "nolo" | "pratica"
  | "manodopera" | "sopralluogo" | "progettazione" | "ponteggio"
  | "lattoneria" | "sigillatura" | "contorno" | "falso_telaio"
  | "altro";

type UnitaFatturazione =
  | "pz" | "mq" | "ml" | "mc" | "kg" | "gg" | "h" | "a_corpo" | "km" | "piano";

interface Tariffa {
  id: string;
  company_id: string;
  nome: string;
  tipo: TipoTariffa;
  // Legacy: colonna `unita` CHECK (pz/mq/ml/mc/h/piano/km/fisso). Resta per retro-compat.
  unita?: string;
  // FASE 6: source-of-truth UM
  unita_fatturazione?: UnitaFatturazione;
  prezzo_vendita?: number;
  // Legacy alias di costo_interno
  prezzo_costo?: number;
  // FASE 6: costo interno (posatore, attrezzatura, etc.)
  costo_interno?: number;
  vertical_associato?: string | null;
  descrizione?: string | null;
  attivo?: boolean;
  piano_base?: number;
  prezzo_piano_aggiuntivo?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIPO_TABS: { value: TipoTariffa | "altro"; label: string }[] = [
  { value: "posa", label: "Posa" },
  { value: "manodopera", label: "Manodopera" },
  { value: "trasporto", label: "Trasporto" },
  { value: "tiro_piano", label: "Tiro Piano" },
  { value: "smaltimento", label: "Smaltimento" },
  { value: "nolo", label: "Nolo" },
  { value: "sopralluogo", label: "Sopralluogo" },
  { value: "progettazione", label: "Progettazione" },
  { value: "ponteggio", label: "Ponteggio" },
  { value: "lattoneria", label: "Lattoneria" },
  { value: "sigillatura", label: "Sigillatura" },
  { value: "contorno", label: "Contorno" },
  { value: "falso_telaio", label: "Falso telaio" },
  { value: "pratica", label: "Pratica" },
  { value: "altro", label: "Altro" },
];

/** Unità di fatturazione canoniche FASE 6 — la UM è FISSA alla creazione. */
const UM_FATTURAZIONE: { value: UnitaFatturazione; label: string; hint: string }[] = [
  { value: "pz", label: "pz", hint: "Al pezzo" },
  { value: "mq", label: "mq", hint: "Al metro quadro (L×H)" },
  { value: "ml", label: "ml", hint: "Al metro lineare" },
  { value: "mc", label: "mc", hint: "Al metro cubo" },
  { value: "kg", label: "kg", hint: "Al chilo" },
  { value: "gg", label: "gg", hint: "A giornata lavorativa" },
  { value: "h", label: "h", hint: "All'ora" },
  { value: "a_corpo", label: "a corpo", hint: "Importo fisso totale" },
  { value: "km", label: "km", hint: "Al chilometro" },
  { value: "piano", label: "piano", hint: "Per piano di installazione" },
];

/** Suggerimento iniziale di UM per tipo (l'utente può cambiare). */
const UM_DEFAULT_BY_TIPO: Record<string, UnitaFatturazione> = {
  posa: "pz",
  manodopera: "h",
  trasporto: "a_corpo",
  tiro_piano: "piano",
  smaltimento: "pz",
  nolo: "gg",
  sopralluogo: "a_corpo",
  progettazione: "a_corpo",
  ponteggio: "a_corpo",
  lattoneria: "ml",
  sigillatura: "ml",
  contorno: "ml",
  falso_telaio: "pz",
  pratica: "a_corpo",
  altro: "pz",
};

/** Mappa unita_fatturazione → colonna legacy `unita` (CHECK: pz/mq/ml/mc/h/piano/km/fisso). */
function legacyUnitaFrom(u: UnitaFatturazione): string {
  switch (u) {
    case "pz": case "mq": case "ml": case "mc": case "h": case "km": case "piano":
      return u;
    case "a_corpo": return "fisso";
    case "gg": return "h";
    case "kg": return "pz";
  }
}

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
    manodopera: "bg-emerald-100 text-emerald-700",
    trasporto: "bg-blue-100 text-blue-700",
    tiro_piano: "bg-purple-100 text-purple-700",
    smaltimento: "bg-orange-100 text-orange-700",
    nolo: "bg-yellow-100 text-yellow-700",
    sopralluogo: "bg-cyan-100 text-cyan-700",
    progettazione: "bg-indigo-100 text-indigo-700",
    ponteggio: "bg-amber-100 text-amber-700",
    lattoneria: "bg-slate-100 text-slate-700",
    sigillatura: "bg-rose-100 text-rose-700",
    contorno: "bg-lime-100 text-lime-700",
    falso_telaio: "bg-teal-100 text-teal-700",
    pratica: "bg-pink-100 text-pink-700",
    altro: "bg-gray-100 text-gray-700",
  };
  return map[tipo] ?? map.altro;
}

/** Colore semaforo margine: >=25% verde, >=15% giallo, altrimenti rosso. */
function margineColor(margine: number): string {
  if (margine >= 25) return "text-green-600";
  if (margine >= 15) return "text-yellow-600";
  return "text-red-600";
}

function calcMargine(pv: number, pa: number) {
  if (!pv) return 0;
  return ((pv - pa) / pv) * 100;
}

/**
 * Sezione varianti costo: wrapper che si monta solo se l'utente ha
 * can_view_costs. Gating doppio (role check + permission) per evitare
 * anche solo un flash della UI in caso di ruolo non-admin.
 */
function TariffaVariantiSection({
  tariffaId, costoDefault,
}: { tariffaId: string; costoDefault: number | null }) {
  const { data: perms } = useUserPermissions();
  if (!perms?.can_view_costs) return null;
  return <TariffaVariantiEditor tariffaId={tariffaId} costoDefault={costoDefault} />;
}

// ─── Tariffa Dialog ───────────────────────────────────────────────────────────
function TariffaDialog({
  open, onClose, editing, companyId, isAdmin, currentVertical, onSaved,
}: {
  open: boolean; onClose: () => void; editing: Tariffa | null;
  companyId: string; isAdmin: boolean;
  currentVertical: string | null;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [descrizione, setDescrizione] = useState(editing?.descrizione ?? "");
  const [tipo, setTipo] = useState<TipoTariffa>(editing?.tipo ?? "posa");
  // FASE 6: unita_fatturazione è la nuova UM canonica (fissa alla creazione)
  const [unitaFatturazione, setUnitaFatturazione] = useState<UnitaFatturazione>(
    editing?.unita_fatturazione ?? UM_DEFAULT_BY_TIPO[editing?.tipo ?? "posa"] ?? "pz",
  );
  const [prezzoVendita, setPrezzoVendita] = useState(String(editing?.prezzo_vendita ?? ""));
  const [costoInterno, setCostoInterno] = useState(
    String(editing?.costo_interno ?? editing?.prezzo_costo ?? ""),
  );
  const [verticalAssociato, setVerticalAssociato] = useState<string>(
    editing?.vertical_associato ?? (currentVertical ?? ""),
  );
  const [pianoBase, setPianoBase] = useState(String(editing?.piano_base ?? "1"));
  const [prezzoPianoAgg, setPrezzoPianoAgg] = useState(String(editing?.prezzo_piano_aggiuntivo ?? ""));
  const [saving, setSaving] = useState(false);

  // Semaforo margine live
  const pvNum = parseFloat(prezzoVendita) || 0;
  const ciNum = parseFloat(costoInterno) || 0;
  const margineLive = pvNum > 0 ? ((pvNum - ciNum) / pvNum) * 100 : 0;

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_id: companyId,
        nome: nome.trim(),
        descrizione: descrizione.trim() || null,
        tipo,
        // Backward-compat: popoliamo anche la vecchia colonna `unita` con mapping
        unita: legacyUnitaFrom(unitaFatturazione),
        unita_fatturazione: unitaFatturazione,
        vertical_associato: verticalAssociato.trim() || null,
        prezzo_vendita: prezzoVendita.trim() !== "" ? parseFloat(prezzoVendita) : null,
        piano_base: tipo === "tiro_piano"
          ? (pianoBase.trim() !== "" ? parseInt(pianoBase, 10) : 1)
          : null,
        prezzo_piano_aggiuntivo: tipo === "tiro_piano"
          ? (prezzoPianoAgg.trim() !== "" ? parseFloat(prezzoPianoAgg) : null)
          : null,
      };
      // costo_interno only visible/writable by admins
      if (isAdmin) {
        const v = costoInterno.trim() !== "" ? parseFloat(costoInterno) : 0;
        payload.costo_interno = v;
        // Manteniamo il legacy prezzo_costo allineato finché esiste la colonna
        payload.prezzo_costo = v;
      }

      const tbl = supabase.from("tariffe_aziendali");
      if (editing) {
        const { error } = await tbl.update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload as never);
        if (error) throw error;
      }
      toast.success(editing ? "Tariffa aggiornata" : "Tariffa creata");
      onSaved(); onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tariffa" : "Nuova tariffa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome tariffa" />
          </div>
          <div>
            <Label>Descrizione</Label>
            <Input
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Descrizione opzionale (visibile ai colleghi)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => {
                setTipo(v as TipoTariffa);
                // Suggerisci UM di default per il tipo, ma solo se stiamo creando
                if (!editing) {
                  setUnitaFatturazione(UM_DEFAULT_BY_TIPO[v] ?? "pz");
                }
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
              <Label>
                Unità di fatturazione
                {editing && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (FISSA alla creazione, non modificabile per preventivi)
                  </span>
                )}
              </Label>
              <Select
                value={unitaFatturazione}
                onValueChange={(v) => setUnitaFatturazione(v as UnitaFatturazione)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UM_FATTURAZIONE.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      <span className="font-medium">{u.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{u.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Vertical associato</Label>
            <Select
              value={verticalAssociato || "__none__"}
              onValueChange={(v) => setVerticalAssociato(v === "__none__" ? "" : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Globale (nessun vertical)</SelectItem>
                <SelectItem value="serramentista">Serramentista</SelectItem>
                <SelectItem value="generico">Generico</SelectItem>
                <SelectItem value="edile">Edile</SelectItem>
                <SelectItem value="impiantistica">Impiantistica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isAdmin && (
              <div>
                <Label>Costo interno €</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costoInterno}
                  onChange={(e) => setCostoInterno(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Costo reale (posatore, attrezzatura). Non visibile al cliente.
                </p>
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
          {isAdmin && pvNum > 0 && (
            <div className="rounded-lg border p-3 flex items-center justify-between bg-muted/30">
              <span className="text-sm">Margine live</span>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-semibold ${margineColor(margineLive)}`}>
                  {margineLive.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  ({formatCurrency(pvNum - ciNum)} / unit.)
                </span>
              </div>
            </div>
          )}
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
          {/* Sprint B — Varianti Costo Manodopera: visibile solo su tariffe esistenti e solo admin */}
          {isAdmin && editing && <TariffaVariantiSection tariffaId={editing.id} costoDefault={editing.costo_interno ?? editing.prezzo_costo ?? null} />}
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
            // Preferisci costo_interno (FASE 6), cadi sul legacy prezzo_costo
            const pc = t.costo_interno ?? t.prezzo_costo ?? 0;
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
                <TableCell className="text-sm text-muted-foreground">
                  {t.unita_fatturazione ?? t.unita ?? "—"}
                </TableCell>
                <TableCell>{pv ? formatCurrency(pv) : "—"}</TableCell>
                {isAdmin && <TableCell>{pc ? formatCurrency(pc) : "—"}</TableCell>}
                {isAdmin && (
                  <TableCell>
                    {pc && pv ? (
                      <span className={`text-sm font-medium ${margineColor(margine)}`}>
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
  const { effectiveCompany, role } = useAuth();
  const { vertical: currentVertical } = useVertical();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const companyId = effectiveCompany?.id as string | undefined;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("posa");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tariffa | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmStandard, setConfirmStandard] = useState(false);
  const [creatingStandard, setCreatingStandard] = useState(false);
  // FASE 6.3: filtro per vertical_associato
  const [verticalFilter, setVerticalFilter] = useState<"all" | "current" | "global">("all");

  const { data: tariffe = [], isLoading } = useQuery({
    queryKey: ["tariffe-aziendali-full", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tariffe_aziendali")
        .select("id, company_id, nome, descrizione, tipo, unita, unita_fatturazione, prezzo_vendita, prezzo_costo, costo_interno, vertical_associato, piano_base, prezzo_piano_aggiuntivo, attivo")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Tariffa[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tariffe_aziendali")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] });
      toast.success("Tariffa eliminata");
      setDeleteId(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione tariffa");
    },
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
      const { error } = await supabase
        .from("tariffe_aziendali")
        .insert(toInsert as never);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] });
      toast.success(`${toInsert.length} tariffe standard create`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione tariffe");
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

  // Conosce già i valori fissi dei tab "principali": tutti i tab registrati in TIPO_TABS tranne "altro".
  const knownTipi = TIPO_TABS.filter((t) => t.value !== "altro").map((t) => t.value as string);

  const tariffeFiltered = tariffe.filter((t) => {
    if (verticalFilter === "current") return t.vertical_associato === currentVertical;
    if (verticalFilter === "global") return !t.vertical_associato;
    return true; // "all"
  });

  const tariffeByTipo = (tipo: string) =>
    tariffeFiltered.filter((t) =>
      tipo === "altro"
        ? !knownTipi.includes(t.tipo)
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
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={verticalFilter} onValueChange={(v) => setVerticalFilter(v as typeof verticalFilter)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filtra vertical" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le tariffe</SelectItem>
              <SelectItem value="current">Solo vertical corrente ({currentVertical})</SelectItem>
              <SelectItem value="global">Solo globali (nessun vertical)</SelectItem>
            </SelectContent>
          </Select>
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
          currentVertical={currentVertical}
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
