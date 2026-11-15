import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { bankRpc, bankCausale, type BankMovement } from "@/lib/finance/bankWorkspace";
import { syncBankExternalPayments } from "@/lib/finance/bankExternalPayments";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import {
  cifreRiferimento, linkCommessa, linkFattura, linkFornitore, linkOda, paroleNome, punteggioCandidato, riferimentoOda, stessaControparte,
} from "@/lib/finance/collegamentiFinanza";
import type { CandidatoRipartizione } from "./RipartizioneMovimento";

interface Fornitore { id: string; name: string }
interface Oda { id: string; oda_number: string | null; status: string | null; order_id: string | null; supplier_id: string | null }

const controparteDi = (m: BankMovement) => (m.transaction_type === "credit" ? m.debtor_name : m.creditor_name) || null;

/**
 * Quel che serve a chi riconcilia, prima di cercare a mano: chi è la
 * controparte (con la sua scheda), l'ordine d'acquisto citato nella causale,
 * i documenti aperti di quella controparte e i migliori abbinamenti col loro
 * punteggio. Il popup li mostra dentro «A cosa è collegato», nella riga giusta.
 */
export function useSuggerimentiMovimento(company: string, m: BankMovement, puoAbbinare: boolean, onAbbinato: () => void) {
  const controparte = controparteDi(m);
  const causale = bankCausale(m);
  const rifOda = riferimentoOda(causale);
  const uscita = m.transaction_type === "debit";
  const [inCorso, setInCorso] = useState<string | null>(null);

  const candidati = useQuery({
    queryKey: ["bank-candidati", company, m.id, false, ""],
    enabled: puoAbbinare,
    retry: false,
    queryFn: () => bankRpc<CandidatoRipartizione[]>("bank_candidati_movimento", { p_company: company, p_tx: m.id, p_search: "", p_existing: false }),
  });

  // Fornitore riconosciuto dal nome della controparte (solo uscite: i clienti stanno nelle fatture).
  const parola = paroleNome(controparte).sort((a, b) => b.length - a.length)[0];
  const fornitore = useQuery({
    queryKey: ["movimento-fornitore", company, controparte],
    enabled: uscita && !!parola,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("company_id", company).ilike("name", `%${parola}%`).limit(20);
      if (error) throw error;
      return ((data ?? []) as Fornitore[]).find((f) => stessaControparte(f.name, controparte)) ?? null;
    },
  });

  const oda = useQuery({
    queryKey: ["movimento-oda", company, rifOda],
    enabled: !!rifOda,
    retry: false,
    queryFn: async () => {
      const cifre = cifreRiferimento(rifOda!);
      const coda = cifre.slice(-2);
      const { data, error } = await supabase.from("purchase_orders").select("id, oda_number, status, order_id, supplier_id")
        .eq("company_id", company).ilike("oda_number", `%${coda}%`).limit(200);
      if (error) throw error;
      return ((data ?? []) as Oda[]).find((o) => {
        const c = cifreRiferimento(o.oda_number ?? "");
        return c === cifre || (c.length >= 3 && (c.endsWith(cifre) || cifre.endsWith(c)));
      }) ?? null;
    },
  });

  const valutati = (candidati.data ?? [])
    .map((c) => ({ c, ...punteggioCandidato({ importo: m.amount, controparte, causale }, c) }))
    .sort((a, b) => b.punteggio - a.punteggio);
  const migliori = valutati.filter((v) => v.punteggio >= 30).slice(0, 4);
  const dellaControparte = controparte ? valutati.filter((v) => v.motivi.includes("Stessa controparte")) : [];
  const apertiControparte = Math.round(dellaControparte.reduce((s, v) => s + Number(v.c.residuo), 0) * 100) / 100;

  async function abbina(c: CandidatoRipartizione) {
    if (inCorso) return;
    setInCorso(c.key);
    let salvato = false;
    try {
      const importo = Math.min(Number(c.residuo), m.links.remaining);
      const result = await bankRpc<{ esterne?: { invoice_id: string; provider: string; saldata: boolean; importo: number; numero: string }[] }>(
        "bank_conferma_ripartizione",
        { p_company: company, p_tx: m.id, p_rows: [{ tipo: c.tipo, id: c.id, importo }], p_note: null },
      );
      salvato = true;
      const falliti = await syncBankExternalPayments([{ id: m.id, booking_date: m.booking_date, result }]);
      toast.success(`Abbinato a ${c.titolo}`);
      if (falliti.length) toast.warning(`Pagamento salvato, aggiornamento esterno da riprovare: ${falliti.join(", ")}`);
    } catch (e) {
      // Salvato ma non allineato fuori: lo si dice, e l'elenco si aggiorna lo stesso.
      if (salvato) toast.warning("Abbinamento salvato, aggiornamento esterno da riprovare");
      else toast.error(e instanceof Error ? e.message : "Abbinamento non riuscito");
    } finally {
      setInCorso(null);
      if (salvato) onAbbinato();
    }
  }

  return { controparte, uscita, rifOda, fornitore, oda, candidati, migliori, dellaControparte, apertiControparte, abbina, inCorso, puoAbbinare };
}
export type SuggerimentiMovimento = ReturnType<typeof useSuggerimentiMovimento>;

