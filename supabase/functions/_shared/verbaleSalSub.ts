import {
  type RigaLavoriSalSub,
  verificaRigheLavoriSalSub,
} from "./righeLavoriSalSub.ts";
import { type GaranziaSalSub, quadroGaranzieSalSub } from "./garanzieSalSub.ts";
/** Modello documentale: i valori economici arrivano solo dai record server. */
export type RigaSalSub = {
  id: string;
  company_id: string;
  contratto_id: string;
  order_id: string;
  subappaltatore_id: string;
  numero_sal: number;
  data_emissione: string;
  stato: string;
  importo_lordo: number;
  ritenuta_pct: number;
  ritenuta_importo: number;
  importo_netto: number;
  note: string | null;
  note_contestazione?: string | null;
  data_pagamento?: string | null;
  payment_reference?: string | null;
  payment_method?: string | null;
};
export type AllegatoSalSub = {
  id: string;
  titolo: string;
  file_name: string;
  file_path: string;
  stato: string;
  revisione: string | null;
  sha256: string;
  pagine: number;
  formato: string;
};
export type VerbaleSalSub = {
  versione: "sal-sub-verbale-1" | "sal-sub-verbale-2" | "sal-sub-verbale-3";
  generato_il: string;
  periodo_dal: string;
  periodo_al: string;
  nota_verbale: string;
  sal: RigaSalSub;
  contratto: {
    id: string;
    company_id: string;
    order_id: string;
    subappaltatore_id: string;
    numero_contratto: string | null;
    descrizione_lavori: string;
    importo_contrattuale: number;
    oneri_sicurezza: number;
    modalita_pagamento: string | null;
    responsabile_impresa: string | null;
    referente_subappaltatore: string | null;
    ritenuta_garanzia_pct?: number;
    durata_garanzia_mesi?: number;
    garanzie?: string | null;
    data_fine_effettiva?: string | null;
    data_fine_prevista?: string | null;
  };
  impresa: {
    ragione_sociale: string;
    partita_iva: string | null;
    indirizzo: string;
  };
  sub: {
    ragione_sociale: string;
    piva: string | null;
    indirizzo: string | null;
    responsabile: string | null;
  };
  commessa: {
    id: string;
    company_id: string;
    order_code: string | null;
    description: string | null;
    work_address: string | null;
  };
  precedenti: Array<
    Pick<
      RigaSalSub,
      | "id"
      | "numero_sal"
      | "stato"
      | "importo_lordo"
      | "importo_netto"
      | "ritenuta_importo"
    >
  >;
  allegati: AllegatoSalSub[];
  garanzie?: GaranziaSalSub[];
  garanzie_non_attribuite?: number;
  lavori?: RigaLavoriSalSub[];
};
const cent = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > 1e11) {
    throw new Error("Importo SAL non valido");
  }
  return Math.round(n * 100);
};
export function verificaVerbaleSalSub(d: VerbaleSalSub) {
  if (JSON.stringify(d).length > 200000) {
    throw new Error("Contenuto del verbale troppo esteso");
  }
  if (
    !["sal-sub-verbale-1", "sal-sub-verbale-2", "sal-sub-verbale-3"].includes(
      d.versione,
    )
  ) {
    throw new Error("Versione verbale non supportata");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d.periodo_dal) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.periodo_al) || d.periodo_dal > d.periodo_al ||
    [d.periodo_dal, d.periodo_al].some((x) =>
      !Number.isFinite(Date.parse(x)) ||
      new Date(x).toISOString().slice(0, 10) !== x
    )
  ) throw new Error("Periodo del verbale non valido");
  if (
    d.sal.company_id !== d.contratto.company_id ||
    d.sal.company_id !== d.commessa.company_id ||
    d.sal.contratto_id !== d.contratto.id ||
    d.sal.order_id !== d.contratto.order_id ||
    d.sal.order_id !== d.commessa.id ||
    d.sal.subappaltatore_id !== d.contratto.subappaltatore_id
  ) throw new Error("SAL e contratto non appartengono allo stesso contesto");
  if (
    !["ricevuto", "verificato", "pagato", "contestato"].includes(d.sal.stato) ||
    !Number.isInteger(d.sal.numero_sal) || d.sal.numero_sal < 1
  ) throw new Error("Stato o numero SAL non valido");
  if (
    cent(d.contratto.importo_contrattuale) < 0 ||
    cent(d.contratto.oneri_sicurezza) < 0 ||
    !Number.isFinite(Date.parse(d.generato_il))
  ) throw new Error("Dati contrattuali o data non validi");
  const lordo = cent(d.sal.importo_lordo),
    rit = cent(d.sal.ritenuta_importo),
    netto = cent(d.sal.importo_netto),
    pct = Number(d.sal.ritenuta_pct);
  if (
    lordo < 0 || rit < 0 || netto < 0 || !Number.isFinite(pct) || pct < 0 ||
    pct > 100 || Math.abs(lordo - rit - netto) > 1 ||
    Math.abs(Math.round(lordo * pct / 100) - rit) > 1
  ) {
    throw new Error(
      "Importi o ritenuta SAL incoerenti: correggi il record prima di generare",
    );
  }
  if (
    !d.impresa.ragione_sociale.trim() || !d.sub.ragione_sociale.trim() ||
    !d.contratto.descrizione_lavori.trim()
  ) {
    throw new Error(
      "Completa impresa, subappaltatore e descrizione contrattuale",
    );
  }
  if (
    d.precedenti.some((s) => s.numero_sal >= d.sal.numero_sal) ||
    new Set([...d.precedenti.map((s) => s.numero_sal), d.sal.numero_sal])
        .size !== d.precedenti.length + 1
  ) throw new Error("Numerazione SAL duplicata o storico incoerente");
  if (d.nota_verbale.length > 6000 || d.allegati.length > 10) {
    throw new Error("Verbale oltre i limiti consentiti");
  }
  for (const g of d.garanzie ?? []) {
    if (
      g.company_id !== d.sal.company_id || g.contratto_id !== d.contratto.id ||
      (g.order_id && g.order_id !== d.commessa.id)
    ) throw Error("Garanzia fuori dal contesto del verbale");
  }
  const garanzie = quadroGaranzieSalSub(d.sal, d.precedenti, d.garanzie);
  if (d.versione !== "sal-sub-verbale-1" && !d.garanzie) {
    throw Error("Registro garanzie non acquisito");
  }
  verificaRigheLavoriSalSub(
    d.lavori ?? [],
    lordo / 100,
    d.periodo_dal,
    d.periodo_al,
  );
  const precedenti = d.precedenti.filter((s) =>
    ["verificato", "pagato"].includes(s.stato)
  );
  return {
    lordo: lordo / 100,
    ritenuta: rit / 100,
    netto: netto / 100,
    precedenteRiconosciuto:
      precedenti.reduce((t, s) => t + cent(s.importo_lordo), 0) / 100,
    cumulativoRiconosciuto:
      (precedenti.reduce((t, s) => t + cent(s.importo_lordo), 0) +
        (["verificato", "pagato"].includes(d.sal.stato) ? lordo : 0)) / 100,
    garanzie,
    bozza: !["verificato", "pagato"].includes(d.sal.stato),
  };
}

