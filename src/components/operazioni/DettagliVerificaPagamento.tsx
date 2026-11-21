import { Link } from "react-router-dom";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { numeroOperativo, type ControlloPagamento } from "@/lib/operazioni/operazioni";

const MOTIVI: Record<string, string> = {
  articolo: "Verifica l’articolo e l’unità di misura",
  ordine: "Verifica il riferimento all’ordine d’acquisto",
  righe: "Verifica le righe del documento originale",
  divisa: "Verifica la valuta del documento",
  rettifica: "La fattura è da rettificare",
  ddt_su_piu_fatture: "Lo stesso DDT è citato in più fatture. Verifica le quantità attribuite",
  ordine_su_piu_fatture: "Più fatture citano lo stesso ordine. Verifica a quale fattura si riferisce la consegna",
};

export function DettagliVerificaPagamento({ esito }: { esito: ControlloPagamento }) {
  const bolle = esito.ddt ?? [];
  const problemi = esito.problemi ?? [];
  if (!bolle.length && !problemi.length) return null;
  return (
    <ul className="list-disc space-y-1 pl-4 text-sm">
      {bolle.map((r, i) => <li key={i}>
        {r.numero ? "DDT " + r.numero : "Riferimento DDT incompleto"}
        {r.data ? " del " + formatDateIt(r.data) : ""}
        {r.candidati > 1 ? " · più bolle possibili" : " · da collegare"}
      </li>)}
      {problemi.map((p, i) => <li key={i}>
        {p.riga != null && <span className="text-muted-foreground">Riga {p.riga}{p.descrizione ? " · " + p.descrizione : ""} · </span>}
        {p.tipo === "quantita" && p.fatturata != null && p.ricevuta != null && p.mancante != null
          ? <>{numeroOperativo(p.fatturata)} in fattura, {numeroOperativo(p.ricevuta)} ricevuti, {numeroOperativo(p.mancante)} da verificare {p.unita}</>
          : p.tipo === "prezzo" && p.prezzo_fattura != null && p.prezzo_ordine != null
            ? <>{formatCurrency(p.prezzo_fattura)} in fattura · {formatCurrency(p.prezzo_ordine)} da ordine</>
            : <>{MOTIVI[p.tipo] ?? "Controlla i riferimenti del documento"}{p.motivo && " · " + p.motivo}</>}
        {p.ddt_id && <Link to={"/azienda/ddt/" + p.ddt_id} className="ml-2 text-primary underline">Apri DDT</Link>}
        {p.ordine_id && <Link to={"/azienda/ordini-acquisto/" + p.ordine_id} className="ml-2 text-primary underline">Apri ordine</Link>}
      </li>)}
    </ul>
  );
}

