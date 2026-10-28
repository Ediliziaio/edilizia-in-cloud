import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type VerbaleSalSub,
  verificaVerbaleSalSub,
} from "../_shared/verbaleSalSub.ts";
import { pdfVerbaleSalSub } from "../_shared/verbaleSalSubPdf.ts";
import { PDFDocument } from "pdf-lib";
import { creaGestore } from "./handler.ts";
import { unzipSync } from "fflate";
const id = (n: number) =>
  `ca271027-0000-4000-a000-${String(n).padStart(12, "0")}`;
export const esempio = (): VerbaleSalSub => ({
  versione: "sal-sub-verbale-1",
  generato_il: "2026-10-27T18:30:00Z",
  periodo_dal: "2026-10-01",
  periodo_al: "2026-10-27",
  nota_verbale:
    "ESEMPIO DEMO: nessun lavoro, pagamento o controllo reale. Riserve da verificare.",
  impresa: {
    ragione_sociale: "Impresa DEMO Alfa",
    partita_iva: "99999999999",
    indirizzo: "Indirizzo dimostrativo",
  },
  sub: {
    ragione_sociale: "Subappaltatore DEMO Beta",
    piva: null,
    indirizzo: "Sede dimostrativa",
    responsabile: "Referente DEMO",
  },
  commessa: {
    id: id(4),
    company_id: id(1),
    order_code: "COLLAUDO-SAL-2710",
    description: "Ristrutturazione dimostrativa",
    work_address: "Cantiere fittizio",
  },
  contratto: {
    id: id(3),
    company_id: id(1),
    order_id: id(4),
    subappaltatore_id: id(5),
    numero_contratto: "SUB-DEMO-01",
    descrizione_lavori:
      "ESEMPIO: posa serramenti al piano terra. Lavori non eseguiti in questa dimostrazione.",
    importo_contrattuale: 20000,
    oneri_sicurezza: 500,
    modalita_pagamento:
      "Esempio: SAL mensili; condizioni da confermare nel contratto reale.",
    responsabile_impresa: "Responsabile DEMO",
    referente_subappaltatore: "Referente DEMO",
  },
  sal: {
    id: id(2),
    company_id: id(1),
    contratto_id: id(3),
    order_id: id(4),
    subappaltatore_id: id(5),
    numero_sal: 2,
    data_emissione: "2026-10-27",
    stato: "ricevuto",
    importo_lordo: 4000,
    ritenuta_pct: 5,
    ritenuta_importo: 200,
    importo_netto: 3800,
    note: "Importi sintetici; nessuna attestazione di esecuzione.",
  },
  precedenti: [{
    id: id(9),
    numero_sal: 1,
    stato: "verificato",
    importo_lordo: 5000,
    importo_netto: 4750,
    ritenuta_importo: 250,
  }],
  allegati: [],
});
Deno.test("modello: ricevuto non è riconosciuto e non dichiara pagamento", () => {
  const r = verificaVerbaleSalSub(esempio());
  assertEquals(r.bozza, true);
  assertEquals(r.cumulativoRiconosciuto, 5000);
  assertEquals(r.netto, 3800);
});
Deno.test("modello: verificato aggiunge soltanto il periodo al precedente", () => {
  const d = esempio();
  d.sal.stato = "verificato";
  assertEquals(verificaVerbaleSalSub(d).cumulativoRiconosciuto, 9000);
});
Deno.test("modello: contestato non entra nel cumulativo", () => {
  const d = esempio();
  d.sal.stato = "contestato";
  assertEquals(verificaVerbaleSalSub(d).cumulativoRiconosciuto, 5000);
});
Deno.test("modello: zero percento di ritenuta è ammesso", () => {
  const d = esempio();
  d.sal.ritenuta_pct = 0;
  d.sal.ritenuta_importo = 0;
  d.sal.importo_netto = 4000;
  assertEquals(verificaVerbaleSalSub(d).netto, 4000);
});
for (
  const [nome, modifica] of [
    ["netto incoerente", (d: VerbaleSalSub) => d.sal.importo_netto = 3900],
    ["ritenuta oltre 100", (d: VerbaleSalSub) => d.sal.ritenuta_pct = 120],
    ["azienda diversa", (d: VerbaleSalSub) => d.contratto.company_id = id(99)],
    [
      "sub diverso",
      (d: VerbaleSalSub) => d.contratto.subappaltatore_id = id(99),
    ],
    [
      "numero duplicato",
      (d: VerbaleSalSub) => d.precedenti.push({ ...d.precedenti[0] }),
    ],
    ["periodo invertito", (d: VerbaleSalSub) => d.periodo_dal = "2026-12-01"],
    ["giorno inesistente", (d: VerbaleSalSub) => d.periodo_dal = "2026-02-30"],
    ["importo non finito", (d: VerbaleSalSub) => d.sal.importo_lordo = NaN],
  ] as const
) {
  Deno.test(`modello rifiuta ${nome}`, () => {
    const d = esempio();
    modifica(d);
    assertThrows(() => verificaVerbaleSalSub(d));
  });
}
Deno.test("PDF reale multipagina con accenti, note lunghe e stato bozza", async () => {
  const d = esempio();
  d.nota_verbale = "Riserve: qualità, quantità e condizioni da verificare. "
    .repeat(90);
  const b = await pdfVerbaleSalSub(d);
  assertEquals(new TextDecoder().decode(b.slice(0, 5)), "%PDF-");
  const p = await PDFDocument.load(b);
  assert(p.getPageCount() >= 2);
});

