import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitChangeRequest } from "@/hooks/accountant/useAccountantChangeRequests";
import type { AccountantCompanyAccessRow } from "@/hooks/accountant/useAccountantPortalData";

const selectClasses = "h-10 w-full rounded-md border bg-background px-2 text-sm";

export function NuovaRichiestaStudio({ studioId, aziende, aziendaIniziale, commessaIniziale }: {
  studioId: string;
  aziende: AccountantCompanyAccessRow[];
  aziendaIniziale: string;
  commessaIniziale: string;
}) {
  const [aziendaId, setAziendaId] = useState(aziendaIniziale || (aziende.length === 1 ? aziende[0].company_id : ""));
  const [ordineId, setOrdineId] = useState(commessaIniziale);
  const [testo, setTesto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errore, setErrore] = useState("");
  const [cerca, setCerca] = useState("");
  const azienda = aziende.find(riga => riga.company_id === aziendaId);
  const invia = useSubmitChangeRequest();
  const ordini = useQuery({
    queryKey: ["accountant", "commesse-richiesta", aziendaId, cerca],
    enabled: !!azienda && ordineId !== "libera",
    queryFn: async () => {
      let query = supabase.from("orders").select("id,order_code,description")
        .eq("company_id", aziendaId).is("deleted_at", null);
      if (cerca.trim()) query = query.ilike("order_code", `%${cerca.trim()}%`);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const commessa = ordini.data?.find(riga => riga.id === ordineId);

  if (!aziende.length) return <p className="text-sm text-muted-foreground">Per inviare una proposta ti serve una delega attiva «Con approvazione».</p>;
  return <Card>
    <CardHeader><CardTitle className="text-base">Nuova richiesta</CardTitle></CardHeader>
    <CardContent>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault();
        if (!azienda || (ordineId !== "libera" && !commessa)) return;
        setErrore("");
        try {
          await invia.mutateAsync({
            studioId, companyId: aziendaId, orderId: commessa?.id ?? null,
            precedente: commessa?.description ?? null, testo, motivo,
          });
          setTesto(""); setMotivo(""); setOrdineId(""); setCerca("");
        } catch (error) { setErrore(error instanceof Error ? error.message : "Impossibile inviare la richiesta."); }
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Azienda
            <select className={selectClasses} value={aziendaId} required onChange={event => {
              setAziendaId(event.target.value); setOrdineId(""); setCerca("");
            }}>
              <option value="">Scegli l’azienda</option>
              {aziende.map(riga => <option key={riga.id} value={riga.company_id}>{riga.company?.name ?? "Azienda"}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Modifica da proporre
            <select className={selectClasses} value={ordineId} required disabled={!azienda} onChange={event => setOrdineId(event.target.value)}>
              <option value="">Seleziona una modifica</option>
              <option value="libera">Richiesta libera · applicazione manuale</option>
              {ordini.data?.map(riga => <option key={riga.id} value={riga.id}>Descrizione commessa · {riga.order_code ?? riga.description.slice(0, 60)}</option>)}
            </select>
          </label>
        </div>
        {azienda && !commessa && ordineId !== "libera" && <label className="block text-sm">Filtra commesse per codice
          <input className={selectClasses} value={cerca} maxLength={40} onChange={event => setCerca(event.target.value)} />
        </label>}
        {ordini.isError && <p role="alert" className="text-sm text-destructive">Impossibile leggere le commesse. <Button variant="ghost" size="sm" onClick={() => void ordini.refetch()}>Riprova</Button></p>}
        {commessa && <div className="rounded-md border bg-muted/30 p-2 text-sm">
          <p className="font-medium">Descrizione attuale</p>
          <p className="whitespace-pre-wrap break-words text-muted-foreground">{commessa.description}</p>
        </div>}
        <label className="block space-y-1 text-sm font-medium">{commessa ? "Nuova descrizione" : "Modifica proposta"}
          <Textarea required rows={3} value={testo} minLength={3} maxLength={3000} onChange={event => setTesto(event.target.value)} />
        </label>
        <label className="block space-y-1 text-sm font-medium">Motivazione (facoltativa)
          <Textarea rows={2} value={motivo} maxLength={1000} onChange={event => setMotivo(event.target.value)} />
        </label>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        <Button type="submit" disabled={invia.isPending || !azienda || (!commessa && ordineId !== "libera")}>Invia per approvazione</Button>
      </form>
    </CardContent>
  </Card>;
}
