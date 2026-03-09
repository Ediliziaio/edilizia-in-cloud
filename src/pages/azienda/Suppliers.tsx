import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, isPast, isToday, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Truck, Search, Loader2, Star, ArrowLeft, Phone, Mail, Globe,
  MapPin, CreditCard, Package, CalendarClock, BookOpen, BarChart3,
  AlertTriangle, CheckCircle2, Pencil, Save, X, ExternalLink,
  TrendingUp, TrendingDown, FileText, Plus,
} from "lucide-react";
import { useOperationalSuppliers, useSupplierDetail } from "@/hooks/useOperationalSuppliers";
import type { SupplierWithStats } from "@/hooks/useOperationalSuppliers";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground">N/A</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

// ========== LIST VIEW ==========
function SuppliersList({ onSelectSupplier }: { onSelectSupplier?: (id: string) => void }) {
  const navigate = useNavigate();
  const { suppliers, isLoading } = useOperationalSuppliers();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    let list = suppliers;
    if (!showInactive) list = list.filter((s) => s.is_active);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.product_category?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [suppliers, search, showInactive]);

  const totalDebt = filtered.reduce((s, f) => s + (f.scadenze_importo || 0), 0);
  const overdueCount = filtered.filter(f => (f.scadenze_importo || 0) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Fornitori</h1>
          <Badge variant="secondary" className="ml-2">{filtered.length}</Badge>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-3 pb-2">
          <p className="text-xs text-muted-foreground">Fornitori attivi</p>
          <p className="text-xl font-bold">{suppliers.filter(s => s.is_active).length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2">
          <p className="text-xs text-muted-foreground">Totale OdA</p>
          <p className="text-xl font-bold">{fmtEur(suppliers.reduce((s, f) => s + (f.oda_total || 0), 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2">
          <p className="text-xs text-muted-foreground">Debito residuo</p>
          <p className={`text-xl font-bold ${totalDebt > 0 ? "text-destructive" : ""}`}>{fmtEur(totalDebt)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2">
          <p className="text-xs text-muted-foreground">Con scadenze aperte</p>
          <p className="text-xl font-bold">{overdueCount}</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca fornitore..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Button
          variant={showInactive ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowInactive(!showInactive)}
        >
          {showInactive ? "Mostra tutti" : "Includi inattivi"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nessun fornitore trovato.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Card
              key={s.id}
              className={`cursor-pointer hover:shadow-md transition-shadow ${!s.is_active ? "opacity-60" : ""}`}
              onClick={() => onSelectSupplier ? onSelectSupplier(s.id) : navigate(`/azienda/fornitori/${s.id}`)}
            >
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    {s.product_category && (
                      <Badge variant="outline" className="text-xs mt-0.5">{s.product_category}</Badge>
                    )}
                  </div>
                  <RatingStars rating={s.rating} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">OdA</p>
                    <p className="font-medium">{s.oda_count || 0} · {fmtEur(s.oda_total || 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Da pagare</p>
                    <p className={`font-medium ${(s.scadenze_importo || 0) > 0 ? "text-destructive" : ""}`}>
                      {fmtEur(s.scadenze_importo || 0)}
                    </p>
                  </div>
                </div>

                {!s.is_active && <Badge variant="secondary" className="text-xs">Inattivo</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== DETAIL VIEW ==========
function SupplierDetail({ supplierId, onBack }: { supplierId: string; onBack?: () => void }) {
  const navigate = useNavigate();
  const { suppliers, isLoading: isSupLoading, update } = useOperationalSuppliers();
  const supplier = suppliers.find((s) => s.id === supplierId);
  const { oda, isOdaLoading, scadenze, isScadenzeLoading, primaNota, isPrimaNotaLoading } = useSupplierDetail(supplierId);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  if (isSupLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!supplier) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Fornitore non trovato</p>
        <Button variant="outline" onClick={() => navigate("/azienda/fornitori")}>Torna alla lista</Button>
      </div>
    );
  }

  const startEdit = () => {
    setEditForm({
      email: supplier.email || "",
      phone: supplier.phone || "",
      website: supplier.website || "",
      address: supplier.address || "",
      city: supplier.city || "",
      province: supplier.province || "",
      postal_code: supplier.postal_code || "",
      payment_method: supplier.payment_method || "",
      lead_time_days: supplier.lead_time_days || 0,
      min_order_amount: supplier.min_order_amount || 0,
      credit_limit: supplier.credit_limit || 0,
      notes: supplier.notes || "",
      iban: supplier.iban || "",
      bank_name: supplier.bank_name || "",
    });
    setEditing(true);
  };

  const saveEdit = () => {
    const updates: Record<string, any> = {};
    Object.entries(editForm).forEach(([k, v]) => {
      if (v !== (supplier as any)[k]) {
        updates[k] = v === "" ? null : v;
      }
    });
    if (Object.keys(updates).length > 0) {
      update.mutate({ id: supplier.id, updates }, {
        onSuccess: () => setEditing(false),
      });
    } else {
      setEditing(false);
    }
  };

  // Stats computation
  const totalOda = oda.reduce((s, o: any) => s + Number(o.total || 0), 0);
  const totalPagato = primaNota.filter((e: any) => e.direction === "uscita").reduce((s: number, e: any) => s + Number(e.amount), 0);
  const scaduteCount = scadenze.filter((s: any) => isPast(new Date(s.due_date)) && s.status !== "pagata").length;
  const openScadenze = scadenze.filter((s: any) => s.status !== "pagata" && s.status !== "annullata");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/fornitori")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Fornitori
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{supplier.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {supplier.product_category && <Badge variant="outline">{supplier.product_category}</Badge>}
            <RatingStars rating={supplier.rating} />
            {!supplier.is_active && <Badge variant="secondary">Inattivo</Badge>}
            {supplier.is_foreign && <Badge variant="outline">Estero</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Modifica
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                <X className="h-4 w-4 mr-1" /> Annulla
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={update.isPending}>
                <Save className="h-4 w-4 mr-1" /> Salva
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-3 pb-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" /> Totale OdA</p>
          <p className="text-xl font-bold">{fmtEur(totalOda)}</p>
          <p className="text-xs text-muted-foreground">{oda.length} ordini</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Totale pagato</p>
          <p className="text-xl font-bold">{fmtEur(totalPagato)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Scadenze aperte</p>
          <p className="text-xl font-bold">{openScadenze.length}</p>
          <p className="text-xs text-muted-foreground">{fmtEur(supplier.scadenze_importo || 0)} residuo</p>
        </CardContent></Card>
        <Card className={scaduteCount > 0 ? "border-destructive" : ""}>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Scadute</p>
            <p className={`text-xl font-bold ${scaduteCount > 0 ? "text-destructive" : ""}`}>{scaduteCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="anagrafica">
        <TabsList>
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="oda">OdA ({oda.length})</TabsTrigger>
          <TabsTrigger value="scadenze">Scadenze ({scadenze.length})</TabsTrigger>
          <TabsTrigger value="prima-nota">Prima Nota ({primaNota.length})</TabsTrigger>
          <TabsTrigger value="stats">Statistiche</TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafica" className="mt-4">
          <AnagraficaTab supplier={supplier} editing={editing} editForm={editForm} setEditForm={setEditForm} />
        </TabsContent>

        <TabsContent value="oda" className="mt-4">
          <OdaTab oda={oda} isLoading={isOdaLoading} navigate={navigate} />
        </TabsContent>

        <TabsContent value="scadenze" className="mt-4">
          <ScadenzeTab scadenze={scadenze} isLoading={isScadenzeLoading} navigate={navigate} />
        </TabsContent>

        <TabsContent value="prima-nota" className="mt-4">
          <PrimaNotaTab entries={primaNota} isLoading={isPrimaNotaLoading} navigate={navigate} />
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <StatsTab supplier={supplier} oda={oda} scadenze={scadenze} primaNota={primaNota} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ========== ANAGRAFICA TAB (with inline editing) ==========
function AnagraficaTab({ supplier: s, editing, editForm, setEditForm }: {
  supplier: SupplierWithStats;
  editing: boolean;
  editForm: Record<string, any>;
  setEditForm: (fn: any) => void;
}) {
  const upd = (field: string, value: any) => setEditForm((prev: any) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Contatti</p>
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={editForm.email} onChange={(e) => upd("email", e.target.value)} placeholder="email@esempio.it" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefono</Label>
                <Input value={editForm.phone} onChange={(e) => upd("phone", e.target.value)} placeholder="+39..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sito web</Label>
                <Input value={editForm.website} onChange={(e) => upd("website", e.target.value)} placeholder="https://..." />
              </div>
            </div>
          ) : (
            <>
              {s.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{s.email}</div>}
              {s.phone && <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{s.phone}</div>}
              {s.website && <div className="flex items-center gap-2 text-sm"><Globe className="h-4 w-4 text-muted-foreground" /><a href={s.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{s.website}</a></div>}
              {!s.email && !s.phone && !s.website && <p className="text-sm text-muted-foreground italic">Nessun contatto</p>}
            </>
          )}
          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Indirizzo</p>
          {editing ? (
            <div className="space-y-3">
              <Input value={editForm.address} onChange={(e) => upd("address", e.target.value)} placeholder="Via..." />
              <div className="grid grid-cols-3 gap-2">
                <Input value={editForm.postal_code} onChange={(e) => upd("postal_code", e.target.value)} placeholder="CAP" />
                <Input value={editForm.city} onChange={(e) => upd("city", e.target.value)} placeholder="Città" />
                <Input value={editForm.province} onChange={(e) => upd("province", e.target.value)} placeholder="Prov." />
              </div>
            </div>
          ) : (
            <>
              {(s.address || s.city) ? (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    {s.address && <p>{s.address}</p>}
                    <p>{[s.postal_code, s.city, s.province].filter(Boolean).join(" ")}{s.country && ` — ${s.country}`}</p>
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground italic">Nessun indirizzo</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Dati fiscali & pagamento</p>
          {s.vat_number && <p className="text-sm">P.IVA: <span className="font-mono">{s.vat_number}</span></p>}
          {s.fiscal_code && <p className="text-sm">CF: <span className="font-mono">{s.fiscal_code}</span></p>}
          <Separator />
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">IBAN</Label>
                <Input value={editForm.iban} onChange={(e) => upd("iban", e.target.value)} placeholder="IT..." className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Banca</Label>
                <Input value={editForm.bank_name} onChange={(e) => upd("bank_name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Metodo di pagamento</Label>
                <Select value={editForm.payment_method} onValueChange={(v) => upd("payment_method", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonifico">Bonifico</SelectItem>
                    <SelectItem value="ri.ba">Ri.Ba</SelectItem>
                    <SelectItem value="assegno">Assegno</SelectItem>
                    <SelectItem value="contanti">Contanti</SelectItem>
                    <SelectItem value="carta">Carta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Lead time (gg)</Label>
                  <Input type="number" value={editForm.lead_time_days} onChange={(e) => upd("lead_time_days", Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ordine min.</Label>
                  <Input type="number" value={editForm.min_order_amount} onChange={(e) => upd("min_order_amount", Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fido</Label>
                  <Input type="number" value={editForm.credit_limit} onChange={(e) => upd("credit_limit", Number(e.target.value))} />
                </div>
              </div>
            </div>
          ) : (
            <>
              {s.iban && <p className="text-sm">IBAN: <span className="font-mono text-xs">{s.iban}</span></p>}
              {s.bank_name && <p className="text-sm">Banca: {s.bank_name}</p>}
              {s.payment_method && <p className="text-sm">Metodo: {s.payment_method}</p>}
              <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                <div>
                  <p className="text-muted-foreground text-xs">Lead time</p>
                  <p className="font-medium">{s.lead_time_days || 0} giorni</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">IVA default</p>
                  <p className="font-medium">{s.vat_rate ?? 22}%</p>
                </div>
                {s.min_order_amount > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs">Ordine minimo</p>
                    <p className="font-medium">{fmtEur(s.min_order_amount)}</p>
                  </div>
                )}
                {s.credit_limit && (
                  <div>
                    <p className="text-muted-foreground text-xs">Fido</p>
                    <p className="font-medium">{fmtEur(s.credit_limit)}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-muted-foreground mb-1">Note</p>
          {editing ? (
            <Textarea value={editForm.notes} onChange={(e) => upd("notes", e.target.value)} rows={3} placeholder="Note interne..." />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{s.notes || <span className="text-muted-foreground italic">Nessuna nota</span>}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ========== ODA TAB ==========
function OdaTab({ oda, isLoading, navigate }: { oda: any[]; isLoading: boolean; navigate: any }) {
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mt-8" />;
  if (oda.length === 0) return <p className="text-center py-8 text-muted-foreground">Nessun ordine d'acquisto.</p>;

  const STATUS_COLORS: Record<string, string> = {
    bozza: "bg-muted text-muted-foreground",
    inviato: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    confermato: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    parziale: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    ricevuto: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    annullato: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/50">
          <th className="text-left p-3 font-medium">N° OdA</th>
          <th className="text-left p-3 font-medium">Data</th>
          <th className="text-left p-3 font-medium">Stato</th>
          <th className="text-right p-3 font-medium">Totale</th>
          <th className="text-left p-3 font-medium">Consegna prevista</th>
          <th className="text-left p-3 font-medium w-10"></th>
        </tr></thead>
        <tbody>
          {oda.map((o: any) => (
            <tr key={o.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}>
              <td className="p-3 font-mono text-xs">{o.oda_number}</td>
              <td className="p-3">{format(new Date(o.issue_date), "dd/MM/yyyy", { locale: it })}</td>
              <td className="p-3"><Badge className={`text-xs ${STATUS_COLORS[o.status] || ""}`}>{o.status}</Badge></td>
              <td className="p-3 text-right font-medium">{fmtEur(Number(o.total))}</td>
              <td className="p-3 text-sm text-muted-foreground">
                {o.expected_delivery_date ? format(new Date(o.expected_delivery_date), "dd/MM/yyyy", { locale: it }) : "—"}
              </td>
              <td className="p-3"><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ========== SCADENZE TAB ==========
function ScadenzeTab({ scadenze, isLoading, navigate }: { scadenze: any[]; isLoading: boolean; navigate: any }) {
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mt-8" />;
  if (scadenze.length === 0) return <p className="text-center py-8 text-muted-foreground">Nessuna scadenza.</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => navigate("/azienda/scadenzario")}>
          <CalendarClock className="h-4 w-4 mr-1" /> Vai a Scadenzario
        </Button>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Scadenza</th>
            <th className="text-left p-3 font-medium">Descrizione</th>
            <th className="text-right p-3 font-medium">Importo</th>
            <th className="text-right p-3 font-medium">Residuo</th>
            <th className="text-left p-3 font-medium">Stato</th>
          </tr></thead>
          <tbody>
            {scadenze.map((s: any) => {
              const remaining = Number(s.amount) - Number(s.paid_amount);
              const isOverdue = isPast(new Date(s.due_date)) && !isToday(new Date(s.due_date)) && s.status !== "pagata";
              return (
                <tr key={s.id} className={`border-b ${isOverdue ? "bg-destructive/5" : ""}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                      {s.status === "pagata" && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                      {format(new Date(s.due_date), "dd/MM/yyyy", { locale: it })}
                    </div>
                  </td>
                  <td className="p-3 truncate max-w-[200px]">{s.description}</td>
                  <td className="p-3 text-right">{fmtEur(Number(s.amount))}</td>
                  <td className="p-3 text-right font-medium">
                    {s.status === "pagata" ? <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Saldato</Badge> : fmtEur(remaining)}
                  </td>
                  <td className="p-3">
                    <Badge variant={isOverdue ? "destructive" : s.status === "pagata" ? "default" : "outline"} className="text-xs">
                      {s.status === "pagata" ? "Pagata" : isOverdue ? "Scaduta" : s.status === "parziale" ? "Parziale" : "Aperta"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========== PRIMA NOTA TAB ==========
function PrimaNotaTab({ entries, isLoading, navigate }: { entries: any[]; isLoading: boolean; navigate: any }) {
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mt-8" />;
  if (entries.length === 0) return <p className="text-center py-8 text-muted-foreground">Nessun movimento.</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => navigate("/azienda/prima-nota")}>
          <BookOpen className="h-4 w-4 mr-1" /> Vai a Prima Nota
        </Button>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Data</th>
            <th className="text-left p-3 font-medium">Descrizione</th>
            <th className="text-left p-3 font-medium">Conto</th>
            <th className="text-right p-3 font-medium">Importo</th>
            <th className="text-left p-3 font-medium">Metodo</th>
          </tr></thead>
          <tbody>
            {entries.map((e: any) => (
              <tr key={e.id} className="border-b">
                <td className="p-3">{format(new Date(e.entry_date), "dd/MM/yyyy", { locale: it })}</td>
                <td className="p-3 truncate max-w-[250px]">{e.description}</td>
                <td className="p-3 text-xs text-muted-foreground capitalize">{e.account_label || "—"}</td>
                <td className="p-3 text-right font-mono">
                  <span className={e.direction === "entrata" ? "text-green-700 dark:text-green-400" : "text-destructive"}>
                    {e.direction === "uscita" ? "-" : "+"}{fmtEur(Number(e.amount))}
                  </span>
                </td>
                <td className="p-3 text-xs text-muted-foreground capitalize">{e.payment_method || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========== STATS TAB (with chart) ==========
function StatsTab({ supplier, oda, scadenze, primaNota }: { supplier: SupplierWithStats; oda: any[]; scadenze: any[]; primaNota: any[] }) {
  const totalOda = oda.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPagato = primaNota.filter((e: any) => e.direction === "uscita").reduce((s: number, e: any) => s + Number(e.amount), 0);
  const scaduteCount = scadenze.filter((s: any) => isPast(new Date(s.due_date)) && s.status !== "pagata").length;

  // Monthly spending chart (last 6 months)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { month: string; totale: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM yy", { locale: it });
      const tot = primaNota
        .filter((e: any) => e.direction === "uscita" && e.entry_date?.startsWith(key))
        .reduce((s: number, e: any) => s + Number(e.amount), 0);
      months.push({ month: label, totale: tot });
    }
    return months;
  }, [primaNota]);

  const hasChartData = monthlyData.some(m => m.totale > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Totale OdA</p>
          <p className="text-xl font-bold">{fmtEur(totalOda)}</p>
          <p className="text-xs text-muted-foreground">{oda.length} ordini</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Totale pagato</p>
          <p className="text-xl font-bold">{fmtEur(totalPagato)}</p>
          <p className="text-xs text-muted-foreground">{primaNota.filter((e: any) => e.direction === "uscita").length} movimenti</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Scadenze aperte</p>
          <p className="text-xl font-bold">{scadenze.filter((s: any) => s.status !== "pagata" && s.status !== "annullata").length}</p>
          <p className="text-xs text-muted-foreground">{fmtEur(supplier.scadenze_importo || 0)} residuo</p>
        </CardContent></Card>
        <Card className={scaduteCount > 0 ? "border-destructive" : ""}><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Scadute</p>
          <p className={`text-xl font-bold ${scaduteCount > 0 ? "text-destructive" : ""}`}>{scaduteCount}</p>
        </CardContent></Card>
      </div>

      {/* Monthly spending chart */}
      {hasChartData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" /> Spesa mensile (ultimi 6 mesi)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
                  <Tooltip
                    formatter={(value: number) => [fmtEur(value), "Spesa"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="totale" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ========== MAIN EXPORT ==========
export default function Suppliers() {
  const { id } = useParams();
  if (id) return <SupplierDetail supplierId={id} />;
  return <SuppliersList />;
}
