import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  MessageCircle, Plus, Phone, Bot, Settings2, Loader2,
  CheckCircle2, AlertTriangle, Trash2, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface WANumber {
  id: string;
  numero: string;
  nome_account: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  stato: string | null;
  provider: string | null;
  webhook_verified: boolean | null;
  agent_id: string | null;
  messaggio_benvenuto: string | null;
  messaggio_fuori_orario: string | null;
}

interface AgentOption {
  id: string;
  name: string;
}

export default function AgentWhatsAppPage() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formNumero, setFormNumero] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formPhoneId, setFormPhoneId] = useState("");
  const [formWabaId, setFormWabaId] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formBenvenuto, setFormBenvenuto] = useState("");
  const [formFuoriOrario, setFormFuoriOrario] = useState("");

  const { data: numbers = [], isLoading } = useQuery({
    queryKey: ["wa-ai-numbers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_whatsapp_numbers" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false });
      if (error) throw error;
      return (data || []) as WANumber[];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-for-wa-ai", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_agents" as never)
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      return (data || []) as AgentOption[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Missing company");
      const payload: Record<string, unknown> = {
        numero: formNumero.trim(),
        nome_account: formNome.trim() || null,
        phone_number_id: formPhoneId.trim() || null,
        waba_id: formWabaId.trim() || null,
        agent_id: formAgentId || null,
        messaggio_benvenuto: formBenvenuto.trim() || null,
        messaggio_fuori_orario: formFuoriOrario.trim() || null,
      };
      if (editId) {
        const { error } = await supabase
          .from("ai_whatsapp_numbers" as never)
          .update(payload as never)
          .eq("id", editId);
        if (error) throw error;
      } else {
        payload.company_id = companyId;
        const { error } = await supabase
          .from("ai_whatsapp_numbers" as never)
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Numero aggiornato" : "Numero aggiunto");
      queryClient.invalidateQueries({ queryKey: ["wa-ai-numbers"] });
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_whatsapp_numbers" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Numero eliminato");
      queryClient.invalidateQueries({ queryKey: ["wa-ai-numbers"] });
    },
  });

  const openEdit = (n: WANumber) => {
    setEditId(n.id);
    setFormNumero(n.numero);
    setFormNome(n.nome_account || "");
    setFormPhoneId(n.phone_number_id || "");
    setFormWabaId(n.waba_id || "");
    setFormAgentId(n.agent_id || "");
    setFormBenvenuto(n.messaggio_benvenuto || "");
    setFormFuoriOrario(n.messaggio_fuori_orario || "");
    setShowAdd(true);
  };

  const closeForm = () => {
    setShowAdd(false);
    setEditId(null);
    setFormNumero("");
    setFormNome("");
    setFormPhoneId("");
    setFormWabaId("");
    setFormAgentId("");
    setFormBenvenuto("");
    setFormFuoriOrario("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-[hsl(142,76%,36%)]" />
            WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Collega numeri WhatsApp Business ai tuoi agenti AI per automatizzare le conversazioni.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Aggiungi numero
        </Button>
      </div>

      {/* Info card */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-medium">Come funziona</p>
            <p className="text-xs opacity-80">
              Ogni numero WhatsApp Business può essere collegato a un agente AI. Quando un cliente scrive al numero, l'agente risponde automaticamente.
              Configura il Phone Number ID e il WABA ID dal tuo <strong>Meta Business Manager</strong>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Numbers grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : numbers.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center border rounded-lg bg-muted/10">
          <Phone className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
          <p className="font-semibold">Nessun numero WhatsApp collegato</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Aggiungi un numero WhatsApp Business e assegna un agente AI per iniziare ad automatizzare le conversazioni.
          </p>
          <Button className="mt-4" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Aggiungi numero
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {numbers.map((n) => {
            const agentName = agents.find((a) => a.id === n.agent_id)?.name;
            return (
              <Card key={n.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Phone className="h-4 w-4 text-[hsl(142,76%,36%)]" />
                      {n.numero}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {n.webhook_verified ? (
                        <Badge variant="default" className="text-[9px]">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Verificato
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Non verificato
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {n.nome_account && (
                    <p className="text-xs text-muted-foreground">{n.nome_account}</p>
                  )}
                  {agentName ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Bot className="h-3 w-3 text-primary" />
                      <span className="font-medium">{agentName}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Bot className="h-3 w-3" />
                      <span>Nessun agente assegnato</span>
                    </div>
                  )}
                  {n.phone_number_id && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      ID: {n.phone_number_id}
                    </p>
                  )}
                  {n.provider && (
                    <Badge variant="secondary" className="text-[9px]">
                      {n.provider.toUpperCase()}
                    </Badge>
                  )}
                  <div className="flex items-center gap-1 pt-2 border-t border-border">
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => openEdit(n)}>
                      <Settings2 className="h-3 w-3 mr-1" /> Configura
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] text-destructive">
                          <Trash2 className="h-3 w-3 mr-1" /> Elimina
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare questo numero?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Il numero {n.numero} verrà rimosso. Questa azione non può essere annullata.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(n.id)}>
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => !v && closeForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Modifica numero WhatsApp" : "Aggiungi numero WhatsApp"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Numero di telefono *</Label>
              <Input
                placeholder="+39 333 1234567"
                value={formNumero}
                onChange={(e) => setFormNumero(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome account</Label>
              <Input
                placeholder="es. WhatsApp Azienda"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone Number ID</Label>
                <Input
                  placeholder="Da Meta Business"
                  value={formPhoneId}
                  onChange={(e) => setFormPhoneId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>WABA ID</Label>
                <Input
                  placeholder="WhatsApp Business ID"
                  value={formWabaId}
                  onChange={(e) => setFormWabaId(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Agente AI</Label>
              <Select value={formAgentId || "none"} onValueChange={(v) => setFormAgentId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun agente</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                L'agente selezionato risponderà automaticamente ai messaggi in arrivo.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Messaggio di benvenuto</Label>
              <Textarea
                placeholder="Ciao! Come posso aiutarti oggi?"
                value={formBenvenuto}
                onChange={(e) => setFormBenvenuto(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Messaggio fuori orario</Label>
              <Textarea
                placeholder="Siamo fuori orario. Ti risponderemo al più presto."
                value={formFuoriOrario}
                onChange={(e) => setFormFuoriOrario(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Annulla</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!formNumero.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editId ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
