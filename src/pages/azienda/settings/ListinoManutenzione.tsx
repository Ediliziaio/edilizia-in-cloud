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
import { Switch } from "@/components/ui/switch";
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

interface TipoImpianto {
  id: string;
  company_id: string;
  nome: string;
  icona: string | null;
  ordine: number | null;
  attivo: boolean;
}

type CategoriaIntervento = "ordinaria" | "emergenza" | "installazione" | "sopralluogo" | "altro";

interface TipoIntervento {
  id: string;
  company_id: string;
  nome: string;
  categoria: CategoriaIntervento | null;
  durata_stimata_h: number | null;
  attivo: boolean;
}

interface ListinoPrezzo {
  id: string;
  company_id: string;
  tipo_impianto_id: string;
  tipo_intervento_id: string;
  prezzo: number;
  iva_pct: number;
  unita: string;
  tipo_impianto?: TipoImpianto;
  tipo_intervento?: TipoIntervento;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ICONE_IMPIANTO = ["🔥", "🌡️", "💧", "⚡", "☀️", "🔧", "🏠", "❄️", "🛠️", "⚙️"];

const CATEGORIE_INTERVENTO: { value: CategoriaIntervento; label: string; color: string }[] = [
  { value: "ordinaria",    label: "Ordinaria",    color: "bg-green-100 text-green-700" },
  { value: "emergenza",    label: "Emergenza",    color: "bg-red-100 text-red-700" },
  { value: "installazione",label: "Installazione",color: "bg-blue-100 text-blue-700" },
  { value: "sopralluogo",  label: "Sopralluogo",  color: "bg-yellow-100 text-yellow-700" },
  { value: "altro",        label: "Altro",        color: "bg-gray-100 text-gray-700" },
];

const UNITA_OPTIONS = ["intervento", "ora", "mq", "ml", "giorno"];
const IVA_OPTIONS = [0, 4, 5, 10, 22];

// ─── Default seed data ────────────────────────────────────────────────────────

const DEFAULT_TIPI_IMPIANTO = [
  { nome: "Caldaia",              icona: "🔥", ordine: 1 },
  { nome: "Condizionatore",       icona: "❄️", ordine: 2 },
  { nome: "Impianto Idraulico",   icona: "💧", ordine: 3 },
  { nome: "Impianto Elettrico",   icona: "⚡", ordine: 4 },
  { nome: "Fotovoltaico",         icona: "☀️", ordine: 5 },
];

const DEFAULT_TIPI_INTERVENTO = [
  { nome: "Manutenzione ordinaria", categoria: "ordinaria" as CategoriaIntervento,    durata_stimata_h: 2 },
  { nome: "Riparazione guasto",     categoria: "emergenza" as CategoriaIntervento,    durata_stimata_h: 3 },
  { nome: "Sopralluogo",            categoria: "sopralluogo" as CategoriaIntervento,  durata_stimata_h: 1 },
  { nome: "Installazione",          categoria: "installazione" as CategoriaIntervento,durata_stimata_h: 6 },
];

type DefaultTariffa = {
  impianto: string; intervento: string;
  prezzo: number; unita: string; iva_pct: number;
};

const DEFAULT_TARIFFE: DefaultTariffa[] = [
  { impianto: "Caldaia",        intervento: "Manutenzione ordinaria", prezzo: 120, unita: "intervento", iva_pct: 22 },
  { impianto: "Caldaia",        intervento: "Riparazione guasto",     prezzo: 80,  unita: "ora",        iva_pct: 22 },
  { impianto: "Caldaia",        intervento: "Sopralluogo",            prezzo: 60,  unita: "intervento", iva_pct: 22 },
  { impianto: "Condizionatore", intervento: "Manutenzione ordinaria", prezzo: 90,  unita: "intervento", iva_pct: 22 },
  { impianto: "Condizionatore", intervento: "Riparazione guasto",     prezzo: 90,  unita: "ora",        iva_pct: 22 },
  { impianto: "Condizionatore", intervento: "Installazione",          prezzo: 280, unita: "intervento", iva_pct: 10 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoriaBadge(cat: CategoriaIntervento | null) {
  const found = CATEGORIE_INTERVENTO.find((c) => c.value === cat);
  return found ?? { label: cat ?? "—", color: "bg-gray-100 text-gray-700" };
}

// ─── TipiImpianto Dialog ──────────────────────────────────────────────────────

function ImpiantoDialog({
  open, onClose, editing, companyId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: TipoImpianto | null;
  companyId: string; onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [icona, setIcona] = useState(editing?.icona ?? "🔧");
  const [ordine, setOrdine] = useState(String(editing?.ordine ?? ""));
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        nome: nome.trim(),
        icona: icona || null,
        ordine: ordine.trim() !== "" ? parseInt(ordine, 10) : null,
        attivo,
      };
      if (editing) {
        const { error } = await (supabase.from("tipi_impianto") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("tipi_impianto") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tipo impianto aggiornato" : "Tipo impianto creato");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tipo impianto" : "Nuovo tipo impianto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Caldaia" />
          </div>
          <div>
            <Label>Icona</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONE_IMPIANTO.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcona(ic)}
                  className={`text-xl p-1.5 rounded border-2 transition-colors ${
                    icona === ic ? "border-orange-500 bg-orange-50" : "border-transparent hover:border-gray-200"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ordine</Label>
              <Input
                type="number" min="0"
                value={ordine}
                onChange={(e) => setOrdine(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <Label>Attivo</Label>
              <Switch checked={attivo} onCheckedChange={setAttivo} />
            </div>
          </div>
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

// ─── TipiIntervento Dialog ────────────────────────────────────────────────────

function InterventoDialog({
  open, onClose, editing, companyId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: TipoIntervento | null;
  companyId: string; onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [categoria, setCategoria] = useState<CategoriaIntervento>(editing?.categoria ?? "ordinaria");
  const [durata, setDurata] = useState(String(editing?.durata_stimata_h ?? ""));
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        nome: nome.trim(),
        categoria,
        durata_stimata_h: durata.trim() !== "" ? parseFloat(durata) : null,
        attivo,
      };
      if (editing) {
        const { error } = await (supabase.from("tipi_intervento") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("tipi_intervento") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tipo intervento aggiornato" : "Tipo intervento creato");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tipo intervento" : "Nuovo tipo intervento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Manutenzione ordinaria" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaIntervento)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIE_INTERVENTO.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Durata stimata (h)</Label>
              <Input
                type="number" min="0" step="0.5"
                value={durata}
                onChange={(e) => setDurata(e.target.value)}
                placeholder="2"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label>Attivo</Label>
            <Switch checked={attivo} onCheckedChange={setAttivo} />
          </div>
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

// ─── Listino Dialog ───────────────────────────────────────────────────────────

function ListinoDialog({
  open, onClose, editing, companyId, tipiImpianto, tipiIntervento, onSaved,
}: {
  open: boolean; onClose: () => void; editing: ListinoPrezzo | null;
  companyId: string;
  tipiImpianto: TipoImpianto[];
  tipiIntervento: TipoIntervento[];
  onSaved: () => void;
}) {
  const [impiantoId, setImpiantoId] = useState(editing?.tipo_impianto_id ?? "");
  const [interventoId, setInterventoId] = useState(editing?.tipo_intervento_id ?? "");
  const [prezzo, setPrezzo] = useState(String(editing?.prezzo ?? ""));
  const [iva, setIva] = useState(String(editing?.iva_pct ?? "22"));
  const [unita, setUnita] = useState(editing?.unita ?? "intervento");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!impiantoId) { toast.error("Seleziona un tipo impianto"); return; }
    if (!interventoId) { toast.error("Seleziona un tipo intervento"); return; }
    if (!prezzo.trim() || isNaN(parseFloat(prezzo))) { toast.error("Inserisci un prezzo valido"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        tipo_impianto_id: impiantoId,
        tipo_intervento_id: interventoId,
        prezzo: parseFloat(prezzo),
        iva_pct: parseFloat(iva),
        unita,
      };
      if (editing) {
        const { error } = await (supabase.from("listino_prezzi") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("listino_prezzi") as any).insert(payload);
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tariffa" : "Nuova tariffa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo impianto *</Label>
            <Select value={impiantoId} onValueChange={setImpiantoId} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="Seleziona impianto..." /></SelectTrigger>
              <SelectContent>
                {tipiImpianto.filter((t) => t.attivo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.icona ? `${t.icona} ` : ""}{t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo intervento *</Label>
            <Select value={interventoId} onValueChange={setInterventoId} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="Seleziona intervento..." /></SelectTrigger>
              <SelectContent>
                {tipiIntervento.filter((t) => t.attivo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Prezzo €</Label>
              <Input
                type="number" min="0" step="0.01"
                value={prezzo}
                onChange={(e) => setPrezzo(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>IVA %</Label>
              <Select value={iva} onValueChange={setIva}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IVA_OPTIONS.map((v) => (
                    <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unità</Label>
              <Select value={unita} onValueChange={setUnita}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITA_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ListinoManutenzione() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id as string | undefined;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("impianti");

  // Impianti state
  const [impiantoDialogOpen, setImpiantoDialogOpen] = useState(false);
  const [editingImpianto, setEditingImpianto] = useState<TipoImpianto | null>(null);
  const [deleteImpiantoId, setDeleteImpiantoId] = useState<string | null>(null);

  // Interventi state
  const [interventoDialogOpen, setInterventoDialogOpen] = useState(false);
  const [editingIntervento, setEditingIntervento] = useState<TipoIntervento | null>(null);
  const [deleteInterventoId, setDeleteInterventoId] = useState<string | null>(null);

  // Listino state
  const [listinoDialogOpen, setListinoDialogOpen] = useState(false);
  const [editingListino, setEditingListino] = useState<ListinoPrezzo | null>(null);
  const [deleteListinoId, setDeleteListinoId] = useState<string | null>(null);

  // Demo seed state
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: tipiImpianto = [], isLoading: loadingImpianti } = useQuery({
    queryKey: ["tipi-impianto", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("tipi_impianto") as any)
        .select("id, company_id, nome, icona, ordine, attivo")
        .eq("company_id", companyId)
        .order("ordine", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TipoImpianto[];
    },
  });

  const { data: tipiIntervento = [], isLoading: loadingInterventi } = useQuery({
    queryKey: ["tipi-intervento", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("tipi_intervento") as any)
        .select("id, company_id, nome, categoria, durata_stimata_h, attivo")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as TipoIntervento[];
    },
  });

  const { data: listino = [], isLoading: loadingListino } = useQuery({
    queryKey: ["listino-prezzi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("listino_prezzi") as any)
        .select(`
          id, company_id, tipo_impianto_id, tipo_intervento_id, prezzo, iva_pct, unita,
          tipo_impianto:tipi_impianto(id, nome, icona),
          tipo_intervento:tipi_intervento(id, nome)
        `)
        .eq("company_id", companyId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ListinoPrezzo[];
    },
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const deleteImpiantoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("tipi_impianto") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] });
      toast.success("Tipo impianto eliminato");
      setDeleteImpiantoId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteInterventoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("tipi_intervento") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] });
      toast.success("Tipo intervento eliminato");
      setDeleteInterventoId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteListinoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("listino_prezzi") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] });
      toast.success("Tariffa eliminata");
      setDeleteListinoId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Demo seed ────────────────────────────────────────────────────────────

  const handleCreaDemoClick = () => {
    if (tipiImpianto.length > 0 || tipiIntervento.length > 0 || listino.length > 0) {
      setConfirmDemo(true);
    } else {
      creaDemoData();
    }
  };

  const creaDemoData = async () => {
    if (!companyId) return;
    setCreatingDemo(true);
    try {
      // 1. Insert tipi_impianto (skip existing by nome)
      const existingImpNomi = new Set(tipiImpianto.map((t) => t.nome));
      const impiantiToInsert = DEFAULT_TIPI_IMPIANTO
        .filter((d) => !existingImpNomi.has(d.nome))
        .map((d) => ({ ...d, company_id: companyId, attivo: true }));

      let insertedImpianti: TipoImpianto[] = [];
      if (impiantiToInsert.length > 0) {
        const { data, error } = await (supabase.from("tipi_impianto") as any)
          .insert(impiantiToInsert).select("id, nome");
        if (error) throw error;
        insertedImpianti = data ?? [];
      }

      // 2. Insert tipi_intervento (skip existing by nome)
      const existingIntNomi = new Set(tipiIntervento.map((t) => t.nome));
      const interventiToInsert = DEFAULT_TIPI_INTERVENTO
        .filter((d) => !existingIntNomi.has(d.nome))
        .map((d) => ({ ...d, company_id: companyId, attivo: true }));

      let insertedInterventi: TipoIntervento[] = [];
      if (interventiToInsert.length > 0) {
        const { data, error } = await (supabase.from("tipi_intervento") as any)
          .insert(interventiToInsert).select("id, nome");
        if (error) throw error;
        insertedInterventi = data ?? [];
      }

      // Build lookup maps (existing + newly inserted)
      const allImpianti = [
        ...tipiImpianto,
        ...insertedImpianti,
      ];
      const allInterventi = [
        ...tipiIntervento,
        ...insertedInterventi,
      ];

      const impByNome = new Map(allImpianti.map((t) => [t.nome, t.id]));
      const intByNome = new Map(allInterventi.map((t) => [t.nome, t.id]));

      // 3. Insert listino_prezzi (skip existing combinations)
      const existingKeys = new Set(
        listino.map((l) => `${l.tipo_impianto_id}::${l.tipo_intervento_id}`)
      );

      const listinoToInsert = DEFAULT_TARIFFE
        .map((d) => {
          const impId = impByNome.get(d.impianto);
          const intId = intByNome.get(d.intervento);
          if (!impId || !intId) return null;
          const key = `${impId}::${intId}`;
          if (existingKeys.has(key)) return null;
          return {
            company_id: companyId,
            tipo_impianto_id: impId,
            tipo_intervento_id: intId,
            prezzo: d.prezzo,
            iva_pct: d.iva_pct,
            unita: d.unita,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (listinoToInsert.length > 0) {
        const { error } = await (supabase.from("listino_prezzi") as any).insert(listinoToInsert);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] });
      queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] });
      queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] });

      const totale = impiantiToInsert.length + interventiToInsert.length + listinoToInsert.length;
      if (totale === 0) {
        toast.info("Tutti i dati demo sono già presenti");
      } else {
        toast.success(
          `Dati demo creati: ${impiantiToInsert.length} impianti, ${interventiToInsert.length} interventi, ${listinoToInsert.length} tariffe`
        );
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingDemo(false);
      setConfirmDemo(false);
    }
  };

  // ─── Computed ─────────────────────────────────────────────────────────────

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] });
    queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] });
    queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] });
  };

  if (!companyId) return null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Listino Prezzi Manutenzione</h1>
          <p className="text-muted-foreground text-sm">
            Configura tipi di impianto, tipi di intervento e le relative tariffe
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleCreaDemoClick}
          disabled={creatingDemo}
          className="shrink-0"
        >
          <Zap className="h-4 w-4 mr-2" />
          {creatingDemo ? "Creazione in corso..." : "Crea tariffe demo"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="impianti">
            Tipi Impianto
            {tipiImpianto.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{tipiImpianto.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="interventi">
            Tipi Intervento
            {tipiIntervento.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{tipiIntervento.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tariffe">
            Tariffe
            {listino.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{listino.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Tipi Impianto ── */}
        <TabsContent value="impianti" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={() => { setEditingImpianto(null); setImpiantoDialogOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-1" />Nuovo impianto
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Icona</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-20">Ordine</TableHead>
                  <TableHead className="w-20">Attivo</TableHead>
                  <TableHead className="text-right w-24">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingImpianti ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : tipiImpianto.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nessun tipo impianto. Aggiungine uno o clicca "Crea tariffe demo".
                    </TableCell>
                  </TableRow>
                ) : tipiImpianto.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xl">{t.icona ?? "🔧"}</TableCell>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{t.ordine ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.attivo ? "default" : "secondary"}>
                        {t.attivo ? "Attivo" : "Disattivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { setEditingImpianto(t); setImpiantoDialogOpen(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-destructive"
                          onClick={() => setDeleteImpiantoId(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab 2: Tipi Intervento ── */}
        <TabsContent value="interventi" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={() => { setEditingIntervento(null); setInterventoDialogOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-1" />Nuovo intervento
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-36">Categoria</TableHead>
                  <TableHead className="w-36">Durata stimata</TableHead>
                  <TableHead className="w-20">Attivo</TableHead>
                  <TableHead className="text-right w-24">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInterventi ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : tipiIntervento.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nessun tipo intervento. Aggiungine uno o clicca "Crea tariffe demo".
                    </TableCell>
                  </TableRow>
                ) : tipiIntervento.map((t) => {
                  const cat = categoriaBadge(t.categoria);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.nome}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cat.color}`}>
                          {cat.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.durata_stimata_h != null ? `${t.durata_stimata_h}h` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.attivo ? "default" : "secondary"}>
                          {t.attivo ? "Attivo" : "Disattivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => { setEditingIntervento(t); setInterventoDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive"
                            onClick={() => setDeleteInterventoId(t.id)}
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
        </TabsContent>

        {/* ── Tab 3: Tariffe ── */}
        <TabsContent value="tariffe" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={() => { setEditingListino(null); setListinoDialogOpen(true); }}
              disabled={tipiImpianto.length === 0 || tipiIntervento.length === 0}
            >
              <Plus className="h-4 w-4 mr-1" />Nuova tariffa
            </Button>
          </div>
          {tipiImpianto.length === 0 || tipiIntervento.length === 0 ? (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
              Aggiungi prima almeno un tipo impianto e un tipo intervento, oppure clicca "Crea tariffe demo".
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Impianto</TableHead>
                    <TableHead>Intervento</TableHead>
                    <TableHead className="w-28">Prezzo</TableHead>
                    <TableHead className="w-16">IVA</TableHead>
                    <TableHead className="w-28">Unità</TableHead>
                    <TableHead className="text-right w-24">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingListino ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Caricamento...
                      </TableCell>
                    </TableRow>
                  ) : listino.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nessuna tariffa configurata. Aggiungine una o clicca "Crea tariffe demo".
                      </TableCell>
                    </TableRow>
                  ) : listino.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {l.tipo_impianto
                          ? `${l.tipo_impianto.icona ?? ""} ${l.tipo_impianto.nome}`.trim()
                          : <span className="text-muted-foreground italic">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        {l.tipo_intervento?.nome ?? <span className="text-muted-foreground italic">—</span>}
                      </TableCell>
                      <TableCell>
                        {l.prezzo != null && l.prezzo > 0
                          ? formatCurrency(l.prezzo)
                          : <Badge className="bg-amber-100 text-amber-700 border-amber-200">€0</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.iva_pct}%</TableCell>
                      <TableCell className="text-muted-foreground">{l.unita}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => { setEditingListino(l); setListinoDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive"
                            onClick={() => setDeleteListinoId(l.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}

      {impiantoDialogOpen && (
        <ImpiantoDialog
          key={editingImpianto?.id ?? "new-impianto"}
          open={impiantoDialogOpen}
          onClose={() => setImpiantoDialogOpen(false)}
          editing={editingImpianto}
          companyId={companyId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] })}
        />
      )}

      {interventoDialogOpen && (
        <InterventoDialog
          key={editingIntervento?.id ?? "new-intervento"}
          open={interventoDialogOpen}
          onClose={() => setInterventoDialogOpen(false)}
          editing={editingIntervento}
          companyId={companyId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] })}
        />
      )}

      {listinoDialogOpen && (
        <ListinoDialog
          key={editingListino?.id ?? "new-listino"}
          open={listinoDialogOpen}
          onClose={() => setListinoDialogOpen(false)}
          editing={editingListino}
          companyId={companyId}
          tipiImpianto={tipiImpianto}
          tipiIntervento={tipiIntervento}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] })}
        />
      )}

      {/* ── Delete Confirmations ── */}

      <AlertDialog open={!!deleteImpiantoId} onOpenChange={(v) => !v && setDeleteImpiantoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina tipo impianto</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Il tipo impianto e le tariffe associate potrebbero essere compromesse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteImpiantoId && deleteImpiantoMutation.mutate(deleteImpiantoId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteInterventoId} onOpenChange={(v) => !v && setDeleteInterventoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina tipo intervento</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Il tipo intervento e le tariffe associate potrebbero essere compromesse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteInterventoId && deleteInterventoMutation.mutate(deleteInterventoId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteListinoId} onOpenChange={(v) => !v && setDeleteListinoId(null)}>
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
              onClick={() => deleteListinoId && deleteListinoMutation.mutate(deleteListinoId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Demo confirm ── */}
      <AlertDialog open={confirmDemo} onOpenChange={setConfirmDemo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Crea tariffe demo</AlertDialogTitle>
            <AlertDialogDescription>
              Esistono già dei dati. Verranno aggiunti solo gli elementi mancanti (nessun duplicato verrà creato).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={creaDemoData} disabled={creatingDemo}>
              {creatingDemo ? "Creazione..." : "Aggiungi dati demo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
