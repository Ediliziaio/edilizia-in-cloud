import type { PagamentoCassa, PuntoVenditaCassa, ScontrinoCassa } from "../../../shared/cassaInCloud.ts";

const API = "https://api.cassanova.com";
const PAGINA = 100;
const MASSIMO_SCONTRINI = 5_000;
const FORMATO_ORA = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Rome",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export class ErroreCassa extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Oggetto = Record<string, unknown>;
const oggetto = (v: unknown): Oggetto =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Oggetto : {};
const stringa = (v: unknown, max: number) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const numero = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const intero = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : null;
const elenco = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const piva = (v: unknown) => stringa(v, 36)?.toUpperCase().replace(/[.\s-]+/g, "").replace(/^IT(?=\d{11}$)/, "") ?? null;

function rispostaInvalida(): never {
  throw new ErroreCassa("Cassa in Cloud ha restituito dati incompleti o incoerenti. Riprova l’importazione.", 502);
}

function mappaPagamento(v: unknown): PagamentoCassa {
  const p = oggetto(v);
  const tipo = stringa(p.paymentType, 40);
  const importo = numero(p.amount);
  if (!tipo || importo === null) rispostaInvalida();
  const personalizzato = oggetto(p.customPayment);
  return {
    tipo,
    importo,
    resto: numero(p.change),
    descrizione: stringa(personalizzato.description ?? oggetto(p.ticket).description, 120),
    differito: tipo === "DEFERRED" || personalizzato.collectableType === "UNCOLLECTED_SERVICES" ||
      personalizzato.collectableType === "UNCOLLECTED_GOODS",
  };
}

function mappaScontrino(v: unknown, punto: string, dal: string, al: string): ScontrinoCassa {
  const s = oggetto(v);
  const d = oggetto(s.document);
  const id = typeof s.id === "string" && s.id.length <= 128 ? s.id.trim() : "";
  const emissione = stringa(s.datetime, 64) ?? stringa(s.date, 64) ?? "";
  let locale = emissione.replace("T", " ");
  if (/T.*(?:Z|[+-]\d\d:?\d\d)$/i.test(emissione)) {
    const istante = new Date(emissione);
    if (!Number.isFinite(+istante)) rispostaInvalida();
    locale = FORMATO_ORA.format(istante);
  }
  // «date» è il giorno di emissione del fornitore e «datetime» precisa l'ora.
  const giornoFornitore = typeof s.date === "string" ? s.date.match(/^\d{4}-\d\d-\d\d(?=T|$)/)?.[0] : null;
  const data = giornoFornitore ?? locale.slice(0, 10);
  const totale = numero(d.amount);
  if (!id || intero(d.idSalesPoint) !== punto || totale === null ||
      !/^\d{4}-\d\d-\d\d(?: \d\d:\d\d:\d\d(?:\.\d+)?)?$/.test(locale) ||
      data < dal || data > al) rispostaInvalida();

  return {
    esterno_id: id,
    numero: intero(s.number),
    numero_z: intero(s.zNumber),
    data,
    ora: locale.length > 10 ? locale.slice(11, 19) : null,
    totale,
    resto: numero(d.change),
    pagamenti: elenco(d.payments).map(mappaPagamento),
    confermato: typeof d.confirmed === "boolean" ? d.confirmed : null,
    con_reso: elenco(d.rows).some((r) => oggetto(r).refund === true),
    con_fattura: [d.documentConnectionSources, d.documentConnectionDestinations]
      .some((connessioni) => elenco(oggetto(connessioni).invoices).length > 0),
  };
}

export class ClientCassaInCloud {
  private token: string | null = null;
  private readonly termine = Date.now() + 40_000;

  constructor(private readonly chiave: string, private readonly richiesta = fetch) {}