function finto(
  opzioni: {
    permesso?: boolean;
    accesso?: boolean;
    noAuth?: boolean;
    write?: boolean;
    foreign?: boolean;
    docs?: boolean;
    salErr?: boolean;
    uploadErr?: boolean;
    tableErr?: boolean;
  } = {},
) {
  const d = esempio();
  const uploaded = new Map<string, Uint8Array>();
  const rows: any[] = [];
  const chiamate: string[] = [];
  const tables: Record<string, any[]> = {
    sal_subappaltatori: [
      d.sal,
      ...d.precedenti.map((s) => ({
        ...s,
        company_id: id(1),
        contratto_id: id(3),
      })),
    ],
    contratti_subappalto: [d.contratto],
    orders: [d.commessa],
    anagrafica_azienda: [{
      company_id: id(1),
      ragione_sociale: d.impresa.ragione_sociale,
      partita_iva: d.impresa.partita_iva,
      indirizzo_via: "Sede DEMO",
    }],
    subappaltatori_sicurezza: [{ id: id(5), company_id: id(1), ...d.sub }],
    sal_sub_verbali: rows,
    sicurezza_fascicolo: [],
    ritenute_garanzia: [],
  };
  const db: any = {
    auth: {
      getUser: async () => ({
        error: opzioni.noAuth ? {} : null,
        data: { user: opzioni.noAuth ? null : { id: id(8) } },
      }),
    },
    rpc: async (_: string, a: any) => ({
      error: null,
      data: opzioni.permesso !== false &&
        (a._permission !== "can_edit_orders" || opzioni.write !== false),
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, b: Uint8Array) => {
          chiamate.push("upload");
          if (opzioni.uploadErr) return { error: {} };
          uploaded.set(path, b);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          paths.forEach((x) => uploaded.delete(x));
          return { error: null };
        },
        download: async (path: string) => ({
          data: uploaded.has(path)
            ? new Blob([new Uint8Array(uploaded.get(path)!).buffer])
            : null,
          error: uploaded.has(path) ? null : {},
        }),
        createSignedUrl: async (path: string) => ({
          error: null,
          data: { signedUrl: `https://example.invalid/${bucket}/${path}` },
        }),
      }),
    },
    from: (table: string) => {
      let data = [...(tables[table] ?? [])];
      let insert: any = null;
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => {
          data = data.filter((x) => x[k] === v);
          return q;
        },
        is: (k: string, v: any) => {
          data = data.filter((x) => (x[k] ?? null) === v);
          return q;
        },
        in: (k: string, vs: any[]) => {
          data = data.filter((x) => vs.includes(x[k]));
          return q;
        },
        lte: (k: string, v: number) => {
          data = data.filter((x) => x[k] <= v);
          return q;
        },
        order: () => q,
        limit: () => q,
        insert: (r: any) => {
          insert = r;
          return q;
        },
        maybeSingle: async () => ({
          error: opzioni.salErr && table === "sal_subappaltatori" ? {} : null,
          data: opzioni.foreign && table === "contratti_subappalto"
            ? null
            : data[0] ?? null,
        }),
        single: async () => {
          if (opzioni.tableErr) return { error: { code: "FAIL" }, data: null };
          if (insert) {
            const r = { ...insert, created_at: new Date().toISOString() };
            rows.push(r);
            chiamate.push("insert");
            return { error: null, data: r };
          }
          return { error: null, data: data[0] };
        },
        then: (fn: any) => Promise.resolve({ data, error: null }).then(fn),
      };
      return q;
    },
  };
  const handler = creaGestore({
    client: (() => db) as any,
    accesso: async () => {
      if (opzioni.accesso === false) throw new Error("no");
    },
    pdf: pdfVerbaleSalSub,
  });
  const body: any = {
    mode: "anteprima",
    company_id: id(1),
    sal_id: id(2),
    richiesta_id: id(6),
    periodo_dal: "2026-10-01",
    periodo_al: "2026-10-27",
    nota_verbale: "Solo DEMO",
    allegati: [],
  };
  return {
    d,
    tables,
    rows,
    uploaded,
    chiamate,
    body,
    run: (extra: any = {}) =>
      handler(
        new Request("https://example.invalid/genera", {
          method: "POST",
          headers: { Authorization: "Bearer TEST" },
          body: JSON.stringify({ ...body, ...extra }),
        }),
      ),
  };
}
Deno.test("handler: anteprima non scrive file o record", async () => {
  const h = finto();
  const r = await h.run();
  assertEquals(r.status, 200);
  const d = await r.json();
  assert(d.pdf_base64 && d.anteprima_sha256);
  assertEquals(h.rows.length, 0);
  assertEquals(h.uploaded.size, 0);
});
for (
  const [nome, opzioni, codice] of [
    ["sessione", { noAuth: true }, 401],
    ["azienda", { accesso: false }, 403],
    ["permessi", { permesso: false }, 403],
    ["contratto estraneo", { foreign: true }, 404],
    ["errore fonte", { salErr: true }, 503],
  ] as const
) {
  Deno.test(`handler nega ${nome}`, async () => {
    const h = finto(opzioni);
    assertEquals((await h.run()).status, codice);
    assertEquals(h.uploaded.size, 0);
  });
}
Deno.test("handler: senza anteprima coerente non archivia", async () => {
  const h = finto();
  assertEquals((await h.run({ mode: "archivia" })).status, 409);
  assertEquals(h.uploaded.size, 0);
});
Deno.test("handler: sola consultazione non archivia", async () => {
  const h = finto({ write: false });
  assertEquals((await h.run({ mode: "archivia" })).status, 403);
});
Deno.test("handler: archivia originale e ZIP, il ritentativo non duplica", async () => {
  const h = finto();
  const preview = await (await h.run()).json();
  const r = await h.run({
    mode: "archivia",
    anteprima_sha256: preview.anteprima_sha256,
  });
  assertEquals(r.status, 200);
  assertEquals(h.rows.length, 1);
  assertEquals(h.uploaded.size, 2);
  const again = await h.run({
    mode: "archivia",
    anteprima_sha256: preview.anteprima_sha256,
  });
  assertEquals(again.status, 200);
  assertEquals(h.rows.length, 1);
  const open = await h.run({ mode: "apri", verbale_id: h.rows[0].id });
  assertEquals(open.status, 200);
});
Deno.test("handler: cambio dati dopo anteprima blocca l'archiviazione", async () => {
  const h = finto();
  const preview = await (await h.run()).json();
  h.d.contratto.descrizione_lavori = "Modifica dopo anteprima";
  assertEquals(
    (await h.run({
      mode: "archivia",
      anteprima_sha256: preview.anteprima_sha256,
    })).status,
    409,
  );
  assertEquals(h.rows.length, 0);
});
Deno.test("handler: fallimento record rimuove solo i file creati dalla richiesta", async () => {
  const h = finto({ tableErr: true });
  const preview = await (await h.run()).json();
  assertEquals(
    (await h.run({
      mode: "archivia",
      anteprima_sha256: preview.anteprima_sha256,
    })).status,
    503,
  );
  assertEquals(h.uploaded.size, 0);
});
Deno.test("handler: originale alterato non viene aperto", async () => {
  const h = finto();
  const preview = await (await h.run()).json();
  await h.run({ mode: "archivia", anteprima_sha256: preview.anteprima_sha256 });
  h.uploaded.set(h.rows[0].pdf_path, new Uint8Array([1, 2, 3]));
  assertEquals(
    (await h.run({ mode: "apri", verbale_id: h.rows[0].id })).status,
    409,
  );
});

