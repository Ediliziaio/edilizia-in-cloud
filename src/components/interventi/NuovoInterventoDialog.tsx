import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selected customer id (es. from ImpiantoDetail) */
  defaultCustomerId?: string;
  /** Pre-selected impianto id (es. from ImpiantoDetail) */
  defaultImpiantoId?: string;
  /** Called after successful creation (for cache invalidation) */
  onSuccess?: () => void;
  /** If true, do NOT navigate to the new intervento after creation */
  noNavigate?: boolean;
}

export function NuovoInterventoDialog({
  open,
  onClose,
  defaultCustomerId,
  defaultImpiantoId,
  onSuccess,
  noNavigate,
}: Props) {
  const { effectiveCompany, user } = useAuth();
  const navigate = useNavigate();

  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [orderId, setOrderId] = useState("");
  const [subject, setSubject] = useState("");
  const [tipo, setTipo] = useState<"intervento" | "emergenza">("intervento");
  const [priority, setPriority] = useState("normale");
  const [tecnicoId, setTecnicoId] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [dataOra, setDataOra] = useState("");
  const [durataOre, setDurataOre] = useState("");
  const [impiantoId, setImpiantoId] = useState(defaultImpiantoId ?? "");
  const [note, setNote] = useState("");

  const { data: clienti = [] } = useCompanyCustomers(effectiveCompany?.id, open);

  // ── Ordini del cliente selezionato ───────────────────────────────────────────
  const { data: ordini = [] } = useQuery({
    queryKey: ["ordini-cliente-dialog", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("customer_id", customerId)
        .eq("company_id", effectiveCompany?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!customerId && !!effectiveCompany?.id,
  });

  const { data: tecnici = [] } = useCompanyStaffUsers(open ? effectiveCompany?.id : null, "all");

  // ── Impianti del cliente selezionato ─────────────────────────────────────────
  const { data: impianti = [] } = useQuery({
    queryKey: ["impianti-cliente-dialog", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("impianti_cliente")
        .select("id, tipo_impianto, marca, modello")
        .eq("customer_id", customerId)
        .order("tipo_impianto");
      return data ?? [];
    },
    enabled: !!customerId,
  });

  // ── Mutation ─────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Seleziona un cliente");
      if (!subject.trim()) throw new Error("L'oggetto è obbligatorio");
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      if (note.trim() && !user?.id) throw new Error("Utente non autenticato");

      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({
          company_id: effectiveCompany.id,
          customer_id: customerId,
          order_id: (orderId && orderId !== "none") ? orderId : null,
          subject: subject.trim(),
          tipo,
          priority,
          status: "aperto",
          assigned_to: (tecnicoId && tecnicoId !== "none") ? tecnicoId : null,
          indirizzo_intervento: indirizzo.trim() || null,
          data_intervento_prevista: dataOra ? new Date(dataOra).toISOString() : null,
          durata_ore: durataOre ? parseFloat(durataOre) : null,
          impianto_id: (impiantoId && impiantoId !== "none") ? impiantoId : null,
        })
        .select("id")
        .single();

      if (error) throw error;

      if (note.trim()) {
        await supabase.from("ticket_messages").insert({
          ticket_id: ticket.id,
          sender_id: user!.id,
          message: note.trim(),
        });
      }

      return ticket.id;
    },
    onSuccess: (ticketId) => {
      toast.success("Intervento creato con successo");
      onSuccess?.();
      handleClose();
      if (!noNavigate) {
        navigate(`/azienda/assistenza/${ticketId}`);
      }
    },
    onError: (err: Error) => toast.error(err.message || "Errore nella creazione dell'intervento"),
  });

  const handleClose = () => {
    setCustomerId(defaultCustomerId ?? "");
    setOrderId("");
    setSubject("");
    setTipo("intervento");
    setPriority("normale");
    setTecnicoId("");
    setIndirizzo("");
    setDataOra("");
    setDurataOre("");
    setImpiantoId(defaultImpiantoId ?? "");
    setNote("");
    onClose();
  };

  const canSubmit = !!customerId && !!subject.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-500" />
            Nuovo Intervento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label>Cliente *</Label>
            <Select
              value={customerId}
              onValueChange={(v) => { setCustomerId(v); setOrderId(""); setImpiantoId(defaultImpiantoId ?? ""); }}
              disabled={!!defaultCustomerId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona cliente..." />
              </SelectTrigger>
              <SelectContent>
                {clienti.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                    {c.email ? ` — ${c.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Oggetto */}
          <div className="space-y-1.5">
            <Label>Oggetto *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Descrivi brevemente l'intervento..."
              disabled={mutation.isPending}
            />
          </div>

          {/* Tipo + Priorità */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "intervento" | "emergenza")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="intervento">Intervento tecnico</SelectItem>
                  <SelectItem value="emergenza">Emergenza</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorità</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bassa">Bassa</SelectItem>
                  <SelectItem value="normale">Normale</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tecnico */}
          <div className="space-y-1.5">
            <Label>Tecnico assegnato</Label>
            <Select value={tecnicoId || "none"} onValueChange={(v) => setTecnicoId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tecnico..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                {tecnici.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {[t.first_name, t.last_name].filter(Boolean).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Indirizzo */}
          <div className="space-y-1.5">
            <Label>Indirizzo intervento</Label>
            <Input
              value={indirizzo}
              onChange={(e) => setIndirizzo(e.target.value)}
              placeholder="Via, città..."
              disabled={mutation.isPending}
            />
          </div>

          {/* Data + Durata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data e ora prevista</Label>
              <Input
                type="datetime-local"
                value={dataOra}
                onChange={(e) => setDataOra(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Durata stimata (ore)</Label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={durataOre}
                onChange={(e) => setDurataOre(e.target.value)}
                placeholder="Es. 2"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          {/* Impianto */}
          {customerId && (impianti.length > 0 || defaultImpiantoId) && (
            <div className="space-y-1.5">
              <Label>Impianto collegato</Label>
              <Select
                value={impiantoId || "none"}
                onValueChange={(v) => setImpiantoId(v === "none" ? "" : v)}
                disabled={!!defaultImpiantoId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona impianto..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun impianto</SelectItem>
                  {impianti.map((im: any) => (
                    <SelectItem key={im.id} value={im.id}>
                      {im.tipo_impianto?.replace("_", " ")}
                      {im.marca ? ` — ${im.marca}` : ""}
                      {im.modello ? ` ${im.modello}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Ordine */}
          {customerId && ordini.length > 0 && (
            <div className="space-y-1.5">
              <Label>Ordine collegato (opzionale)</Label>
              <Select value={orderId || "none"} onValueChange={(v) => setOrderId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessun ordine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun ordine</SelectItem>
                  {ordini.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `${o.order_code} — ` : ""}
                      {o.description?.substring(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Note iniziali (opzionale)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Descrivi il problema o istruzioni per il tecnico..."
              rows={3}
              disabled={mutation.isPending}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Annulla
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="gap-2"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Crea Intervento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
