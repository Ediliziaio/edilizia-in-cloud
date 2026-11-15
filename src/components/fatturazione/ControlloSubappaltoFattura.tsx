/**
 * Il controllo della fattura di un subappaltatore contro contratto e SAL, nella riga «Subappalto»
 * di «A cosa è collegata». Le regole stanno in `controlloFatturaSubappalto` (nessuna AI); qui si
 * caricano i dati e si mostra l'esito con il perché. Collegare resta un clic dell'utente: la
 * scrittura la fa `subappalto_collega_fattura`, che ricontrolla P.IVA, azienda e stato del SAL.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  chiavePiva, controllaFatturaSubappalto,
  type ContrattoCtrl, type FatturaCtrl, type RisultatoControllo, type SalCtrl,
} from "@/lib/subappaltatori/controlloFatturaSubappalto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const COLONNE_FATTURA = "id, company_id, cedente_piva, numero_fattura, data_fattura, tipo_documento, imponibile_totale, totale_documento, stato, contratto_subappalto_id, sal_subappaltatore_id, righe, note";

/** Il testo su cui leggere contratto, SAL e periodo: descrizioni delle righe e note. */
export function testoFattura(f: { righe?: unknown; note?: string | null }): string {
  const righe = Array.isArray(f.righe) ? f.righe : [];
  const descrizioni = righe.map((r) => (r && typeof r === "object" ? String((r as Record<string, unknown>).descrizione ?? (r as Record<string, unknown>).Descrizione ?? "") : "")).filter(Boolean);
  return [...descrizioni, f.note ?? ""].join("\n");
}

type FatturaRiga = Omit<FatturaCtrl, "testo"> & { righe?: unknown; note?: string | null };
const aCtrl = (f: FatturaRiga): FatturaCtrl => ({ ...f, testo: testoFattura(f) });

export function useControlloSubappalto(fatturaId: string, companyId: string, cedentePiva: string | null | undefined) {
  return useQuery({
    queryKey: ["fattura-controllo-subappalto", companyId, fatturaId],
    enabled: !!fatturaId && !!companyId,
    queryFn: async (): Promise<{ risultato: RisultatoControllo; contratti: ContrattoCtrl[]; sal: SalCtrl[] } | null> => {
      const { data: f, error: ef } = await db.from("fatture_ricevute").select(COLONNE_FATTURA).eq("id", fatturaId).eq("company_id", companyId).maybeSingle();
      if (ef) throw ef;
      if (!f) return null;
      const piva = chiavePiva(f.cedente_piva ?? cedentePiva);
      if (!piva && !f.contratto_subappalto_id) return null;
      const { data: righeC, error: ec } = await db.from("contratti_subappalto")
        .select("id, company_id, numero_contratto, importo_contrattuale, oneri_sicurezza, stato, subappaltatori_sicurezza(piva)")
        .eq("company_id", companyId).limit(1000);
      if (ec) throw ec;
      const contratti: ContrattoCtrl[] = ((righeC ?? []) as Array<ContrattoCtrl & { subappaltatori_sicurezza: { piva: string | null } | null }>)
        .map(({ subappaltatori_sicurezza, ...c }) => ({ ...c, piva: subappaltatori_sicurezza?.piva ?? null }))
        .filter((c) => c.id === f.contratto_subappalto_id || (piva && chiavePiva(c.piva) === piva));
      if (!contratti.length) return null;
      const ids = contratti.map((c) => c.id);
      const [s, a] = await Promise.all([
        db.from("sal_subappaltatori").select("id, company_id, contratto_id, numero_sal, importo_lordo, oneri_quota, ritenuta_importo, importo_netto, stato, data_emissione")
          .eq("company_id", companyId).in("contratto_id", ids),
        db.from("fatture_ricevute").select(COLONNE_FATTURA).eq("company_id", companyId).in("contratto_subappalto_id", ids).neq("id", fatturaId).limit(1000),
      ]);
      if (s.error) throw s.error;
      if (a.error) throw a.error;
      const sal = (s.data ?? []) as SalCtrl[];
      const risultato = controllaFatturaSubappalto(aCtrl(f as FatturaRiga), { contratti, sal, altreFatture: ((a.data ?? []) as FatturaRiga[]).map(aCtrl) });
      return { risultato, contratti, sal };
    },
  });
}

const COLORE: Record<RisultatoControllo["esito"], string> = {
  automatico: "text-emerald-700 dark:text-emerald-400",
  proposta: "text-amber-700 dark:text-amber-400",
  scelta: "text-amber-700 dark:text-amber-400",
  conflitto: "text-destructive",
  da_gestire: "text-muted-foreground",
};

/** Una riga con l'esito, i problemi e, se c'è, la proposta da confermare con un clic. */
export function EsitoControlloSubappalto({ risultato, contratti, sal, giaCollegata, puoModificare, occupato, onCollega }: {
  risultato: RisultatoControllo; contratti: ContrattoCtrl[]; sal: SalCtrl[]; giaCollegata: boolean;
  puoModificare: boolean; occupato: boolean; onCollega: (contrattoId: string, salId: string | null) => void;
}) {
  const { esito, problemi, contrattoId, salId } = risultato;
  const c = contratti.find((x) => x.id === contrattoId);
  // Un SAL non ancora verificato non si collega (lo rifiuta subappalto_collega_fattura): si propone
  // il solo contratto, e il SAL si aggiunge dopo la verifica.
  const salDaVerificare = problemi.some((p) => p.codice === "sal_non_verificato");
  const s = salDaVerificare ? undefined : sal.find((x) => x.id === salId);
  const nomeProposta = c ? `contratto ${c.numero_contratto || "senza numero"}${s ? ` · SAL ${s.numero_sal}` : ""}` : "";
  const proponibile = !giaCollegata && !!c && (esito === "automatico" || esito === "proposta");
  return (
    <span className="basis-full text-xs" data-testid="controllo-subappalto">
      {giaCollegata && esito === "automatico" && <span className={COLORE.automatico}>Controllo: contratto e SAL coerenti con la fattura.</span>}
      {proponibile && (
        <span className={COLORE[esito]}>
          {esito === "automatico" ? "Riconosciuta" : "Proposta"}: {nomeProposta}{salDaVerificare ? " (il SAL si collega dopo la verifica)" : ""}.{" "}
          {puoModificare && (
            <button type="button" className="underline underline-offset-2" disabled={occupato} onClick={() => onCollega(c!.id, s?.id ?? null)}>Collega</button>
          )}
        </span>
      )}
      {esito === "scelta" && <span className={COLORE.scelta}>{risultato.regola}</span>}
      {esito === "da_gestire" && !giaCollegata && <span className={COLORE.da_gestire}>{risultato.regola}</span>}
      {problemi.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {problemi.map((p) => <li key={p.codice + p.testo} className={p.blocca ? "text-destructive" : "text-amber-700 dark:text-amber-400"}>{p.blocca ? "Bloccata: " : ""}{p.testo}</li>)}
        </ul>
      )}
    </span>
  );
}