Deno.test("handler: accoda PDF e PNG e conserva gli originali byte per byte nello ZIP", async () => {
  const h = finto();
  const source = await PDFDocument.create();
  source.addPage();
  source.addPage();
  const pdf = await source.save();
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  for (const [n, bytes] of [[20, pdf], [21, png]] as const) {
    const path = `${id(1)}/demo-${n}`;
    h.uploaded.set(path, bytes);
    h.tables.sicurezza_fascicolo.push({
      id: id(n),
      company_id: id(1),
      order_id: id(4),
      subappaltatore_id: id(5),
      tipo: "verbale",
      titolo: `Evidenza DEMO ${n}`,
      file_name: `demo-${n}`,
      file_path: path,
      stato: "da_verificare",
      revisione: 0,
    });
  }
  const allegati = [id(20), id(21)];
  const preview = await (await h.run({ allegati })).json();
  assert(preview.pdf_base64, JSON.stringify(preview));
  const cover = await (await h.run()).json();
  const pages = async (b: string) =>
    (await PDFDocument.load(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))))
      .getPageCount();
  assert(
    (await pages(preview.pdf_base64)) >= (await pages(cover.pdf_base64)) + 3,
  );
  const result = await h.run({
    mode: "archivia",
    allegati,
    anteprima_sha256: preview.anteprima_sha256,
  });
  assertEquals(result.status, 200);
  const files = unzipSync(h.uploaded.get(h.rows[0].pacchetto_path)!);
  assertEquals(files[`allegati/1-${id(20)}.pdf`], pdf);
  assertEquals(files[`allegati/2-${id(21)}.png`], png);
  assertEquals(h.rows[0].snapshot.allegati.length, 2);
});
Deno.test("handler: allegati di altra commessa e file non supportati sono rifiutati", async () => {
  const h = finto();
  const doc = {
    id: id(20),
    company_id: id(1),
    order_id: id(99),
    subappaltatore_id: id(5),
    tipo: "verbale",
    titolo: "DEMO",
    file_path: `${id(1)}/demo`,
  };
  h.tables.sicurezza_fascicolo.push(doc);
  assertEquals((await h.run({ allegati: [id(20)] })).status, 403);
  doc.order_id = id(4);
  h.uploaded.set(doc.file_path, new TextEncoder().encode("not a PDF"));
  assertEquals((await h.run({ allegati: [id(20)] })).status, 400);
  assertEquals(h.rows.length, 0);
});

