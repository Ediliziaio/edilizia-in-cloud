/**
 * Mezzi, DDT, subappalto e note di credito di una fattura ricevuta: righe di «A cosa è collegata», come
 * fornitore e commessa. A vuoto occupano una riga con «Collega»: il modulo si apre solo a chi lo chiede.
 */
import { forwardRef, useState, type ComponentProps } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { ScegliMezzoFattura } from "./ScegliMezzoFattura";
import { CollegaDdtFattura } from "./CollegaDdtFattura";
import { chiaveCollegamenti, esigiRigaSalvata, messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const errore = (e: unknown) => toast.error("Non salvato", { description: messaggioSalvataggio(e) });
const DDT_A_VISTA = 6;
const pivaPulita = (p: string | null | undefined) => (p ?? "").replace(/\s/g, "").replace(/^IT/i, "");

interface LegameMezzo { id: string; mezzo_id: string; importo: number | null; confermata: boolean; mezzi: { nome: string; targa: string | null } | null }
interface LegameDdt { id: string; numero_ddt: string; data_ddt: string | null; ddt_ricezione_id: string | null }
interface Scrittura { id: string; entry_date: string | null; amount: number | null; reversal_of: string | null; bank_transaction_id: string | null }
interface MovimentoBanca { id: string; booking_date: string | null; amount: number | null; description: string | null; counterparty_name: string | null }
interface EmailOrigine { from_name: string | null; from_email: string | null; subject: string | null; received_at: string | null }
interface Storno { fattura_id: string; nota_id: string; importo: number | null }

// Con il ref: dentro PopoverTrigger è il pulsante a cui si aggancia la finestrella.
const Azione = forwardRef<HTMLButtonElement, ComponentProps<typeof Button>>(function Azione({ children, ...props }, ref) {
  return <Button ref={ref} variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" {...props}>{children}</Button>;
});

export function CollegamentiFattura({ fatturaId, companyId, puoModificare, numeroContratto, contrattoId, salId, cedentePiva, notaDiCredito,
  primaNotaId, costoId, vaiPrimaNota, vaiTesoreria, vaiEmail, fornitoreId }: {
  fatturaId: string; companyId: string; puoModificare: boolean;
  numeroContratto?: string | null; contrattoId?: string | null; salId?: string | null; cedentePiva?: string | null; notaDiCredito: boolean;
  primaNotaId?: string | null; costoId?: string | null;
  fornitoreId?: string | null;
  /** Chi non può aprire quelle pagine vede il testo, senza link. */
  vaiPrimaNota?: boolean; vaiTesoreria?: boolean; vaiEmail?: boolean;
}) {
  const qc = useQueryClient();
  const chiave = chiaveCollegamenti(companyId, fatturaId);
  const { data, isError, refetch } = useQuery({
    queryKey: chiave,
    queryFn: async () => {
      const [m, d, s] = await Promise.all([
        db.from("fattura_ricevuta_mezzi").select("id, mezzo_id, importo, confermata, mezzi(nome, targa)").eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId).order("created_at"),
        db.from("fattura_ddt").select("id, numero_ddt, data_ddt, ddt_ricezione_id").eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId).order("data_ddt"),
        db.from("note_credito_storni").select("fattura_id, nota_id, importo").or(`fattura_id.eq.${fatturaId},nota_id.eq.${fatturaId}`),
      ]);
      if (m.error) throw m.error;
      if (d.error) throw d.error;
      const storni = (s.data ?? []) as Storno[];
      const altri = [...new Set(storni.map((x) => (x.fattura_id === fatturaId ? x.nota_id : x.fattura_id)))];
      const { data: numeri } = altri.length ? await db.from("fatture_ricevute").select("numero_fattura").in("id", altri) : { data: [] };
      return {
        mezzi: (m.data ?? []) as LegameMezzo[], ddt: (d.data ?? []) as LegameDdt[],
        storni: ((numeri ?? []) as Array<{ numero_fattura: string }>).map((n) => n.numero_fattura),
      };
    },
  });
  // Le scritture del pagamento: quella della fattura e quelle del suo costo (i pagamenti a rate).
  // Una scrittura stornata non è più un pagamento: restano fuori lei e il suo storno.
  const { data: pagamenti } = useQuery({
    queryKey: ["fattura-collegamenti-pagamenti", fatturaId, primaNotaId, costoId],
    enabled: !!primaNotaId || !!costoId,
    queryFn: async () => {
      const filtri = [primaNotaId ? `id.eq.${primaNotaId}` : null, costoId ? `cost_id.eq.${costoId}` : null].filter(Boolean).join(",");
      const { data: righe, error } = await db.from("prima_nota_entries").select("id, entry_date, amount, reversal_of, bank_transaction_id")
        .eq("company_id", companyId).or(filtri).order("entry_date").limit(50);
      if (error) throw error;
      const tutte = (righe ?? []) as Scrittura[];
      const stornate = new Set(tutte.map((r) => r.reversal_of).filter(Boolean));
      const scritture = tutte.filter((r) => !r.reversal_of && !stornate.has(r.id));
      const idMovimenti = [...new Set(scritture.map((r) => r.bank_transaction_id).filter(Boolean))];
      const { data: movimenti } = idMovimenti.length
        ? await db.from("bank_transactions").select("id, booking_date, amount, description, counterparty_name").in("id", idMovimenti)
        : { data: [] };
      return { scritture, movimenti: (movimenti ?? []) as MovimentoBanca[] };
    },
  });
  const { data: emailOrigine = [] } = useQuery({
    queryKey: ["fattura-collegamenti-email", fatturaId],
    queryFn: async () => {
      const { data: righe, error } = await db.from("email_documento_estratto").select("id, email_inbox(from_name, from_email, subject, received_at)")
        .eq("company_id", companyId).eq("dedup_fattura_id", fatturaId).not("email_id", "is", null).limit(5);
      if (error) throw error;
      return ((righe ?? []) as Array<{ id: string; email_inbox: EmailOrigine | null }>).filter((r) => r.email_inbox);
    },
  });
  const [apriMezzo, setApriMezzo] = useState(false);
  // Solo i contratti di questo fornitore: uno di un altro subappaltatore sarebbe un errore.
  // La P.IVA si confronta qui, pulita: nella scheda della ditta può avere spazi o il prefisso IT.
  const { data: contratti = [] } = useQuery({
    queryKey: ["fattura-collegamenti-contratti", companyId, cedentePiva],
    enabled: !!cedentePiva && puoModificare && !contrattoId,
    queryFn: async () => {
      const { data: righe, error } = await db.from("contratti_subappalto").select("id, numero_contratto, descrizione_lavori, subappaltatori_sicurezza(piva)")
        .eq("company_id", companyId).limit(1000);
      if (error) throw error;
      return ((righe ?? []) as Array<{ id: string; numero_contratto: string | null; descrizione_lavori: string | null; subappaltatori_sicurezza: { piva: string | null } | null }>)
        .filter((c) => pivaPulita(c.subappaltatori_sicurezza?.piva) === pivaPulita(cedentePiva));
    },
  });
  const { data: salDelContratto = [] } = useQuery({
    queryKey: ["fattura-collegamenti-sal", contrattoId],
    enabled: !!contrattoId,
    queryFn: async () => {
      const { data: righe, error } = await db.from("sal_subappaltatori").select("id, numero_sal, importo_netto").eq("contratto_id", contrattoId).order("numero_sal");
      if (error) throw error;
      return (righe ?? []) as Array<{ id: string; numero_sal: number | null; importo_netto: number | null }>;
    },
  });
  const aggiorna = () => {
    void qc.invalidateQueries({ queryKey: chiave });
    void qc.invalidateQueries({ queryKey: ["mezzo-fatture"] });
    void qc.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
    void qc.invalidateQueries({ queryKey: ["fattura-confronto"] });
    void qc.invalidateQueries({ queryKey: ["fatture-ricevute"] });
  };
  const conferma = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      esigiRigaSalvata(await db.from("fattura_ricevuta_mezzi").update({ confermata: true, confermata_da: u.user?.id ?? null, confermata_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId).select("id").maybeSingle());
    },
    onSuccess: aggiorna, onError: errore,
  });
  const togliMezzo = useMutation({
    mutationFn: async (id: string) => { esigiRigaSalvata(await db.from("fattura_ricevuta_mezzi").delete().eq("id", id).eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId).select("id").maybeSingle()); },
    onSuccess: aggiorna, onError: errore,
  });
  const aggiungiMezzo = useMutation({
    mutationFn: async (mezzoId: string) => {
      esigiRigaSalvata(await db.from("fattura_ricevuta_mezzi").insert({ company_id: companyId, fattura_ricevuta_id: fatturaId, mezzo_id: mezzoId, origine: "manuale", confermata: true }).select("id").single());
    },
    onSuccess: () => { setApriMezzo(false); aggiorna(); }, onError: errore,
  });
  const [apriDdt, setApriDdt] = useState(false);
  const [tuttiDdt, setTuttiDdt] = useState(false);
  const togliDdt = useMutation({
    mutationFn: async (id: string) => { esigiRigaSalvata(await db.from("fattura_ddt").delete().eq("id", id).eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId).select("id").maybeSingle()); },
    onSuccess: aggiorna, onError: errore,
  });
  const salvaSubappalto = useMutation({
    mutationFn: async (campi: { contratto_subappalto_id?: string | null; sal_subappaltatore_id?: string | null }) => {
      esigiRigaSalvata(await db.from("fatture_ricevute").update(campi).eq("id", fatturaId).eq("company_id", companyId).select("id").maybeSingle());
    },
    onSuccess: aggiorna, onError: errore,
  });
  const collegati = new Set((data?.mezzi ?? []).map((m) => m.mezzo_id));
  const ddt = data?.ddt ?? [];
  const ddtVisti = tuttiDdt ? ddt : ddt.slice(0, DDT_A_VISTA);
  return (
    <>
      <dt className="text-muted-foreground">Mezzi</dt>
      <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {(data?.mezzi ?? []).map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1">
            {m.mezzi?.nome ?? "Mezzo"}{m.mezzi?.targa ? ` · ${m.mezzi.targa}` : ""}
            {m.importo != null && <span className="text-xs text-muted-foreground">{formatCurrency(m.importo)}</span>}
            {!m.confermata && <span className="text-xs text-amber-700 dark:text-amber-400">da confermare</span>}
            {puoModificare && !m.confermata && <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Conferma ${m.mezzi?.nome ?? "mezzo"}`} title="Conferma" onClick={() => conferma.mutate(m.id)}><Check className="h-3.5 w-3.5" /></button>}
            {puoModificare && <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Togli ${m.mezzi?.nome ?? "mezzo"}`} title="Togli" onClick={() => togliMezzo.mutate(m.id)}><X className="h-3.5 w-3.5" /></button>}
          </span>
        ))}
        {isError ? <span role="alert" className="text-xs text-destructive">Collegamenti non disponibili. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></span> : !data?.mezzi.length && <span className="text-muted-foreground">Nessuno</span>}
        {puoModificare && (
          <Popover open={apriMezzo} onOpenChange={setApriMezzo}>
            <PopoverTrigger asChild><Azione aria-label="Collega un mezzo">Collega</Azione></PopoverTrigger>
            <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
              {apriMezzo && <ScegliMezzoFattura companyId={companyId} collegati={collegati} occupato={aggiungiMezzo.isPending} onSelect={(v) => aggiungiMezzo.mutate(v)} />}
              {aggiungiMezzo.isError && <p role="alert" className="p-3 text-xs text-destructive">{messaggioSalvataggio(aggiungiMezzo.error)}</p>}
            </PopoverContent>
          </Popover>
        )}
      </dd>

      <dt className="text-muted-foreground">DDT</dt>
      <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ddtVisti.map((d) => (
          <span key={d.id} className="inline-flex items-center gap-1">
            {d.ddt_ricezione_id ? <Link className="underline underline-offset-2" to={`/azienda/ddt/${d.ddt_ricezione_id}`}>{d.numero_ddt}</Link> : d.numero_ddt}
            {d.data_ddt && <span className="text-xs text-muted-foreground">{formatDateShort(d.data_ddt)}</span>}
            {puoModificare && <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Togli DDT ${d.numero_ddt}`} title="Togli" onClick={() => togliDdt.mutate(d.id)}><X className="h-3 w-3" /></button>}
          </span>
        ))}
        {!ddt.length && <span className="text-muted-foreground">Nessuno</span>}
        {ddt.length > DDT_A_VISTA && <Azione onClick={() => setTuttiDdt((v) => !v)}>{tuttiDdt ? "Meno" : `Altri ${ddt.length - DDT_A_VISTA}`}</Azione>}
        {puoModificare && (
          <Popover open={apriDdt} onOpenChange={setApriDdt}>
            <PopoverTrigger asChild><Azione aria-label="Aggiungi un DDT">Aggiungi</Azione></PopoverTrigger>
            <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
              {apriDdt && <CollegaDdtFattura companyId={companyId} fatturaId={fatturaId} fornitoreId={fornitoreId} onSalvato={() => { setApriDdt(false); aggiorna(); }} />}
            </PopoverContent>
          </Popover>
        )}
      </dd>

      {(contrattoId || contratti.length > 0) && (
        <>
          <dt className="text-muted-foreground">Subappalto</dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {contrattoId ? (
              <>
                <span>Contratto {numeroContratto || "senza numero"}</span>
                {salDelContratto.length > 0 && (
                  <Select value={salId ?? "nessuno"} disabled={!puoModificare} onValueChange={(v) => salvaSubappalto.mutate({ sal_subappaltatore_id: v === "nessuno" ? null : v })}>
                    <SelectTrigger className="h-7 w-44 text-xs" aria-label="SAL del contratto"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nessuno">Nessun SAL</SelectItem>
                      {salDelContratto.map((s) => <SelectItem key={s.id} value={s.id}>SAL {s.numero_sal ?? "?"}{s.importo_netto != null ? ` · ${formatCurrency(s.importo_netto)}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {puoModificare && <Azione onClick={() => salvaSubappalto.mutate({ contratto_subappalto_id: null, sal_subappaltatore_id: null })}>Scollega</Azione>}
              </>
            ) : (
              <Select value="" disabled={!puoModificare} onValueChange={(v) => salvaSubappalto.mutate({ contratto_subappalto_id: v })}>
                <SelectTrigger className="h-7 w-56 text-xs" aria-label="Contratto di subappalto"><SelectValue placeholder="Collega a un contratto…" /></SelectTrigger>
                <SelectContent>{contratti.map((c) => <SelectItem key={c.id} value={c.id}>{c.numero_contratto || "Senza numero"}{c.descrizione_lavori ? ` · ${c.descrizione_lavori.slice(0, 40)}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </dd>
        </>
      )}

      {!!pagamenti?.movimenti.length && (
        <>
          <dt className="text-muted-foreground">Banca</dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {pagamenti.movimenti.map((m) => {
              const testo = [m.booking_date ? formatDateShort(m.booking_date) : null, m.amount != null ? formatCurrency(Math.abs(m.amount)) : null, m.counterparty_name].filter(Boolean).join(" · ");
              return vaiTesoreria
                ? <Link key={m.id} className="underline underline-offset-2" title={m.description ?? undefined} to="/azienda/tesoreria">{testo}</Link>
                : <span key={m.id} title={m.description ?? undefined}>{testo}</span>;
            })}
          </dd>
        </>
      )}

      {!!pagamenti?.scritture.length && (
        <>
          <dt className="text-muted-foreground">Prima nota</dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {pagamenti.scritture.map((r) => {
              const testo = [r.entry_date ? formatDateShort(r.entry_date) : null, r.amount != null ? formatCurrency(Math.abs(r.amount)) : null].filter(Boolean).join(" · ");
              return vaiPrimaNota
                ? <Link key={r.id} className="underline underline-offset-2" to="/azienda/prima-nota">{testo}</Link>
                : <span key={r.id}>{testo}</span>;
            })}
          </dd>
        </>
      )}

      {emailOrigine.length > 0 && (
        <>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="space-y-0.5">
            {emailOrigine.map((r) => {
              const e = r.email_inbox;
              const testo = [e?.from_name || e?.from_email, e?.subject, e?.received_at ? formatDateShort(e.received_at) : null].filter(Boolean).join(" · ");
              return (
                <div key={r.id} className="truncate">
                  {vaiEmail ? <Link className="underline underline-offset-2" to="/azienda/email/documenti">{testo}</Link> : testo}
                </div>
              );
            })}
          </dd>
        </>
      )}

      {!!data?.storni.length && (
        <>
          <dt className="text-muted-foreground">{notaDiCredito ? "Storna" : "Nota di credito"}</dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {data.storni.map((n) => <Link key={n} className="underline underline-offset-2" to={`/azienda/documenti/fatture-ricevute?cerca=${encodeURIComponent(n)}`}>{n}</Link>)}
          </dd>
        </>
      )}
    </>
  );
}
