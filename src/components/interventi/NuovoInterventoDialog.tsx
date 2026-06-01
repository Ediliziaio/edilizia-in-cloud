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
import { Loader2, Wrench, Tag } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useTipiImpianto, useTipiIntervento } from "@/lib/manutenzione/tipiManutenzione";
import { usePrezzoIntervento } from "@/lib/manutenzione/prezzoIntervento";

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

interface ImpiantoOption {
  id: string;
  tipo_impianto: string | null;
  marca: string | null;
  modello: string | null;
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
  // #56 — Collegamento opzionale al listino di manutenzione: tipi a catalogo
  // (popolano tickets.tipo_impianto_id/tipo_intervento_id) + prezzo calcolato.
  const [tipoImpiantoListinoId, setTipoImpiantoListinoId] = useState("");
  const [tipoInterventoListinoId, setTipoInterventoListinoId] = useState("");

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

  // ── #56 Listino manutenzione: cataloghi tipi + prezzo (RPC get_prezzo_intervento)
  //     Se l'azienda non ha configurato tipi a listino, tipiImpianto è vuoto e
  //     l'intera sezione "Tariffa" resta nascosta (integrazione opt-in).
  const { data: tipiImpianto = [] } = useTipiImpianto(open ? effectiveCompany?.id : null);
  const { data: tipiIntervento = [] } = useTipiIntervento(open ? effectiveCompany?.id : null);
  const { data: prezzoListino, isFetching: prezzoLoading } = usePrezzoIntervento({
    companyId: effectiveCompany?.id,
    tipoImpiantoId: tipoImpiantoListinoId || null,
    tipoInterventoId: tipoInterventoListinoId || null,
    clienteId: customerId || null,
  });

  // ── Impianti del cliente selezionato ─────────────────────────────────────────
  const { data: impianti = [] } = useQuery<ImpiantoOption[]>({
    queryKey: ["impianti-cliente-dialog", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("impianti_cliente")
        .select("id, tipo_impianto, marca, modello")
        .eq("customer_id", customerId)
        .order("tipo_impianto");
      return (data ?? []) as ImpiantoOption[];
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
          // #56 — chiavi listino: abilitano il pricing da get_prezzo_intervento.
          tipo_impianto_id: tipoImpiantoListinoId || null,
          tipo_intervento_id: tipoInterventoListinoId || null,
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
    setTipoImpiantoListinoId("");
    setTipoInterventoListinoId("");
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
                  {impianti.map((im) => (
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

          {/* #56 — Tariffa di manutenzione (opzionale): collega tipo impianto +
              tipo intervento del listino → prezzo da get_prezzo_intervento.
              Visibile solo se l'azienda ha configurato tipi a listino. */}
          {tipiImpianto.length > 0 && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-teal-600" />
                <Label className="font-medium">Tariffa di manutenzione (opzionale)</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo impianto (listino)</Label>
                  <Select value={tipoImpiantoListinoId || "none"} onValueChange={(v) => setTipoImpiantoListinoId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {tipiImpianto.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo intervento (listino)</Label>
                  <Select value={tipoInterventoListinoId || "none"} onValueChange={(v) => setTipoInterventoListinoId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {tipiIntervento.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {tipoImpiantoListinoId && tipoInterventoListinoId && (
                <div className="text-sm">
                  {prezzoLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calcolo prezzo da listino…
                    </span>
                  ) : prezzoListino ? (
                    <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {prezzoListino.prezzo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                          {prezzoListino.unita ? <span className="font-normal text-muted-foreground"> / {prezzoListino.unita}</span> : null}
                        </span>
                        {prezzoListino.iva != null && (
                          <span className="text-xs text-muted-foreground">IVA {prezzoListino.iva}%</span>
                        )}
                      </div>
                      {prezzoListino.da_override && (
                        <Badge variant="secondary" className="shrink-0">Prezzo personalizzato cliente</Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Nessuna tariffa a listino per questa combinazione.
                    </span>
                  )}
                </div>
              )}
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