Deno.test("garanzie: trattenute e svincoli restano separati dal netto e dai pagamenti", () => {
  const d = esempio();
  d.sal.stato = "verificato";
  d.garanzie = [garanzia(20, d.sal.id, 200), {
    ...garanzia(21, id(9), 250),
    stato: "svincolata",
    data_svincolo_effettiva: "2026-10-25",
  }];
  const r = verificaVerbaleSalSub(d);
  assertEquals(r.garanzie.trattenute, 200);
  assertEquals(r.garanzie.svincolate, 250);
  assertEquals(r.garanzie.maturate, 450);
  assertEquals(r.netto, 3800);
  assertEquals(r.garanzie.avvisi, []);
});
function garanzia(n: number, sal_id: string, importo: number) {
  return {
    id: id(n),
    company_id: id(1),
    contratto_id: id(3),
    order_id: id(4),
    sal_id,
    importo,
    stato: "trattenuta",
    data_svincolo_prevista: null,
    data_svincolo_effettiva: null,
    fideiussione: false,
    note: null,
  };
}
Deno.test("garanzie: ricevuto e contestato non maturano ritenute riconosciute", () => {
  const d = esempio();
  d.garanzie = [garanzia(20, d.sal.id, 200), garanzia(21, id(9), 250)];
  assertEquals(verificaVerbaleSalSub(d).garanzie.trattenute, 250);
  d.sal.stato = "contestato";
  d.garanzie[0].stato = "annullata";
  assertEquals(verificaVerbaleSalSub(d).garanzie.trattenute, 250);
  assertEquals(verificaVerbaleSalSub(d).garanzie.avvisi, []);
});
Deno.test("garanzie: fideiussioni non sono cassa trattenuta e non cambiano il netto", () => {
  const d = esempio();
  d.sal.stato = "pagato";
  d.garanzie = [
    { ...garanzia(20, d.sal.id, 200), fideiussione: true },
    garanzia(21, id(9), 250),
  ];
  const r = verificaVerbaleSalSub(d);
  assertEquals(r.garanzie.trattenute, 250);
  assertEquals(r.garanzie.fideiussioni, 200);
  assertEquals(r.netto, 3800);
});
Deno.test("garanzie: registro incompleto avvisa senza inventare svincoli o residui", () => {
  const d = esempio();
  d.garanzie = [];
  const r = verificaVerbaleSalSub(d);
  assertEquals(r.garanzie.avvisi.length, 2);
  assertEquals(r.garanzie.svincolate, 0);
});
Deno.test("garanzie: contesto estraneo, duplicati e importi negativi sono rifiutati", () => {
  const d = esempio();
  d.garanzie = [garanzia(20, d.sal.id, 200)];
  d.garanzie[0].company_id = id(99);
  assertThrows(() => verificaVerbaleSalSub(d));
  d.garanzie[0].company_id = id(1);
  d.garanzie.push({ ...d.garanzie[0] });
  assertThrows(() => verificaVerbaleSalSub(d));
  d.garanzie.pop();
  d.garanzie[0].importo = -1;
  assertThrows(() => verificaVerbaleSalSub(d));
});
Deno.test("handler: svincolo cambiato dopo l'anteprima richiede una nuova verifica", async () => {
  const h = finto();
  h.tables.ritenute_garanzia.push({
    ...garanzia(20, h.d.sal.id, 200),
    direzione: "passiva",
  });
  const p = await (await h.run()).json();
  assert(p.pdf_base64);
  h.tables.ritenute_garanzia[0].stato = "svincolata";
  h.tables.ritenute_garanzia[0].data_svincolo_effettiva = "2026-10-27";
  assertEquals(
    (await h.run({ mode: "archivia", anteprima_sha256: p.anteprima_sha256 }))
      .status,
    409,
  );
  assertEquals(h.rows.length, 0);
});

