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
import { ShieldAlert, Plus, FileText, AlertTriangle, CheckCircle, Download, Loader2, HardHat, Users } from "lucide-react";
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
    </div>
  );
}