/**
 * Benestare alla fatturazione: dice al subappaltatore se e per quanto può
 * emettere fattura per questo SAL. Solo un SAL verificato dall'impresa lo
 * autorizza; ricevuto o contestato no, pagato vuol dire che la fattura doveva
 * già esserci. Si fattura il netto del SAL: la ritenuta di garanzia si fattura
 * quando viene svincolata.
 */
export function benestareFatturazione(d: VerbaleSalSub, r: { lordo: number; ritenuta: number; netto: number }) {
  // «always»: senza, in italiano 9500 resta senza punto delle migliaia.
  const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions);
  const rif = [
    d.contratto.numero_contratto ? `Contratto n. ${d.contratto.numero_contratto}` : "Contratto di subappalto",
    `SAL n. ${d.sal.numero_sal}`,
    d.commessa.order_code ? `commessa ${d.commessa.order_code}` : null,
  ].filter(Boolean).join(" · ");
  if (d.sal.stato === "verificato") {
    return {
      autorizzato: true,
      titolo: "Benestare alla fatturazione",
      testo: `L'impresa affidataria ${d.impresa.ragione_sociale} ha verificato i lavori di questo SAL e autorizza ${d.sub.ragione_sociale} a emettere fattura per l'imponibile di ${euro(r.netto)}.`,
      righe: [
        ["Lavori del SAL (lordo)", euro(r.lordo)],
        [`Ritenuta di garanzia ${d.sal.ritenuta_pct}% (si fattura allo svincolo)`, `− ${euro(r.ritenuta)}`],
        ["Imponibile da fatturare", euro(r.netto)],
      ] as Array<[string, string]>,
      istruzioni: [
        `Intestazione: ${d.impresa.ragione_sociale}${d.impresa.partita_iva ? `, P.IVA ${d.impresa.partita_iva}` : ""}.`,
        `Causale da riportare in fattura: ${rif}.`,
        "IVA: nei subappalti del settore edile si applica di norma l'inversione contabile (art. 17, c. 6, lett. a, DPR 633/72): fattura senza IVA con l'annotazione «inversione contabile», salvo diverso regime indicato nel contratto.",
        d.contratto.modalita_pagamento ? `Pagamento: ${d.contratto.modalita_pagamento}.` : "Pagamento secondo le condizioni del contratto.",
      ],
    };
  }
  if (d.sal.stato === "pagato") {
    return {
      autorizzato: false,
      titolo: "Fatturazione",
      testo: `Il SAL risulta già pagato: la fattura per ${euro(r.netto)} doveva essere già emessa con riferimento ${rif}. Questo verbale non autorizza una seconda fattura.`,
      righe: [] as Array<[string, string]>,
      istruzioni: [] as string[],
    };
  }
  return {
    autorizzato: false,
    titolo: "Fatturazione non ancora autorizzata",
    testo: d.sal.stato === "contestato"
      ? "Il SAL è contestato: la fattura non va emessa finché la contestazione non è risolta e il SAL verificato dall'impresa."
      : "Il SAL è ricevuto ma non ancora verificato dall'impresa: la fattura non va emessa prima della verifica.",
    righe: [] as Array<[string, string]>,
    istruzioni: [] as string[],
  };
}
