/**
 * «Nuovo contratto» dalla scheda del cliente (09/11/2026).
 *
 * Florin: «un cliente privato che ha un nuovo contratto per un altro lavoro». Il caso normale è un lavoro nuovo per un
 * cliente che c'è già: si apre la commessa col cliente scelto, volendo con le righe di un suo lavoro o di un suo
 * preventivo di tempo fa (senza farne uno nuovo), e appena salvata il contratto standard è pronto. In alternativa si
 * fa il contratto su un lavoro che esiste.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Commessa { id: string; order_code: string | null; description: string | null }
interface Preventivo { id: string; quote_number: string | null; title: string | null; created_at: string }
const nomeCommessa = (c: Commessa): string => [c.order_code, c.description].filter(Boolean).join(" · ") || "Commessa";

export function NuovoContrattoClienteDialog({ aperto, onChiudi, clienteId, nomeCliente }: {
  aperto: boolean; onChiudi: () => void; clienteId: string; nomeCliente: string;
}) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const [copiaDa, setCopiaDa] = useState("");
  const { data: commesse = [], isLoading, error } = useQuery({
    queryKey: ["contratto-commesse-cliente", clienteId],
    enabled: aperto,
    queryFn: async (): Promise<Commessa[]> => {
      const { data, error: e } = await supabase.from("orders").select("id, order_code, description")
        .eq("customer_id", clienteId).is("deleted_at", null).order("created_at", { ascending: false }).limit(30);
      if (e) throw e;
      return (data ?? []) as Commessa[];
    },
  });
  // I preventivi non hanno il collegamento al cliente: si riconoscono da email, codice fiscale o nome.
  const { data: preventivi = [] } = useQuery({
    queryKey: ["contratto-preventivi-cliente", clienteId, companyId],
    enabled: aperto && !!companyId,
    queryFn: async (): Promise<Preventivo[]> => {
      const { data: c } = await supabase.from("profiles").select("email, fiscal_code, business_name, first_name, last_name").eq("id", clienteId).maybeSingle();
      const base = () => supabase.from("quotes").select("id, quote_number, title, created_at").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(20);
      const nomi = [c?.business_name, [c?.first_name, c?.last_name].filter(Boolean).join(" "), nomeCliente].map((n) => (n ?? "").trim()).filter(Boolean);
      const letture = await Promise.all([
        ...(c?.email ? [base().eq("client_email", c.email)] : []),
        ...(c?.fiscal_code ? [base().eq("client_fiscal_code", c.fiscal_code)] : []),
        ...[...new Set(nomi)].map((n) => base().eq("client_name", n)),
      ]);
      const uno = new Map<string, Preventivo>();
      for (const l of letture) for (const q of (l.data ?? []) as Preventivo[]) uno.set(q.id, q);
      return [...uno.values()].sort((x, y) => y.created_at.localeCompare(x.created_at));
    },
  });
  const vai = (dove: string): void => { onChiudi(); navigate(dove); };
  const nuovoLavoro = (): void => {
    const [tipo, id] = copiaDa.split(":");
    const origine = tipo === "lavoro" ? `&copia_da=${id}` : tipo === "preventivo" ? `&copia_preventivo=${id}` : "";
    vai(`/azienda/ordini/nuovo?customer_id=${clienteId}&customer_name=${encodeURIComponent(nomeCliente)}&contratto=1${origine}`);
  };
  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo contratto</DialogTitle>
          <DialogDescription>Per {nomeCliente}. Salvato il lavoro, il contratto è già pronto.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">Non riesco a leggere i lavori di questo cliente. Riprova.</p>}
        {(commesse.length > 0 || preventivi.length > 0) && (
          <div className="space-y-1">
            <label htmlFor="copia-righe" className="text-xs font-medium">Righe del nuovo lavoro</label>
            <select id="copia-righe" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={copiaDa} onChange={(e) => setCopiaDa(e.target.value)}>
              <option value="">Le scrivo da zero</option>
              {commesse.length > 0 && <optgroup label="Da un suo lavoro">{commesse.map((c) => <option key={c.id} value={`lavoro:${c.id}`}>{nomeCommessa(c)}</option>)}</optgroup>}
              {preventivi.length > 0 && <optgroup label="Da un suo preventivo">{preventivi.map((q) => <option key={q.id} value={`preventivo:${q.id}`}>{[q.quote_number, q.title, new Date(q.created_at).toLocaleDateString("it-IT")].filter(Boolean).join(" · ")}</option>)}</optgroup>}
            </select>
            <p className="text-xs text-muted-foreground">Non serve fare un preventivo nuovo.</p>
          </div>
        )}
        <Button className="w-full" onClick={nuovoLavoro}><Plus className="mr-1.5 h-4 w-4" />Nuovo lavoro</Button>
        {isLoading && <p role="status" className="text-sm text-muted-foreground">Cerco i lavori…</p>}
        {commesse.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Oppure, su un lavoro che c'è già</summary>
            <div className="mt-1 max-h-60 space-y-1 overflow-y-auto">
              {commesse.map((c) => (
                <button key={c.id} type="button" className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/60" onClick={() => vai(`/azienda/ordini/${c.id}?contratto=1`)}>
                  <span className="font-medium">{c.order_code || "Commessa"}</span>
                  {c.description ? <span className="block truncate text-xs text-muted-foreground">{c.description}</span> : null}
                </button>
              ))}
            </div>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
