import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, FileText, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface WhatsAppTemplate {
  name: string;
  status: string;
  category: string;
  language: string;
  components: any[];
  id?: string;
  rejected_reason?: string;
}

export function WhatsAppTemplatesTab() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    category: "MARKETING",
    language: "it",
    headerText: "",
    bodyText: "",
    footerText: "",
  });

  const companyId = effectiveCompany?.id;

  const { data: templates, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-templates", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
        body: { action: "list", company_id: companyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.templates || []) as WhatsAppTemplate[];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const components: any[] = [];

      if (newTemplate.headerText.trim()) {
        components.push({
          type: "HEADER",
          format: "TEXT",
          text: newTemplate.headerText,
        });
      }

      components.push({
        type: "BODY",
        text: newTemplate.bodyText,
      });

      if (newTemplate.footerText.trim()) {
        components.push({
          type: "FOOTER",
          text: newTemplate.footerText,
        });
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
        body: {
          action: "create",
          company_id: companyId,
          template: {
            name: newTemplate.name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
            category: newTemplate.category,
            language: newTemplate.language,
            components,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Template inviato per approvazione");
      setShowCreate(false);
      setNewTemplate({ name: "", category: "MARKETING", language: "it", headerText: "", bodyText: "", footerText: "" });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates", companyId] });
    },
    onError: (err: any) => {
      toast.error("Errore creazione template", { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateName: string) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
        body: { action: "delete", company_id: companyId, template_name: templateName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Template eliminato");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates", companyId] });
    },
    onError: (err: any) => {
      toast.error("Errore eliminazione", { description: err.message });
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 gap-1"><CheckCircle className="h-3 w-3" /> Approvato</Badge>;
      case "PENDING":
        return <Badge variant="outline" className="gap-1 text-amber-600"><Clock className="h-3 w-3" /> In attesa</Badge>;
      case "REJECTED":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rifiutato</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case "MARKETING": return "Marketing";
      case "UTILITY": return "Utility";
      case "AUTHENTICATION": return "Autenticazione";
      default: return cat;
    }
  };

  const getBodyText = (components: any[]) => {
    const body = components?.find((c: any) => c.type === "BODY");
    return body?.text || "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Template WhatsApp
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-4 w-4" />
            Aggiorna
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                Nuovo Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Crea Nuovo Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome template</Label>
                  <Input
                    placeholder="es. promo_estate_2025"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate((p) => ({ ...p, name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Solo lettere minuscole, numeri e underscore.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={newTemplate.category} onValueChange={(v) => setNewTemplate((p) => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MARKETING">Marketing</SelectItem>
                        <SelectItem value="UTILITY">Utility</SelectItem>
                        <SelectItem value="AUTHENTICATION">Autenticazione</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Lingua</Label>
                    <Select value={newTemplate.language} onValueChange={(v) => setNewTemplate((p) => ({ ...p, language: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="it">Italiano</SelectItem>
                        <SelectItem value="en">Inglese</SelectItem>
                        <SelectItem value="es">Spagnolo</SelectItem>
                        <SelectItem value="de">Tedesco</SelectItem>
                        <SelectItem value="fr">Francese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Header (opzionale)</Label>
                  <Input
                    placeholder="Titolo del messaggio"
                    value={newTemplate.headerText}
                    onChange={(e) => setNewTemplate((p) => ({ ...p, headerText: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Body *</Label>
                  <Textarea
                    placeholder="Testo del messaggio. Usa {{1}}, {{2}} per variabili."
                    value={newTemplate.bodyText}
                    onChange={(e) => setNewTemplate((p) => ({ ...p, bodyText: e.target.value }))}
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Footer (opzionale)</Label>
                  <Input
                    placeholder="es. Rispondi STOP per cancellazione"
                    value={newTemplate.footerText}
                    onChange={(e) => setNewTemplate((p) => ({ ...p, footerText: e.target.value }))}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={!newTemplate.name.trim() || !newTemplate.bodyText.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? "Invio..." : "Invia per approvazione"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !templates?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">Nessun template trovato</p>
            <p className="text-xs mt-1">Crea un template per iniziare a inviare broadcast.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <Card key={tpl.name + tpl.language}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium">{tpl.name}</span>
                      {statusBadge(tpl.status)}
                      <Badge variant="outline" className="text-xs">{categoryLabel(tpl.category)}</Badge>
                      <Badge variant="secondary" className="text-xs">{tpl.language}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {getBodyText(tpl.components) || "—"}
                    </p>
                    {tpl.status === "REJECTED" && tpl.rejected_reason && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {tpl.rejected_reason}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Eliminare il template "${tpl.name}"?`)) {
                        deleteMutation.mutate(tpl.name);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground space-y-1">
          <p>• I template <strong>MARKETING</strong> richiedono l'approvazione di Meta (24-48h).</p>
          <p>• I template <strong>UTILITY</strong> vengono approvati più rapidamente.</p>
          <p>• Usa <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code> nel body per inserire variabili dinamiche.</p>
          <p>• I template rifiutati possono essere ricreati con contenuto modificato.</p>
        </CardContent>
      </Card>
    </div>
  );
}