function fonteMisurata(h: ReturnType<typeof finto>) {
  const qid = id(30), vid = id(31);
  h.tables.subappalto_quadri_lavori = [{
    id: qid,
    company_id: id(1),
    contratto_id: id(3),
    revisione: 1,
    voci: [{
      id: vid,
      descrizione: "Lavoro DEMO a corpo",
      base: "corpo",
      unita: "quota",
      quantita: 1,
      prezzo: 20000,
    }],
  }];
  h.tables.subappalto_misure = [{
    id: id(32),
    company_id: id(1),
    contratto_id: id(3),
    sal_id: h.d.sal.id,
    quadro_id: qid,
    voce_id: vid,
    data_rilievo: "2026-10-27",
    quantita_dichiarata: .3,
    quantita_riconosciuta: .2,
    prezzo_unitario: 20000,
    importo_riconosciuto: 4000,
    stato: "riconosciuta",
    riferimento: "Rilievo DEMO fonte",
    nota_verifica: "Verifica DEMO parziale",
    verificato_da: id(8),
    verificato_il: "2026-10-27T10:00:00Z",
  }];
  return h.tables.subappalto_misure[0];
}
Deno.test("handler: il verbale acquisisce misure riconosciute, prezzi e base lavori immutabile", async () => {
  const h = finto();
  fonteMisurata(h);
  const p = await (await h.run()).json();
  assert(p.pdf_base64, JSON.stringify(p));
  assertEquals(
    (await h.run({ mode: "archivia", anteprima_sha256: p.anteprima_sha256 }))
      .status,
    200,
  );
  assertEquals(h.rows[0].snapshot.versione, "sal-sub-verbale-3");
  assertEquals(h.rows[0].snapshot.lavori[0].quantita_dichiarata, .3);
  assertEquals(h.rows[0].snapshot.lavori[0].quantita_riconosciuta, .2);
  assertEquals(h.rows[0].snapshot.lavori[0].importo, 4000);
});
Deno.test("handler: misura non riconosciuta e base estranea non diventano righe del verbale", async () => {
  const h = finto();
  const m = fonteMisurata(h);
  m.stato = "dichiarata";
  assertEquals((await h.run()).status, 409);
  m.stato = "riconosciuta";
  h.tables.subappalto_quadri_lavori[0].company_id = id(99);
  assertEquals((await h.run()).status, 409);
});
Deno.test("handler: periodo fuori dalle rilevazioni e totale misure incoerente sono rifiutati", async () => {
  const h = finto();
  const m = fonteMisurata(h);
  assertEquals((await h.run({ periodo_al: "2026-10-20" })).status, 400);
  m.importo_riconosciuto = 3999;
  assertEquals((await h.run()).status, 400);
});
Deno.test("handler: un cambiamento del riscontro dopo anteprima richiede una nuova verifica", async () => {
  const h = finto();
  const m = fonteMisurata(h);
  const p = await (await h.run()).json();
  m.nota_verifica = "Riferimento di verifica cambiato";
  assertEquals(
    (await h.run({ mode: "archivia", anteprima_sha256: p.anteprima_sha256 }))
      .status,
    409,
  );
});
