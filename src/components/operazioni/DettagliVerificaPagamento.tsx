import { Link } from "react-router-dom";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { numeroOperativo, type ControlloPagamento } from "@/lib/operazioni/operazioni";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  const bolle = esito.ddt ?? [];
  const problemi = esito.problemi ?? [];
  if (!bolle.length && !problemi.length) return null;
  const bolla = (r: (typeof bolle)[number]): string => {
    const nome = r.numero ? "DDT " + r.numero : t("Riferimento DDT incompleto");
    return r.data ? t("{bolla} del {data}", { bolla: nome, data: formatDateIt(r.data) }) : nome;
  };
  // Più bolle possibili è una scelta da fare: resta in vista. Le bolle solo da collegare, oltre 3,
  // diventano una riga che si apre (23/11/2026: 41 righe uguali coprivano il resto del riepilogo).
  const ambigue = bolle.filter((r) => r.candidati > 1);
  const daCollegare = bolle.filter((r) => !(r.candidati > 1));
  return (
    <ul className="list-disc space-y-1 pl-4 text-sm">
      {ambigue.map((r, i) => <li key={`a${i}`}>{t("{r} · più bolle possibili", { r: bolla(r) })}</li>)}
      {daCollegare.length > 3 ? (
        <li>
          <details>
            <summary className="cursor-pointer">{t("{n} bolle citate in fattura ancora da caricare o collegare", { n: daCollegare.length })}</summary>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {daCollegare.map((r, i) => <li key={i}>{bolla(r)}</li>)}
            </ul>
          </details>
        </li>
      ) : daCollegare.map((r, i) => <li key={`c${i}`}>{t("{r} · da collegare", { r: bolla(r) })}</li>)}
      {problemi.map((p, i) => <li key={i}>
        {p.riga != null && <span className="text-muted-foreground">{t("Riga {n}", { n: p.riga })}{p.descrizione ? " · " + p.descrizione : ""} · </span>}
        {p.tipo === "quantita" && p.fatturata != null && p.ricevuta != null && p.mancante != null
          ? <>{t("{fatturata} in fattura, {ricevuta} ricevuti, {mancante} da verificare {unita}", { fatturata: String(numeroOperativo(p.fatturata) ?? ""), ricevuta: String(numeroOperativo(p.ricevuta) ?? ""), mancante: String(numeroOperativo(p.mancante) ?? ""), unita: String(p.unita ?? "") })}</>
          : p.tipo === "prezzo" && p.prezzo_fattura != null && p.prezzo_ordine != null
            ? <>{t("{prezzo_fattura} in fattura · {prezzo_ordine} da ordine", { prezzo_fattura: formatCurrency(p.prezzo_fattura), prezzo_ordine: formatCurrency(p.prezzo_ordine) })}</>
            : <>{MOTIVI[p.tipo] ? t(MOTIVI[p.tipo]) : t("Controlla i riferimenti del documento")}{p.motivo && " · " + p.motivo}</>}
        {p.ddt_id && <Link to={"/azienda/ddt/" + p.ddt_id} className="ml-2 text-primary underline">{t("Apri DDT")}</Link>}
        {p.ordine_id && <Link to={"/azienda/ordini-acquisto/" + p.ordine_id} className="ml-2 text-primary underline">{t("Apri ordine")}</Link>}
      </li>)}
    </ul>
  );
}