/** Riga «Controparte»: il nome, la scheda del fornitore, l'ODA citato e quanto ha di aperto. */
export function ControparteRiconosciuta({ s }: { s: SuggerimentiMovimento }) {
  const { controparte, uscita, fornitore, oda, rifOda, candidati, dellaControparte, apertiControparte, puoAbbinare } = s;
  return (
    <>
      {fornitore.data
        ? <Link to={linkFornitore(fornitore.data.id)} className="font-medium text-primary hover:underline" title="Apri la scheda del fornitore">{fornitore.data.name}</Link>
        : controparte ? <span className="font-medium">{controparte}</span> : <span className="text-muted-foreground">Nessuno</span>}
      {uscita && controparte && fornitore.isSuccess && !fornitore.data && <span className="text-xs text-muted-foreground">non è tra i fornitori</span>}
      {!uscita && controparte && (
        <Link to={`/azienda/documenti?cerca=${encodeURIComponent(controparte)}`} className="text-xs text-primary hover:underline">Sue fatture</Link>
      )}
      {puoAbbinare && controparte && candidati.isSuccess && dellaControparte.length > 0 && (
        <span className="text-xs text-muted-foreground">{dellaControparte.length} {uscita ? (dellaControparte.length === 1 ? "scadenza aperta" : "scadenze aperte") : (dellaControparte.length === 1 ? "fattura aperta" : "fatture aperte")} · {money(apertiControparte)}</span>
      )}
      {rifOda && (
        <span className="inline-flex max-w-full flex-wrap items-center gap-x-1 rounded-full border px-2 py-0.5 text-xs">
          <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
          {oda.data
            ? <>
                <Link to={linkOda(oda.data.id)} className="font-medium text-primary hover:underline">{/^oda/i.test(oda.data.oda_number ?? "") ? oda.data.oda_number : `ODA ${oda.data.oda_number}`}</Link>
                {oda.data.status && <span className="text-muted-foreground">· {oda.data.status}</span>}
                {oda.data.order_id && <Link to={linkCommessa(oda.data.order_id)} className="text-primary hover:underline">· commessa</Link>}
              </>
            : <span>ODA {rifOda} nella causale{oda.isSuccess && <span className="text-muted-foreground"> · non trovato</span>}</span>}
        </span>
      )}
    </>
  );
}

/** Dentro la riga «Fatture e pagamenti»: i documenti aperti che somigliano di più, abbinabili con un clic. */
export function SuggerimentiAbbinamento({ s, resto }: { s: SuggerimentiMovimento; resto: number }) {
  const { candidati, migliori, abbina, inCorso } = s;
  if (!s.puoAbbinare || candidati.isError) return null;
  if (candidati.isPending) return <p role="status" className="basis-full text-xs text-muted-foreground">Cerco i documenti aperti…</p>;
  if (!migliori.length) return null;
  const linkCandidato = (c: CandidatoRipartizione) =>
    c.tipo === "documento" ? linkFattura(c.id, true) : c.tipo === "invoice" ? linkFattura(c.id, false) : null;
  return (
    <div className="w-full min-w-0 basis-full space-y-1">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Sparkles className="h-3 w-3 text-primary" />Suggeriti</p>
      <ul className="divide-y rounded-lg border bg-card">
        {migliori.map(({ c, punteggio, motivi }) => {
          const link = linkCandidato(c);
          const importo = Math.min(Number(c.residuo), resto);
          return (
            <li key={c.key} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 sm:flex-nowrap">
              <div className="min-w-0 flex-1 max-sm:order-first max-sm:basis-full">
                <p className="truncate font-medium" title={c.titolo}>
                  {link ? <Link to={link} className="hover:underline">{c.titolo}</Link> : c.titolo}
                  {c.sottotitolo && <span className="font-normal text-muted-foreground"> · {c.sottotitolo}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{motivi.join(" · ")}</p>
              </div>
              <Badge variant="outline" className={punteggio >= 70 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"} title="Quanto il documento somiglia al movimento">{punteggio}%</Badge>
              <span className="shrink-0 tabular-nums">{money(Number(c.residuo))}</span>
              <Button size="sm" className="h-7" variant={punteggio >= 70 ? "default" : "outline"} disabled={!!inCorso} onClick={() => void abbina(c)}
                aria-label={`Abbina ${c.titolo} per ${money(importo)}`}>
                {inCorso === c.key && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Abbina{importo < Number(c.residuo) ? ` ${money(importo)}` : ""}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
