/**
 * Cerca una voce per il rendiconto giornaliero (27/11/2026): prima il listino del COMMITTENTE
 * (anche le voci non collegate al generale), poi il listino generale con la regola dei prezzi di sempre.
 * Le voci del generale già comprese fra quelle del committente non si ripetono.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { etichettaPrezzo, type VoceListino } from "@/lib/campo/prezzoVoceRapportino";
import { COLORE_FONTE } from "@/components/orders/CercaNelListino";
import { listinoCommittente, unisciVoci, type VoceListinoCommittente } from "@/lib/rendiconti/rendicontiGiornalieri";

const rpc = (f: string, a: object) =>
  (supabase as unknown as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: Error | null }> }).rpc(f, a);

export function CercaVoceRendiconto({ orderId, data, conProdotti, onScegliCommittente, onScegliGenerale }: {
  orderId: string; data: string; conProdotti: boolean;
  onScegliCommittente: (v: VoceListinoCommittente) => void;
  onScegliGenerale: (v: VoceListino) => void;
}) {
  const tr = useT();
  const [testo, setTesto] = useState("");
  const [cercato, setCercato] = useState("");
  useEffect(() => { const t = setTimeout(() => setCercato(testo.trim()), 250); return () => clearTimeout(t); }, [testo]);
  const attiva = cercato.length >= 2;
  const committente = useQuery({
    queryKey: ["rendiconto-voci-committente", orderId, data, cercato],
    enabled: attiva, retry: false, staleTime: 30_000,
    queryFn: () => listinoCommittente(orderId, data, cercato),
  });
  const generale = useQuery({
    queryKey: ["rendiconto-voci-generale", orderId, data, conProdotti, cercato],
    enabled: attiva, retry: false, staleTime: 30_000,
    queryFn: async () => {
      const { data: d, error } = await rpc("commessa_listino_cerca", {
        p_order_id: orderId, p_data: data || null, p_testo: cercato, p_limite: 20, ...(conProdotti ? { p_con_prodotti: true } : {}),
      });
      if (error) throw error;
      return (Array.isArray(d) ? d : []) as VoceListino[];
    },
  });
  const { committente: dalCommittente, generale: dalGenerale } = unisciVoci(committente.data ?? [], generale.data ?? []);
  const caricando = committente.isFetching || generale.isFetching;
  const errore = generale.error ?? committente.error;
  const chiudi = () => { setTesto(""); setCercato(""); };
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input aria-label={tr("Cerca nel listino")} placeholder={tr("Cerca nel listino: codice, descrizione, categoria")} className="h-8 pl-7 text-[13px]"
          value={testo} onChange={(e) => setTesto(e.target.value)} />
      </div>
      {attiva && (
        <ul aria-label={tr("Voci del listino")} className="max-h-56 divide-y overflow-y-auto rounded-md border bg-background">
          {errore && <li className="px-2 py-1.5 text-xs text-destructive">{errore instanceof Error ? errore.message : tr("Ricerca non riuscita")}</li>}
          {!errore && !caricando && dalCommittente.length + dalGenerale.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">{tr("Nessuna voce del listino con «{testo}»", { testo: cercato })}</li>
          )}
          {dalCommittente.map((v) => (
            <li key={`c-${v.appalto_tariffa_id}`}>
              <button type="button" onClick={() => { onScegliCommittente(v); chiudi(); }}
                className="tap-compact grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-2 py-1.5 text-left hover:bg-muted/50">
                <span className="min-w-0 truncate text-[13px] font-medium">{v.codice ? <span className="mr-1 font-mono text-xs text-muted-foreground">{v.codice}</span> : null}{v.descrizione}</span>
                <span className="text-right text-[13px] tabular-nums">{v.prezzo == null ? "—" : `${formatCurrency(Number(v.prezzo))}/${v.unita}`}</span>
                <span className="truncate text-[11px] text-muted-foreground">{v.collegata ? "" : tr("non collegata al listino generale")}</span>
                <span className="text-right text-[11px] text-blue-800">{tr("listino committente")}</span>
              </button>
            </li>
          ))}
          {dalGenerale.map((v) => (
            <li key={v.tariffa_id ?? `prodotto-${v.articolo_id}`}>
              <button type="button" onClick={() => { onScegliGenerale(v); chiudi(); }}
                className="tap-compact grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-2 py-1.5 text-left hover:bg-muted/50">
                <span className="min-w-0 truncate text-[13px] font-medium">{v.codice ? <span className="mr-1 font-mono text-xs text-muted-foreground">{v.codice}</span> : null}{v.descrizione}</span>
                <span className="text-right text-[13px] tabular-nums">{"prezzo" in v ? (v.prezzo == null ? "—" : `${formatCurrency(Number(v.prezzo))}/${v.unita}`) : v.unita}</span>
                <span className="truncate text-[11px] text-muted-foreground">{v.origine === "prodotto" ? `${tr("Prodotto")} · ` : ""}{v.categoria ?? ""}</span>
                <span className={`text-right text-[11px] ${COLORE_FONTE[v.fonte]}`}>{etichettaPrezzo(v.fonte).replace("Prezzo applicato: ", "")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
