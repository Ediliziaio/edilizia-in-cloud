import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Plus, FileText, AlertTriangle, CheckCircle, Download, Loader2, HardHat, Users, ClipboardList, Building2, CalendarClock, Trash2 } from "lucide-react";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  approvato: "bg-green-100 text-green-800",
  archiviato: "bg-slate-100 text-slate-600",
  firmato: "bg-blue-100 text-blue-800",
};

const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  approvato: "Approvato",
  archiviato: "Archiviato",
  firmato: "Firmato",
};

export default function SicurezzaCantiere() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [posDialogOpen, setPosDialogOpen] = useState(false);
  const [duvriDialogOpen, setDuvriDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [indirizzoCantiere, setIndirizzoCantiere] = useState("");
  const [responsabileSicurezza, setResponsabileSicurezza] = useState("");
  const [costiSicurezza, setCostiSicurezza] = useState("0");
  const [expandedPos, setExpandedPos] = useState<string | null>(null);
  const [expandedDuvri, setExpandedDuvri] = useState<string | null>(null);

  // M3 — verbali, subappaltatori, scadenzario
  const [verbaleDialogOpen, setVerbaleDialogOpen] = useState(false);
  const [verbaleForm, setVerbaleForm] = useState({ order_id: "", data: format(new Date(), "yyyy-MM-dd"), tipo: "sopralluogo", esito: "conforme", note: "", redatto_da: "" });
  const [subappaltatoreDialogOpen, setSubappaltatoreDialogOpen] = useState(false);
  const [subappaltatoreForm, setSubappaltatoreForm] = useState({ order_id: "", ragione_sociale: "", tipo_lavori: "", responsabile: "", telefono: "", data_inizio: "", data_fine: "", durc_scadenza: "" });
  const [adempimentoDialogOpen, setAdempimentoDialogOpen] = useState(false);
  const [adempimentoForm, setAdempimentoForm] = useState({ order_id: "", titolo: "", tipo: "corso_formazione", scadenza_data: "", note: "" });

  // Fetch orders for selector
  const { data: orders = [] } = useQuery({
    queryKey: ["orders-for-sicurezza", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, description, code")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch POS documents
  const { data: posDocs = [], isLoading: posLoading } = useQuery({
    queryKey: ["pos-documents", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pos_documents")
        .select("*, orders(description, code)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch DUVRI documents
  const { data: duvriDocs = [], isLoading: duvriLoading } = useQuery({
    queryKey: ["duvri-documents", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("duvri_documents")
        .select("*, orders(description, code)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!companyId,
  });

  // M3 queries
  const { data: verbali = [], isLoading: verbaliLoading } = useQuery({
    queryKey: ["verbali-sicurezza", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("verbali_sicurezza").select("*, orders(description, order_code)").eq("company_id", companyId!).order("data", { ascending: false });
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: subappaltatori = [], isLoading: subappaltatoriLoading } = useQuery({
    queryKey: ["subappaltatori-sicurezza", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("subappaltatori_sicurezza").select("*, orders(description, order_code)").eq("company_id", companyId!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: adempimenti = [], isLoading: adempimentiLoading } = useQuery({
    queryKey: ["adempimenti-sicurezza", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("adempimenti_sicurezza").select("*, orders(description, order_code)").eq("company_id", companyId!).order("scadenza_data", { ascending: true });
      return data || [];
    },
    enabled: !!companyId,
  });

  // M3 mutations
  const createVerbaleMutation = useMutation({
    mutationFn: async () => {
      if (!verbaleForm.note.trim() && !verbaleForm.redatto_da.trim()) throw new Error("Inserisci almeno le note o il nome del redattore");
      const { error } = await supabase.from("verbali_sicurezza").insert({ company_id: companyId, order_id: verbaleForm.order_id || null, data: verbaleForm.data, tipo: verbaleForm.tipo, esito: verbaleForm.esito, note: verbaleForm.note.trim() || null, redatto_da: verbaleForm.redatto_da.trim() || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Verbale salvato"); queryClient.invalidateQueries({ queryKey: ["verbali-sicurezza", companyId] }); setVerbaleDialogOpen(false); setVerbaleForm({ order_id: "", data: format(new Date(), "yyyy-MM-dd"), tipo: "sopralluogo", esito: "conforme", note: "", redatto_da: "" }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const createSubappaltatoreM = useMutation({
    mutationFn: async () => {
      if (!subappaltatoreForm.ragione_sociale.trim()) throw new Error("Ragione sociale obbligatoria");
      const { error } = await supabase.from("subappaltatori_sicurezza").insert({ company_id: companyId, order_id: subappaltatoreForm.order_id || null, ragione_sociale: subappaltatoreForm.ragione_sociale.trim(), tipo_lavori: subappaltatoreForm.tipo_lavori || null, responsabile: subappaltatoreForm.responsabile || null, telefono: subappaltatoreForm.telefono || null, data_inizio: subappaltatoreForm.data_inizio || null, data_fine: subappaltatoreForm.data_fine || null, durc_scadenza: subappaltatoreForm.durc_scadenza || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Subappaltatore aggiunto"); queryClient.invalidateQueries({ queryKey: ["subappaltatori-sicurezza", companyId] }); setSubappaltatoreDialogOpen(false); setSubappaltatoreForm({ order_id: "", ragione_sociale: "", tipo_lavori: "", responsabile: "", telefono: "", data_inizio: "", data_fine: "", durc_scadenza: "" }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const createAdempimentoM = useMutation({
    mutationFn: async () => {
      if (!adempimentoForm.titolo.trim()) throw new Error("Titolo obbligatorio");
      const { error } = await supabase.from("adempimenti_sicurezza").insert({ company_id: companyId, order_id: adempimentoForm.order_id || null, titolo: adempimentoForm.titolo.trim(), tipo: adempimentoForm.tipo, scadenza_data: adempimentoForm.scadenza_data || null, stato: "da_fare", note: adempimentoForm.note || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Adempimento aggiunto"); queryClient.invalidateQueries({ queryKey: ["adempimenti-sicurezza", companyId] }); setAdempimentoDialogOpen(false); setAdempimentoForm({ order_id: "", titolo: "", tipo: "corso_formazione", scadenza_data: "", note: "" }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleAdempimentoStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await supabase.from("adempimenti_sicurezza").update({ stato }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adempimenti-sicurezza", companyId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  // Check subappaltatori per ordine selezionato
  const { data: hasSubappaltatori } = useQuery({
    queryKey: ["has-subappaltatori", selectedOrderId],
    queryFn: async () => {
      const { count } = await supabase
        .from("purchase_orders")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("order_id", selectedOrderId);
      return (count || 0) > 0;
    },
    enabled: !!companyId && !!selectedOrderId,
  });

  // Generate POS
  const generatePos = useMutation({
    mutationFn: async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/genera-pos`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: selectedOrderId,
            company_id: companyId,
            responsabile_sicurezza: responsabileSicurezza || undefined,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Errore generazione POS");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("POS generato con successo!");
      queryClient.invalidateQueries({ queryKey: ["pos-documents", companyId] });
      setPosDialogOpen(false);
      setSelectedOrderId("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Generate DUVRI
  const generateDuvri = useMutation({
    mutationFn: async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/genera-duvri`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: selectedOrderId,
            company_id: companyId,
            costi_sicurezza: parseFloat(costiSicurezza) || 0,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Errore generazione DUVRI");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("DUVRI generato con successo!");
      queryClient.invalidateQueries({ queryKey: ["duvri-documents", companyId] });
      setDuvriDialogOpen(false);
      setSelectedOrderId("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Update POS status
  const updatePosStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("pos_documents")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stato aggiornato");
      queryClient.invalidateQueries({ queryKey: ["pos-documents", companyId] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="h-6 w-6 sm:h-7 sm:w-7 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">Sicurezza Cantiere</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">D.Lgs 81/08 — Documenti obbligatori</p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-700">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-400">
          POS e DUVRI sono documenti obbligatori ai sensi del D.Lgs 81/08. Generati automaticamente dall'AI sulla base dei dati dell'ordine.
        </p>
      </div>

      {/* Tabs POS / DUVRI */}
      <Tabs defaultValue="pos">
        <TabsList className="flex flex-nowrap overflow-x-auto scrollbar-none">
          <TabsTrigger value="pos" className="shrink-0 gap-1.5">
            <HardHat className="h-4 w-4" /> POS
          </TabsTrigger>
          <TabsTrigger value="duvri" className="shrink-0 gap-1.5">
            <Users className="h-4 w-4" /> DUVRI
          </TabsTrigger>
          <TabsTrigger value="verbali" className="shrink-0 gap-1.5">
            <ClipboardList className="h-4 w-4" /> Verbali
          </TabsTrigger>
          <TabsTrigger value="subappaltatori" className="shrink-0 gap-1.5">
            <Building2 className="h-4 w-4" /> Subappal.
          </TabsTrigger>
          <TabsTrigger value="scadenzario" className="shrink-0 gap-1.5">
            <CalendarClock className="h-4 w-4" /> Scadenze
          </TabsTrigger>
        </TabsList>

        {/* ───── POS TAB ───── */}
        <TabsContent value="pos" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Piano Operativo di Sicurezza</p>
            <Button size="sm" onClick={() => setPosDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Genera POS
            </Button>
          </div>

          {posLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : posDocs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
                <div>
                  <p className="font-medium">Nessun POS generato</p>
                  <p className="text-sm text-muted-foreground">Seleziona un ordine e genera il tuo primo POS con AI</p>
                </div>
                <Button size="sm" onClick={() => setPosDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Genera POS
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {posDocs.map((doc: any) => (
                <Card key={doc.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-medium truncate">
                          {(doc.orders as any)?.description || "Ordine"}
                          {(doc.orders as any)?.code && <span className="ml-2 text-xs text-muted-foreground font-mono">#{(doc.orders as any).code}</span>}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          v{doc.version} · {format(new Date(doc.created_at), "dd/MM/yyyy", { locale: it })}
                          {doc.responsabile_sicurezza && ` · ${doc.responsabile_sicurezza}`}
                        </CardDescription>
                      </div>
                      <Badge className={`${STATUS_COLORS[doc.status]} text-xs shrink-0`}>
                        {STATUS_LABELS[doc.status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>🏗️ {doc.tipo_lavori}</span>
                      <span>·</span>
                      <span>👷 {doc.numero_lavoratori} lavoratori</span>
                      {doc.rischi_presenti?.length > 0 && (
                        <><span>·</span><span>⚠️ {doc.rischi_presenti.length} rischi</span></>
                      )}
                    </div>

                    {expandedPos === doc.id && (
                      <div className="space-y-3 pt-2 border-t">
                        {doc.rischi_presenti?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Rischi e misure preventive</p>
                            <div className="space-y-1">
                              {doc.rischi_presenti.map((r: any, i: number) => (
                                <div key={i} className="text-xs p-2 rounded bg-muted/50">
                                  <span className="font-medium text-destructive">⚠️ {r.rischio}</span>
                                  <span className="text-muted-foreground"> → {r.misura_prevenzione}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {doc.dpi_richiesti?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold mb-1">DPI richiesti</p>
                            <div className="flex flex-wrap gap-1">
                              {doc.dpi_richiesti.map((dpi: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs">{dpi}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {doc.procedure_operative && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Procedure operative</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{doc.procedure_operative}</p>
                          </div>
                        )}
                        <EntityCustomFieldsSection entityType="pos_document" entityId={doc.id} />
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setExpandedPos(expandedPos === doc.id ? null : doc.id)}
                      >
                        {expandedPos === doc.id ? "Nascondi dettagli" : "Vedi dettagli"}
                      </Button>
                      {doc.status === "bozza" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => updatePosStatus.mutate({ id: doc.id, status: "approvato" })}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" /> Approva
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toast.info("Esportazione PDF in arrivo!")}
                      >
                        <Download className="h-3 w-3 mr-1" /> PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───── DUVRI TAB ───── */}
        <TabsContent value="duvri" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Documento Unico Valutazione Rischi Interferenza</p>
            <Button size="sm" onClick={() => setDuvriDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Genera DUVRI
            </Button>
          </div>

          {duvriLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : duvriDocs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <Users className="h-12 w-12 text-muted-foreground/40" />
                <div>
                  <p className="font-medium">Nessun DUVRI generato</p>
                  <p className="text-sm text-muted-foreground">Il DUVRI è richiesto quando ci sono subappaltatori sull'ordine</p>
                </div>
                <Button size="sm" onClick={() => setDuvriDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Genera DUVRI
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {duvriDocs.map((doc: any) => (
                <Card key={doc.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-medium truncate">
                          {(doc.orders as any)?.description || "Ordine"}
                          {(doc.orders as any)?.code && <span className="ml-2 text-xs text-muted-foreground font-mono">#{(doc.orders as any).code}</span>}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Committente: {doc.committente_nome} · {format(new Date(doc.created_at), "dd/MM/yyyy", { locale: it })}
                        </CardDescription>
                      </div>
                      <Badge className={`${STATUS_COLORS[doc.status]} text-xs shrink-0`}>
                        {STATUS_LABELS[doc.status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {doc.subappaltatori?.length > 0 && (
                        <span>🏗️ {doc.subappaltatori.length} subappaltatori</span>
                      )}
                      {doc.interferenze?.length > 0 && (
                        <><span>·</span><span>⚠️ {doc.interferenze.length} interferenze</span></>
                      )}
                      {doc.costi_sicurezza > 0 && (
                        <><span>·</span><span>💶 €{Number(doc.costi_sicurezza).toLocaleString("it-IT")}</span></>
                      )}
                    </div>

                    {expandedDuvri === doc.id && (
                      <div className="space-y-3 pt-2 border-t">
                        {doc.interferenze?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Interferenze e misure</p>
                            <div className="space-y-1">
                              {doc.interferenze.map((i: any, idx: number) => (
                                <div key={idx} className="text-xs p-2 rounded bg-muted/50 space-y-0.5">
                                  <div className="font-medium">⚠️ {i.rischio}</div>
                                  <div className="text-muted-foreground">✅ {i.misura}</div>
                                  <div className="text-muted-foreground">👷 {i.responsabile}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {doc.misure_prevenzione && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Misure generali</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{doc.misure_prevenzione}</p>
                          </div>
                        )}
                        <EntityCustomFieldsSection entityType="duvri_document" entityId={doc.id} />
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setExpandedDuvri(expandedDuvri === doc.id ? null : doc.id)}
                      >
                        {expandedDuvri === doc.id ? "Nascondi dettagli" : "Vedi dettagli"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toast.info("Esportazione PDF in arrivo!")}
                      >
                        <Download className="h-3 w-3 mr-1" /> PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───── VERBALI TAB ───── */}
        <TabsContent value="verbali" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Verbali ispezioni e sopralluoghi D.Lgs 81/08</p>
            <Button size="sm" onClick={() => setVerbaleDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nuovo verbale
            </Button>
          </div>
          {verbaliLoading ? <Skeleton className="h-20 w-full" /> : verbali.length === 0 ? (
            <Card><CardContent className="py-10 text-center space-y-2">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nessun verbale registrato</p>
              <Button size="sm" onClick={() => setVerbaleDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Aggiungi verbale</Button>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {verbali.map((v: any) => (
                <Card key={v.id}>
                  <CardContent className="py-3 px-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm capitalize">{v.tipo}</span>
                        <Badge className={v.esito === "conforme" ? "bg-green-100 text-green-800 text-xs" : v.esito === "non_conforme" ? "bg-red-100 text-red-800 text-xs" : "bg-yellow-100 text-yellow-800 text-xs"}>
                          {v.esito === "conforme" ? "Conforme" : v.esito === "non_conforme" ? "Non conforme" : "Parz. conforme"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{v.data?.split("-").reverse().join("/")}</span>
                      </div>
                      {v.orders && <p className="text-xs text-muted-foreground mt-0.5">Cantiere: {(v.orders as any)?.description}</p>}
                      {v.redatto_da && <p className="text-xs text-muted-foreground">Redatto da: {v.redatto_da}</p>}
                      {v.note && <p className="text-xs text-muted-foreground mt-1 italic">{v.note}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───── SUBAPPALTATORI TAB ───── */}
        <TabsContent value="subappaltatori" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Registro subappaltatori con verifica DURC</p>
            <Button size="sm" onClick={() => setSubappaltatoreDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
          {subappaltatoriLoading ? <Skeleton className="h-20 w-full" /> : subappaltatori.length === 0 ? (
            <Card><CardContent className="py-10 text-center space-y-2">
              <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nessun subappaltatore registrato</p>
              <Button size="sm" onClick={() => setSubappaltatoreDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Aggiungi subappaltatore</Button>
            </CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ragione Sociale</TableHead>
                    <TableHead className="hidden sm:table-cell">Lavori</TableHead>
                    <TableHead className="hidden md:table-cell">Responsabile</TableHead>
                    <TableHead>DURC Scade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subappaltatori.map((s: any) => {
                    const durcScad = s.durc_scadenza ? new Date(s.durc_scadenza) : null;
                    const durcScaduto = durcScad && durcScad < new Date();
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{s.ragione_sociale}</p>
                          {s.orders && <p className="text-xs text-muted-foreground">{(s.orders as any)?.description}</p>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">{s.tipo_lavori || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{s.responsabile || "—"}</TableCell>
                        <TableCell>
                          {s.durc_scadenza ? (
                            <Badge className={durcScaduto ? "bg-red-100 text-red-800 text-xs" : "bg-green-100 text-green-800 text-xs"}>
                              {s.durc_scadenza.split("-").reverse().join("/")}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ───── SCADENZARIO TAB ───── */}
        <TabsContent value="scadenzario" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Adempimenti obbligatori D.Lgs 81/08</p>
            <Button size="sm" onClick={() => setAdempimentoDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
          {adempimentiLoading ? <Skeleton className="h-20 w-full" /> : adempimenti.length === 0 ? (
            <Card><CardContent className="py-10 text-center space-y-2">
              <CalendarClock className="h-10 w-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nessun adempimento in scadenzario</p>
              <Button size="sm" onClick={() => setAdempimentoDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Aggiungi adempimento</Button>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {adempimenti.map((a: any) => {
                const scad = a.scadenza_data ? new Date(a.scadenza_data) : null;
                const isScaduto = scad && scad < new Date() && a.stato !== "completato";
                return (
                  <Card key={a.id} className={isScaduto ? "border-red-200" : ""}>
                    <CardContent className="py-3 px-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a.titolo}</span>
                          <Badge className={a.stato === "completato" ? "bg-green-100 text-green-800 text-xs" : isScaduto ? "bg-red-100 text-red-800 text-xs" : "bg-yellow-100 text-yellow-800 text-xs"}>
                            {a.stato === "completato" ? "Completato" : isScaduto ? "Scaduto" : "Da fare"}
                          </Badge>
                          {a.scadenza_data && <span className="text-xs text-muted-foreground">{a.scadenza_data.split("-").reverse().join("/")}</span>}
                        </div>
                        {a.tipo && <p className="text-xs text-muted-foreground capitalize">{a.tipo.replace(/_/g, " ")}</p>}
                        {a.note && <p className="text-xs text-muted-foreground italic mt-1">{a.note}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7 text-xs"
                        onClick={() => toggleAdempimentoStato.mutate({ id: a.id, stato: a.stato === "completato" ? "da_fare" : "completato" })}
                      >
                        {a.stato === "completato" ? "Riapri" : "Completa"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* ───── Dialog Genera POS ───── */}
      <Dialog open={posDialogOpen} onOpenChange={setPosDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-primary" />
              Genera POS con AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ordine / Cantiere</Label>
              <Select value={selectedOrderId || undefined} onValueChange={setSelectedOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona ordine" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.code ? `#${o.code} — ` : ""}{o.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsabile Sicurezza (opzionale)</Label>
              <Input
                placeholder="Nome e cognome"
                value={responsabileSicurezza}
                onChange={(e) => setResponsabileSicurezza(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Il POS verrà generato automaticamente dall'AI analizzando i dati dell'ordine, i lavoratori assegnati e i fornitori.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPosDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => generatePos.mutate()}
              disabled={!selectedOrderId || generatePos.isPending}
            >
              {generatePos.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generazione in corso...</>
              ) : (
                <><ShieldAlert className="h-4 w-4 mr-2" /> Genera con AI</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Genera DUVRI ───── */}
      <Dialog open={duvriDialogOpen} onOpenChange={setDuvriDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Genera DUVRI con AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ordine / Cantiere</Label>
              <Select value={selectedOrderId || undefined} onValueChange={setSelectedOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona ordine" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.code ? `#${o.code} — ` : ""}{o.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedOrderId && hasSubappaltatori === false && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Nessun subappaltatore registrato per questo ordine. Il DUVRI è richiesto quando ci sono subappaltatori. Puoi comunque generarlo come documento preventivo.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Costi sicurezza stimati (€)</Label>
              <Input
                type="number"
                placeholder="0"
                value={costiSicurezza}
                onChange={(e) => setCostiSicurezza(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuvriDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => generateDuvri.mutate()}
              disabled={!selectedOrderId || generateDuvri.isPending}
            >
              {generateDuvri.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generazione in corso...</>
              ) : (
                <><Users className="h-4 w-4 mr-2" /> Genera con AI</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Verbale ───── */}
      <Dialog open={verbaleDialogOpen} onOpenChange={setVerbaleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />Nuovo Verbale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Cantiere (opzionale)</Label>
              <Select value={verbaleForm.order_id || "__none__"} onValueChange={(v) => setVerbaleForm((p) => ({ ...p, order_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Tutti i cantieri" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun cantiere</SelectItem>
                  {orders.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={verbaleForm.data} onChange={(e) => setVerbaleForm((p) => ({ ...p, data: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={verbaleForm.tipo} onValueChange={(v) => setVerbaleForm((p) => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sopralluogo">Sopralluogo</SelectItem>
                    <SelectItem value="riunione">Riunione</SelectItem>
                    <SelectItem value="ispezione">Ispezione</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Esito</Label>
              <Select value={verbaleForm.esito} onValueChange={(v) => setVerbaleForm((p) => ({ ...p, esito: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conforme">Conforme</SelectItem>
                  <SelectItem value="parzialmente_conforme">Parzialmente conforme</SelectItem>
                  <SelectItem value="non_conforme">Non conforme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Redatto da</Label>
              <Input value={verbaleForm.redatto_da} onChange={(e) => setVerbaleForm((p) => ({ ...p, redatto_da: e.target.value }))} placeholder="Nome e cognome" />
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <textarea className="w-full border rounded-md p-2 text-sm resize-none min-h-[80px]" value={verbaleForm.note} onChange={(e) => setVerbaleForm((p) => ({ ...p, note: e.target.value }))} placeholder="Osservazioni, prescrizioni..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerbaleDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => createVerbaleMutation.mutate()} disabled={createVerbaleMutation.isPending}>
              {createVerbaleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva verbale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Subappaltatore ───── */}
      <Dialog open={subappaltatoreDialogOpen} onOpenChange={setSubappaltatoreDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Nuovo Subappaltatore</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Ragione Sociale *</Label>
              <Input value={subappaltatoreForm.ragione_sociale} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, ragione_sociale: e.target.value }))} placeholder="es. Impianti Rossi Srl" />
            </div>
            <div className="space-y-1">
              <Label>Cantiere (opzionale)</Label>
              <Select value={subappaltatoreForm.order_id || "__none__"} onValueChange={(v) => setSubappaltatoreForm((p) => ({ ...p, order_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Tutti i cantieri" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun cantiere</SelectItem>
                  {orders.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo lavori</Label>
                <Input value={subappaltatoreForm.tipo_lavori} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, tipo_lavori: e.target.value }))} placeholder="es. Impianti elettrici" />
              </div>
              <div className="space-y-1">
                <Label>Responsabile</Label>
                <Input value={subappaltatoreForm.responsabile} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, responsabile: e.target.value }))} placeholder="Nome referente" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data inizio</Label>
                <Input type="date" value={subappaltatoreForm.data_inizio} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, data_inizio: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Data fine</Label>
                <Input type="date" value={subappaltatoreForm.data_fine} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, data_fine: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Scadenza DURC</Label>
              <Input type="date" value={subappaltatoreForm.durc_scadenza} onChange={(e) => setSubappaltatoreForm((p) => ({ ...p, durc_scadenza: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubappaltatoreDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => createSubappaltatoreM.mutate()} disabled={createSubappaltatoreM.isPending}>
              {createSubappaltatoreM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Dialog Nuovo Adempimento ───── */}
      <Dialog open={adempimentoDialogOpen} onOpenChange={setAdempimentoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Nuovo Adempimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Titolo *</Label>
              <Input value={adempimentoForm.titolo} onChange={(e) => setAdempimentoForm((p) => ({ ...p, titolo: e.target.value }))} placeholder="es. Corso di aggiornamento sicurezza" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={adempimentoForm.tipo} onValueChange={(v) => setAdempimentoForm((p) => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corso_formazione">Corso formazione</SelectItem>
                    <SelectItem value="visita_medica">Visita medica</SelectItem>
                    <SelectItem value="manutenzione_dpi">Manutenzione DPI</SelectItem>
                    <SelectItem value="rinnovo_certificato">Rinnovo certificato</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Scadenza</Label>
                <Input type="date" value={adempimentoForm.scadenza_data} onChange={(e) => setAdempimentoForm((p) => ({ ...p, scadenza_data: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input value={adempimentoForm.note} onChange={(e) => setAdempimentoForm((p) => ({ ...p, note: e.target.value }))} placeholder="Opzionale" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdempimentoDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => createAdempimentoM.mutate()} disabled={createAdempimentoM.isPending}>
              {createAdempimentoM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
