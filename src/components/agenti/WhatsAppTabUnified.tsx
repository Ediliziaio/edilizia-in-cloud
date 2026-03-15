import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  MessageSquare, Plus, Phone, Bot, Settings2, Loader2,
  CheckCircle2, AlertTriangle, Trash2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
  nome: string;
}

export function WhatsAppTabUnified() {
  const companyId = useEffectiveCompanyId();
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
    queryKey: ["wa-numbers-unified", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_whatsapp_numbers")
        .select("*")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false });
      if (error) throw error;
      return (data || []) as WANumber[];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-for-wa", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_agents_v2")
        .select("id, nome")
        .eq("company_id", companyId!)
        .in("tipo", ["chat", "whatsapp"])
        .order("nome");
      return (data || []) as AgentOption[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Missing company");

      const payload: Record<string, unknown> = {
        numero: formNumero,
        nome_account: formNome || null,
        phone_number_id: formPhoneId || null,
        waba_id: formWabaId || null,
        agent_id: formAgentId || null,
        messaggio_benvenuto: formBenvenuto || null,
        messaggio_fuori_orario: formFuoriOrario || null,
      };

      if (editId) {
        const { error } = await supabase
          .from("ai_whatsapp_numbers")
          .update(payload as never)
          .eq("id", editId);
        if (error) throw error;
      } else {
        (payload as Record<string, unknown>).company_id = companyId;
        const { error } = await supabase
          .from("ai_whatsapp_numbers")
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Numero aggiornato" : "Numero aggiunto");
      queryClient.invalidateQueries({ queryKey: ["wa-numbers-unified"] });
      closeForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_whatsapp_numbers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Numero eliminato");
      queryClient.invalidateQueries({ queryKey: ["wa-numbers-unified"] });
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[hsl(142,76%,36%)]" />
            Numeri WhatsApp
          </h2>
          <p className="text-sm text-muted-foreground">
            Gestisci i numeri WhatsApp e assegna agenti AI.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Aggiungi numero
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : numbers.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Phone className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-semibold">Nessun numero WhatsApp</p>
          <p className="text-sm text-muted-foreground mt-1">
            Collega un numero WhatsApp Business per iniziare.
          </p>
          <Button className="mt-4" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Aggiungi
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {numbers.map((n) => {
            const agentName = agents.find(a => a.id === n.agent_id)?.nome;
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
                  {agentName && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Bot className="h-3 w-3 text-primary" />
                      <span className="font-medium">{agentName}</span>
                    </div>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] text-destructive"
                      onClick={() => deleteMutation.mutate(n.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Elimina
                    </Button>
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
            <DialogTitle>{editId ? "Modifica numero" : "Aggiungi numero WhatsApp"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Numero (es. +39 333 1234567)" value={formNumero} onChange={(e) => setFormNumero(e.target.value)} />
            <Input placeholder="Nome account (opzionale)" value={formNome} onChange={(e) => setFormNome(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Phone Number ID" value={formPhoneId} onChange={(e) => setFormPhoneId(e.target.value)} />
              <Input placeholder="WABA ID" value={formWabaId} onChange={(e) => setFormWabaId(e.target.value)} />
            </div>
            <Select value={formAgentId || "none"} onValueChange={(v) => setFormAgentId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Assegna agente AI" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessun agente</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Messaggio di benvenuto..."
              value={formBenvenuto}
              onChange={(e) => setFormBenvenuto(e.target.value)}
              rows={2}
            />
            <Textarea
              placeholder="Messaggio fuori orario..."
              value={formFuoriOrario}
              onChange={(e) => setFormFuoriOrario(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Annulla</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!formNumero || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editId ? "Salva" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
