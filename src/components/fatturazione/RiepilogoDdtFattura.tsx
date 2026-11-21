import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { percorsoDocumentoGenerale, useAspettoOperativo } from "@/components/orders/generali/design/ContestoOperativo";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";

const db = supabase as unknown as {
  rpc(nome: string, args: { p_fattura: string }): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const motiviPrezzo: Record<string, string> = {
  fornitore: "Verifica l’anagrafica del fornitore e i suoi dati fiscali.",
  xml: "Serve l’XML originale della fattura.",
  divisa: "La valuta richiede una verifica manuale.",
  sconto_documento: "Verifica come ripartire lo sconto o la maggiorazione della fattura.",
  riferimento_ddt: "Controlla numero e data del DDT nell’XML.",
  ddt_mancante: "Il DDT citato va registrato o collegato alla fattura.",
  ddt_ambiguo: "Controlla quali DDT corrispondono ai riferimenti della fattura.",
  ddt_da_collegare: "Conferma il collegamento al DDT.",
  riferimento_riga: "Indica a quale DDT appartiene la voce della fattura.",
  quantita_prezzo: "Controlla quantità, unità di misura e importo IVA esclusa.",
  articolo: "Conferma quale articolo del DDT corrisponde alla voce della fattura.",
  fattura_concorrente: "Controlla le altre fatture collegate allo stesso DDT.",
  ripartizione_manuale: "Controlla la ripartizione delle quantità già salvata.",
  consegna: "Controlla la consegna confermata e associa il materiale alla commessa.",
  valorizzazione_precedente: "Controlla il prezzo o la quantità registrati in precedenza.",
  altre_consegne: "Completa i prezzi degli altri DDT per aggiornare il prezzo in commessa.",
  automatico_disattivato: "L’azienda richiede la conferma del confronto prezzi.",
  verifica_fallita: "La verifica automatica richiede un controllo.",
};

const motiviCollegamento = ["riferimento_ddt", "ddt_mancante", "ddt_da_collegare", "ddt_ambiguo"];
const verificaConsegna = (motivo?: string) => motivo === "consegna" || motivo === "altre_consegne";

export interface RiepilogoDdt {
  ddt: Array<{ id: string | null; numero: string; data: string | null; ddt_id: string | null;
    esito: "mancante" | "non_disponibile" | "fornitore_da_verificare" | "senza_destinazione" | "piu_destinazioni" | "collegato";
    destinazioni: Array<{ tipo: "commessa" | "magazzino"; id: string; codice: string | null; valida: boolean }> }>;
  completo: boolean; motivo: string; automatico: boolean; senza_costo: boolean; allineata: boolean; manuale: boolean; gestita_altrove: boolean;
  prezzi?: {
    stato: "in_verifica" | "aggiornata" | "confermata" | "pronta" | "parziale" | "da_verificare";
    motivo?: string;
    ddt_id?: string;
    riga?: number;
    riferimento?: string;
    confermate?: number;
    ddt_totali?: number;
    ddt_valorizzati?: number;
    ddt_pendenti?: Array<{ posizione: number; numero?: string; data?: string; motivo: string; ddt_id?: string; riga?: number }>;
    attesa_materiale?: string | null;
  } | null;
}

export function RiepilogoDdtFattura({ companyId, fatturaId, puoModificare, onCollegaDdt }: {
  companyId: string; fatturaId: string; puoModificare: boolean; onCollegaDdt?: () => void;
}) {
  const qc = useQueryClient();
  const aspetto = useAspettoOperativo();
  const q = useQuery({
    queryKey: ["fattura-ddt-riepilogo", companyId, fatturaId],
    queryFn: async () => {
      // RPC con controllo dell'azienda e dei permessi, anche quando il documento originale non è leggibile.
      const { data, error } = await db.rpc("fattura_ddt_riepilogo", { p_fattura: fatturaId });
      if (error) throw error;
      return data as unknown as RiepilogoDdt | null;
    },
    refetchInterval: ({ state }) => state.data?.prezzi?.stato === "in_verifica" ? 12_000 : false,
  });
  const allinea = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("fattura_ddt_allinea_commesse", { p_fattura: fatturaId });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: esito => {
      if (esito === "allineata") toast.success("Commesse aggiornate dai DDT");
      else toast.info("Controlla le destinazioni e le quote della fattura");
      refreshFinancialQueries(qc);
    },
    onError: e => toast.error("Commesse non aggiornate", { description: messaggioSalvataggio(e) }),
  });
  if (q.isError) return <p role="alert" className="basis-full text-xs text-destructive">Verifica DDT non disponibile. <button className="underline" onClick={() => void q.refetch()}>Riprova</button></p>;
  const p = q.data;
  const ddt = p?.ddt ?? [];
  if (!p || (!ddt.length && !p.prezzi)) return null;
  const mancanti = ddt.filter(d => d.esito === "mancante");
  const senzaDestinazione = ddt.filter(d => d.esito === "senza_destinazione");
  const daVerificare = ddt.filter(d => ["non_disponibile", "fornitore_da_verificare", "piu_destinazioni"].includes(d.esito));
  const trovati = ddt.filter(d => d.ddt_id && d.esito !== "non_disponibile").length;
  const destinazioni = [...new Map(ddt.flatMap(d => d.destinazioni).map(d => [`${d.tipo}:${d.id}`, d])).values()];
  const nomi = (righe: RiepilogoDdt["ddt"]) => righe.map(d => `${d.numero}${d.data ? ` (${d.data.split("-").reverse().join("/")})` : ""}`).join(", ");
  const prezzi = p.prezzi;
  const pendenti = prezzi?.ddt_pendenti ?? [];
  const mancantiSenzaAvvisoPrezzi = mancanti.filter(d => !pendenti.some(r => r.numero === d.numero && (r.data ?? null) === d.data));
  const consegnaDaControllare = verificaConsegna(prezzi?.motivo);
  const ddtPrezzi = prezzi?.ddt_id ?? ddt.find(d => d.ddt_id && d.esito !== "non_disponibile")?.ddt_id;
  const percorsoBolla = (id: string, motivo?: string) => percorsoDocumentoGenerale(
    `/azienda/ddt/${id}${verificaConsegna(motivo) ? "" : `?fatturaPrezzi=${encodeURIComponent(fatturaId)}`}`,
    aspetto?.generaleId,
  );
  const percorsoPrezzi = ddtPrezzi && percorsoBolla(ddtPrezzi, prezzi?.motivo);
  const contestoPrezzi = [
    prezzi?.riferimento && `DDT ${prezzi.riferimento}`,
    prezzi?.riga && `riga ${prezzi.riga} della fattura`,
  ].filter(Boolean).join(" · ");
  return <div className="basis-full space-y-1.5 pt-1 text-xs [overflow-wrap:anywhere]" aria-label="Verifica DDT e commesse">
    {ddt.length > 0 && <p className="text-muted-foreground">{trovati} di {ddt.length} DDT collegati</p>}
    {mancantiSenzaAvvisoPrezzi.length > 0 && <p role="alert" className="text-amber-800 dark:text-amber-300">{mancantiSenzaAvvisoPrezzi.length} DDT da collegare: {nomi(mancantiSenzaAvvisoPrezzi)}.</p>}
    {senzaDestinazione.length > 0 && <p role="alert" className="text-amber-800 dark:text-amber-300">{senzaDestinazione.length} DDT senza cantiere o magazzino: {nomi(senzaDestinazione)}.</p>}
    {daVerificare.length > 0 && <p role="alert" className="text-amber-800 dark:text-amber-300">Verifica fornitore e destinazione dei DDT: {nomi(daVerificare)}.</p>}
    {destinazioni.length > 0 && <p className="flex flex-wrap gap-x-3 gap-y-1"><span className="text-muted-foreground">Destinazioni DDT:</span>{destinazioni.map(d =>
      d.tipo === "commessa" && d.valida ? <Link key={d.id} className="underline underline-offset-2" to={percorsoDocumentoGenerale(`/azienda/ordini/${d.id}`, aspetto?.generaleId)}>{d.codice || "Commessa"}</Link>
        : <span key={`${d.tipo}:${d.id}`}>{d.tipo === "magazzino" ? "Magazzino" : "Commessa non disponibile"}</span>)}</p>}
    {ddt.length > 0 && !p.completo && !mancanti.length && !senzaDestinazione.length && !daVerificare.length && <p role="alert" className="text-amber-800 dark:text-amber-300">{p.motivo}</p>}
    {p.completo && <>
      {p.allineata ? <p className="text-muted-foreground">Costi assegnati alle destinazioni dei DDT.</p>
        : p.gestita_altrove ? <p className="text-muted-foreground">Il costo è gestito separatamente: verifica le quote nella sezione Commesse.</p>
          : p.manuale ? <p role="alert" className="text-amber-800 dark:text-amber-300">Le commesse sono state scelte manualmente: controlla che le quote corrispondano ai DDT.</p>
            : p.senza_costo ? <p className="text-muted-foreground">Destinazioni riconosciute. Il costo verrà ripartito dopo la contabilizzazione.</p>
              : !p.automatico ? <p className="text-muted-foreground">Collegamento automatico disattivato: assegna le quote da Commesse.</p>
                : puoModificare && <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={allinea.isPending} onClick={() => allinea.mutate()}>{allinea.isPending ? "Aggiornamento…" : "Aggiorna commesse dai DDT"}</Button>}
    </>}
    {prezzi?.stato === "in_verifica" && <p role="status" className="text-muted-foreground">Verifica automatica dei prezzi in corso.</p>}
    {prezzi?.stato === "aggiornata" && <p role="status" className="text-muted-foreground">Prezzi aggiornati automaticamente in commessa.</p>}
    {prezzi?.stato === "confermata" && <p className="text-muted-foreground">Prezzi confermati manualmente.</p>}
    {!!prezzi?.ddt_valorizzati && <p role="status" className="text-muted-foreground">
      {prezzi.ddt_valorizzati} di {prezzi.ddt_totali} DDT valorizzati.
    </p>}
    {prezzi?.attesa_materiale && <p className="text-muted-foreground">
      Prezzo medio in attesa degli altri DDT del materiale.{" "}
      <Link className="underline underline-offset-2" to={percorsoBolla(prezzi.attesa_materiale, "altre_consegne")}>Apri DDT</Link>
    </p>}
    {pendenti.length > 0 && (
      <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
        <p role="alert" className="font-semibold text-amber-900 dark:text-amber-200">{pendenti.length} DDT da confermare</p>
        <ul className="space-y-1">
          {pendenti.map(r => <li key={r.posizione}>
            <span className="font-medium">{r.numero ? `DDT ${r.numero}` : `Riferimento ${r.posizione}`}</span>{" "}
            {r.riga ? <span className="text-muted-foreground">· Riga {r.riga} · </span> : "· "}
            {motiviPrezzo[r.motivo] ?? motiviPrezzo.verifica_fallita}{" "}
            {r.ddt_id && <Link className="text-primary underline underline-offset-2" to={percorsoBolla(r.ddt_id, r.motivo)}>
              {verificaConsegna(r.motivo) ? "Apri DDT" : "Verifica sul DDT"}
            </Link>}
          </li>)}
        </ul>
        {puoModificare && onCollegaDdt && pendenti.some(r => motiviCollegamento.includes(r.motivo)) && (
          <button type="button" className="text-primary underline underline-offset-2" onClick={onCollegaDdt}>Collega DDT</button>
        )}
      </div>
    )}
    {prezzi && pendenti.length === 0 && (prezzi.stato === "da_verificare" || prezzi.stato === "pronta") && (
      <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
        <p role="status" className="text-amber-900 dark:text-amber-200">
          <strong>Prezzi in commessa da confermare.</strong>{" "}
          {prezzi.stato === "pronta" ? "Controlla e conferma il confronto sul DDT." : (motiviPrezzo[prezzi.motivo ?? ""] ?? motiviPrezzo.verifica_fallita)}
          {contestoPrezzi && <> ({contestoPrezzi})</>}
        </p>
        {!!prezzi.confermate && <p className="text-muted-foreground">Righe confermate manualmente: {prezzi.confermate}.</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {puoModificare && motiviCollegamento.includes(prezzi.motivo ?? "") && onCollegaDdt && (
            <button type="button" className="text-primary underline underline-offset-2" onClick={onCollegaDdt}>Collega DDT</button>
          )}
          {percorsoPrezzi && prezzi.motivo !== "fornitore" && (
            <Link className="text-primary underline underline-offset-2" to={percorsoPrezzi}>
              {consegnaDaControllare ? "Apri DDT" : "Verifica prezzi sul DDT"}
            </Link>
          )}
        </div>
      </div>
    )}
  </div>;
}
