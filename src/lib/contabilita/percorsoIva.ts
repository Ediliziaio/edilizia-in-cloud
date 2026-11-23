/**
 * Il percorso guidato dell'IVA nella Contabilità generale (23/11/2026).
 *
 * Un solo calcolo vuol dire un solo ordine: impostazioni → date di ricezione degli acquisti →
 * documenti completi → LIPE confermata periodo per periodo → registrazione in contabilità → F24.
 * Prima ogni pezzo stava in una pagina diversa e nessuno diceva quale mancava; qui ogni passo
 * dice se è fatto, che cosa manca e dove si fa.
 */
import { mesiInLettere, type DocumentoSenzaImporti } from "./controlloIva";

export type StatoPasso = "fatto" | "da_fare" | "avviso" | "in_attesa";
export type DestinazionePasso = "impostazioni" | "ricezione" | "lipe" | "giroconto" | "f24";

export interface PassoIva {
  chiave: "impostazioni" | "ricezione" | "documenti" | "lipe" | "contabilita" | "f24";
  titolo: string;
  stato: StatoPasso;
  dettaglio: string;
  azione?: { etichetta: string; vai: DestinazionePasso };
}

export interface LipeConfermata { dal: string; al: string; daVersare: boolean }

export interface DatiPercorsoIva {
  impostazioniCompilate: boolean;
  periodicita: "mensile" | "trimestrale" | null;
  acquistiSenzaRicezione: number;
  senzaImporti: readonly DocumentoSenzaImporti[];
  /** null: la lista delle LIPE non si può leggere (permessi): il passo resta senza conteggio. */
  lipe: readonly LipeConfermata[] | null;
  /** Quante delle LIPE confermate hanno già il giroconto in contabilità. */
  lipeRegistrate: number;
  f24Iva: { daPagare: number; pagati: number } | null;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** I periodi dell'anno già finiti a `oggi` (ISO), come li conta la LIPE. */
export function periodiFiniti(anno: number, periodicita: "mensile" | "trimestrale", oggi: string) {
  const fine = (m: number) => new Date(Date.UTC(anno, m, 0)).toISOString().slice(0, 10);
  const mm = (m: number) => String(m).padStart(2, "0");
  const tutti = periodicita === "mensile"
    ? MESI.map((nome, i) => ({ dal: `${anno}-${mm(i + 1)}-01`, al: fine(i + 1), nome: `${nome} ${anno}` }))
    : [1, 2, 3, 4].map((t) => ({ dal: `${anno}-${mm(t * 3 - 2)}-01`, al: fine(t * 3), nome: `${t}° trimestre ${anno}` }));
  return tutti.filter((p) => p.al < oggi);
}

const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;

export function percorsoIva(d: DatiPercorsoIva, anno: number, oggi: string): PassoIva[] {
  const passi: PassoIva[] = [];
  passi.push(d.impostazioniCompilate
    ? { chiave: "impostazioni", titolo: `Impostazioni IVA ${anno}`, stato: "fatto", dettaglio: `Liquidazione ${d.periodicita ?? ""}`.trim() }
    : { chiave: "impostazioni", titolo: `Impostazioni IVA ${anno}`, stato: "da_fare",
        dettaglio: "Mensile o trimestrale, regime e credito dell'anno prima: senza, la liquidazione non si calcola.",
        azione: { etichetta: "Compila", vai: "impostazioni" } });

  passi.push(d.acquistiSenzaRicezione === 0
    ? { chiave: "ricezione", titolo: "Date di ricezione degli acquisti", stato: "fatto", dettaglio: "Ogni fattura ricevuta ha la sua data" }
    : { chiave: "ricezione", titolo: "Date di ricezione degli acquisti", stato: "da_fare",
        dettaglio: `${plurale(d.acquistiSenzaRicezione, "fattura ricevuta è", "fatture ricevute sono")} senza data di ricezione SDI: la LIPE non sa in che mese detrarle. Dichiarala nel registro acquisti, oppure conferma quei mesi coi totali dei registri.`,
        azione: { etichetta: "Registro acquisti", vai: "ricezione" } });

  const emesse = d.senzaImporti.filter((x) => x.lato === "emesse").length;
  const ricevute = d.senzaImporti.length - emesse;
  passi.push(d.senzaImporti.length === 0
    ? { chiave: "documenti", titolo: "Documenti completi", stato: "fatto", dettaglio: "Imponibile e IVA su ogni fattura" }
    : { chiave: "documenti", titolo: "Documenti completi", stato: "avviso",
        dettaglio: `${[emesse ? plurale(emesse, "emessa", "emesse") : "", ricevute ? plurale(ricevute, "ricevuta", "ricevute") : ""].filter(Boolean).join(" e ")} col solo totale (${mesiInLettere(d.senzaImporti.map((x) => x.data))}): la loro IVA non è nelle scritture. Completale con l'XML, o conferma quei mesi coi totali dei registri.` });

  const finiti = d.periodicita ? periodiFiniti(anno, d.periodicita, oggi) : [];
  const confermate = new Set((d.lipe ?? []).map((l) => l.dal));
  const prossimo = finiti.find((p) => !confermate.has(p.dal));
  if (!d.impostazioniCompilate) {
    passi.push({ chiave: "lipe", titolo: "Liquidazioni periodiche (LIPE)", stato: "in_attesa", dettaglio: "Dopo le impostazioni" });
  } else if (d.lipe === null) {
    passi.push({ chiave: "lipe", titolo: "Liquidazioni periodiche (LIPE)", stato: "da_fare", dettaglio: "Conferma ogni periodo nella liquidazione periodica.",
      azione: { etichetta: "Apri", vai: "lipe" } });
  } else {
    const fatte = finiti.filter((p) => confermate.has(p.dal)).length;
    passi.push(prossimo
      ? { chiave: "lipe", titolo: "Liquidazioni periodiche (LIPE)", stato: "da_fare",
          dettaglio: `${fatte} di ${finiti.length} periodi confermati. Prossimo: ${prossimo.nome}.`,
          azione: { etichetta: `Conferma ${prossimo.nome.replace(` ${anno}`, "")}`, vai: "lipe" } }
      : { chiave: "lipe", titolo: "Liquidazioni periodiche (LIPE)", stato: "fatto",
          dettaglio: finiti.length ? `${finiti.length} di ${finiti.length} periodi confermati` : "Nessun periodo ancora finito" });
  }

  const nLipe = d.lipe?.length ?? 0;
  const daRegistrare = Math.max(0, nLipe - d.lipeRegistrate);
  passi.push(nLipe === 0
    ? { chiave: "contabilita", titolo: "Registrazione in contabilità", stato: "in_attesa", dettaglio: "Si registra la LIPE confermata" }
    : daRegistrare > 0
      ? { chiave: "contabilita", titolo: "Registrazione in contabilità", stato: "da_fare",
          dettaglio: `${plurale(daRegistrare, "LIPE confermata da registrare", "LIPE confermate da registrare")}: il giroconto porta l'IVA su Erario c/IVA.`,
          azione: { etichetta: "Registra", vai: "giroconto" } }
      : { chiave: "contabilita", titolo: "Registrazione in contabilità", stato: "fatto", dettaglio: `${plurale(nLipe, "liquidazione registrata", "liquidazioni registrate")}` });

  const lipeDaVersare = (d.lipe ?? []).filter((l) => l.daVersare).length;
  const f24 = d.f24Iva;
  const senzaF24 = f24 ? Math.max(0, lipeDaVersare - f24.daPagare - f24.pagati) : 0;
  passi.push(!f24 || (lipeDaVersare === 0 && f24.daPagare === 0)
    ? { chiave: "f24", titolo: "Versamenti F24", stato: nLipe === 0 ? "in_attesa" : "fatto", dettaglio: nLipe === 0 ? "Dopo la LIPE" : "Nessun F24 IVA da pagare" }
    : f24.daPagare + senzaF24 > 0
      ? { chiave: "f24", titolo: "Versamenti F24", stato: "da_fare",
          dettaglio: [f24.daPagare ? `${plurale(f24.daPagare, "F24 IVA da pagare", "F24 IVA da pagare")}` : "", senzaF24 ? `${plurale(senzaF24, "liquidazione da versare senza F24", "liquidazioni da versare senza F24")}` : ""].filter(Boolean).join(" · "),
          azione: { etichetta: "Apri F24", vai: "f24" } }
      : { chiave: "f24", titolo: "Versamenti F24", stato: "fatto", dettaglio: `${plurale(f24.pagati, "F24 IVA pagato", "F24 IVA pagati")}` });
  return passi;
}

/** Il primo passo da fare (gli avvisi non fermano il percorso). */
export function passoAttuale(passi: readonly PassoIva[]): PassoIva | undefined {
  return passi.find((p) => p.stato === "da_fare");
}