  private async json(path: string, init: RequestInit): Promise<Oggetto> {
    const timeout = Math.min(this.termine - Date.now(), 12_000);
    if (timeout <= 0) throw new ErroreCassa("Cassa in Cloud ha impiegato troppo tempo. Riprova con un periodo più breve.", 504);
    const response = await this.richiesta(API + path, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    }).catch(() => {
      throw new ErroreCassa("Cassa in Cloud non ha risposto. Riprova tra poco.", 502);
    });
    if (response.status === 429) {
      throw new ErroreCassa("Cassa in Cloud ha raggiunto il limite di richieste. Riprova fra qualche minuto.", 429);
    }
    if ((path === "/apikey/token" && response.status === 400) || response.status === 401) {
      throw new ErroreCassa("Chiave API Cassa in Cloud non valida o revocata. Verifica la chiave e ricollega il punto vendita.", 422);
    }
    if (response.status === 403) {
      throw new ErroreCassa("La chiave deve poter leggere i punti vendita e gli scontrini in Cassa in Cloud.", 422);
    }
    if (!response.ok) throw new ErroreCassa("Cassa in Cloud non è riuscita a completare la richiesta. Riprova tra poco.", 502);
    return oggetto(await response.json().catch(rispostaInvalida));
  }

  private async get(path: string) {
    if (!this.token) {
      const dati = await this.json("/apikey/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "*" },
        body: JSON.stringify({ apiKey: this.chiave }),
      });
      if (typeof dati.access_token !== "string" || !dati.access_token) rispostaInvalida();
      this.token = dati.access_token;
    }
    return this.json(path, {
      headers: { Authorization: `Bearer ${this.token}`, "X-Version": "1.0.0" },
    });
  }

  async puntiVendita(partiteIva: Array<string | null>): Promise<PuntoVenditaCassa[]> {
    const dati = await this.get("/salespoint");
    if (!Array.isArray(dati.salesPoint) || dati.totalCount !== dati.salesPoint.length) rispostaInvalida();
    const attese = partiteIva.map(piva).filter(Boolean);
    const ids = new Set<string>();
    return dati.salesPoint.map((v) => {
      const p = oggetto(v);
      const id = intero(p.id);
      if (!id || ids.has(id)) rispostaInvalida();
      ids.add(id);
      const iva = piva(p.vatNumber);
      const valuta = stringa(oggetto(p.currency).code, 12);
      return {
        id,
        nome: stringa(p.name, 160) ?? `Punto vendita ${id}`,
        citta: stringa(p.city, 100),
        partita_iva: iva,
        valuta: valuta && /^[A-Z]{3}$/.test(valuta) ? valuta : null,
        compatibile: !iva || !attese.length || attese.includes(iva),
      };
    });
  }

  private paginaScontrini(punto: string, dal: string, al: string, start: number, limit: number) {
    const query = new URLSearchParams({
      start: String(start),
      limit: String(limit),
      idsSalesPoint: JSON.stringify([Number(punto)]),
      datetimeFrom: JSON.stringify(dal),
      datetimeTo: JSON.stringify(al),
      sorts: JSON.stringify([{ key: "date", direction: 1 }]),
    });
    return this.get(`/documents/receipts?${query}`);
  }

  async verificaScontrini(punto: string, giorno: string) {
    const dati = await this.paginaScontrini(punto, giorno, giorno, 0, 1);
    if (!Array.isArray(dati.receipts) || typeof dati.totalCount !== "number" ||
        intero(dati.totalCount) === null || dati.receipts.length !== Math.min(1, dati.totalCount)) rispostaInvalida();
    if (dati.receipts.length) mappaScontrino(dati.receipts[0], punto, giorno, giorno);
  }

  async scontrini(punto: string, dal: string, al: string): Promise<ScontrinoCassa[]> {
    const righe: ScontrinoCassa[] = [];
    const ids = new Set<string>();
    let totale: number | null = null;
    do {
      const dati = await this.paginaScontrini(punto, dal, al, righe.length, PAGINA);
      if (!Array.isArray(dati.receipts) || typeof dati.totalCount !== "number" ||
          intero(dati.totalCount) === null) rispostaInvalida();
      totale ??= dati.totalCount;
      if (totale > MASSIMO_SCONTRINI) {
        throw new ErroreCassa("Il periodo contiene più di 5.000 scontrini. Riprova su un singolo giorno.", 422);
      }
      if (totale !== dati.totalCount || dati.receipts.length !== Math.min(PAGINA, totale - righe.length)) {
        rispostaInvalida();
      }
      for (const v of dati.receipts) {
        const riga = mappaScontrino(v, punto, dal, al);
        if (ids.has(riga.esterno_id)) rispostaInvalida();
        ids.add(riga.esterno_id);
        righe.push(riga);
      }
    } while (righe.length < totale);
    return righe;
  }
}
