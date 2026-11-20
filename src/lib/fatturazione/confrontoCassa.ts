import type { ConfrontoCassa } from "../../../shared/cassaInCloud";

export function chiaveGiornoCassa(g: ConfrontoCassa) {
  return `${g.punto_vendita_id}/${g.cassa_id ?? ""}/${g.giorno}`;
}

export function confrontoChiusura(g: ConfrontoCassa) {
  const attive = g.chiusure.filter((c) => c.presente);
  const valoriCompleti = attive.length > 0 && attive.every((c) =>
    c.dati.totale_scontrini !== null && c.dati.numero_scontrini !== null &&
    c.valuta === attive[0].valuta);
  const importo = valoriCompleti ? attive.reduce((t, c) => t + Math.round(c.dati.totale_scontrini * 100), 0) / 100 : null;
  const numero = valoriCompleti ? attive.reduce((t, c) => t + c.dati.numero_scontrini, 0) : null;
  const scostamento = importo === null ? null : Math.round((g.totale_scontrini - importo) * 100) / 100;
  const verifiche = g.con_differiti || g.con_fatture || g.con_resi || g.scontrini_assenti > 0 ||
    attive.some((c) => !!c.dati.numero_annulli || !!c.dati.annulli || !!c.dati.differiti);
  const stato = !g.chiusure.length ? "Chiusura mancante"
    : !attive.length ? "Chiusura assente nell’ultimo import"
    : !g.cassa_id ? "Cassa da identificare"
    : !valoriCompleti ? "Dati di chiusura incompleti"
    : scostamento !== 0 || numero !== g.numero_scontrini ? "Scostamento"
    : verifiche || attive.length !== g.chiusure.length ? "Da verificare"
    : "Scontrini allineati";
  return { stato, scostamento, numero, importo, valuta: attive[0]?.valuta ?? null };
}
