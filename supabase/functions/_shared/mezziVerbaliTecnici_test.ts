import assert from "node:assert/strict";
import {
  registraVerbaleTecnico,
  normalizzaParametriVerbale,
  erroriParametriVerbale,
  validaPathVerbale,
} from "./mezziVerbaliTecnici.ts";
import { sha256Hex } from "./improntaDocumento.ts";
const company = "11111111-1111-4111-8111-111111111111",
  mezzo = "22222222-2222-4222-8222-222222222222",
  manutenzione = "33333333-3333-4333-8333-333333333333",
  richiesta = "44444444-4444-4444-8444-444444444444",
  tentativo = "55555555-5555-4555-8555-555555555555",
  doc = "66666666-6666-4666-8666-666666666666";
const origine = `${company}/${mezzo}/originale.pdf`;
const bytes = new TextEncoder().encode(
  "TEST ORIGINALE TECNICO, NESSUN DATO REALE",
);
const parametri = () =>
  normalizzaParametriVerbale({
    titolo: "TEST Verbale",
    categoria: "verifica_periodica",
    data_inizio: "2026-11-01",
    data_scadenza: "2027-11-01",
    conferma_tecnica: true,
  });
const input = () => ({
  companyId: company,
  mezzoId: mezzo,
  manutenzioneId: manutenzione,
  richiestaId: richiesta,
  impronta: "a".repeat(64),
  parametri: parametri(),
});
const ricevuta = (
  path = `${company}/${mezzo}/${richiesta}-77777777-7777-4777-8777-777777777777-vincente.pdf`,
) => ({
  id: richiesta,
  documento_id: doc,
  company_id: company,
  mezzo_id: mezzo,
  manutenzione_id: manutenzione,
  titolo: "TEST Verbale",
  categoria: "verifica_periodica",
  registrato_il: "2026-10-27T10:00:00Z",
  disponibile: true,
  copia_path: path,
  origine_path: "PRIVATO",
  fonte_snapshot: { note: "PRIVATE" },
});
function memoria(
  opzioni: {
    esistente?: boolean;
    fonteCambiata?: boolean;
    corrotta?: boolean;
    erroreFinale?: boolean;
    rispostaIncompleta?: boolean;
    ricevutaSenzaPath?: boolean;
    concorrente?: boolean;
    originaleAssente?: boolean;
    uploadFallito?: boolean;
    pathEstraneo?: boolean;
  } = {},
) {
  const store = new Map<string, Uint8Array>();
  const cancellati: string[] = [];
  let finali = 0,
    letture = 0;
  let argsFinale: Record<string, unknown> | undefined;
  const db = {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      if (nome === "mezzi_verbale_copia_esistente")
        return { data: opzioni.esistente ? ricevuta() : null, error: null };
      if (nome === "mezzi_verbale_fonte")
        return {
          data: {
            foto: {
              company_id: company,
              mezzo_id: mezzo,
              manutenzione_id: manutenzione,
              impronta: (opzioni.fonteCambiata ? "b" : "a").repeat(64),
              file_name: "test.pdf",
            },
            path: opzioni.pathEstraneo ? "altra/macchina/privato.pdf" : origine,
          },
          error: null,
        };
      assert.equal(nome, "mezzi_verbale_completa");
      finali++;
      argsFinale = args;
      if (opzioni.erroreFinale)
        return {
          data: null,
          error: { code: "40001", message: "Fonte cambiata durante copia" },
        };
      return {
        data: opzioni.rispostaIncompleta
          ? {}
          : opzioni.ricevutaSenzaPath
            ? { ...ricevuta(), copia_path: undefined }
            : ricevuta(
                opzioni.concorrente
                  ? `${company}/${mezzo}/${richiesta}-77777777-7777-4777-8777-777777777777-altro-tentativo.pdf`
                  : String(args._copia_path),
              ),
        error: null,
      };
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "mezzi-documenti");
        return {
          download: async (path: string) => {
            letture++;
            return {
              data:
                path === origine
                  ? opzioni.originaleAssente
                    ? null
                    : new Blob([new Uint8Array(bytes).buffer], {
                        type: "application/pdf",
                      })
                  : new Blob([
                      new Uint8Array(
                        opzioni.corrotta
                          ? new TextEncoder().encode("ALTERATO")
                          : store.get(path)!,
                      ).buffer,
                    ]),
              error: null,
            };
          },
          upload: async (
            path: string,
            b: Uint8Array,
            options: { upsert: boolean },
          ) => {
            assert.equal(options.upsert, false);
            store.set(path, new Uint8Array(b));
            return {
              error: opzioni.uploadFallito ? Error("Upload fallito") : null,
            };
          },
          remove: async (paths: string[]) => {
            for (const p of paths) {
              cancellati.push(p);
              store.delete(p);
            }
            return { error: null };
          },
        };
      },
    },
  };
  return {
    db,
    store,
    cancellati,
    finali: () => finali,
    letture: () => letture,
    argsFinale: () => argsFinale,
  };
}
Deno.test(
  "Verbale: classificazione esplicita e date coerenti, niente costi o note nel contratto",
  () => {
    assert.equal(erroriParametriVerbale(parametri()).length, 0);
    assert.ok(
      erroriParametriVerbale({ ...parametri(), conferma_tecnica: false })
        .length,
    );
    assert.ok(
      erroriParametriVerbale({ ...parametri(), categoria: "contratto" }).length,
    );
    assert.ok(
      erroriParametriVerbale({ ...parametri(), data_scadenza: "2026-02-30" })
        .length,
    );
    assert.ok(
      erroriParametriVerbale({ ...parametri(), data_scadenza: "2026-10-01" })
        .length,
    );
    assert.doesNotMatch(
      JSON.stringify(
        normalizzaParametriVerbale({
          ...parametri(),
          importo: 9999,
          file_path: "PRIVATO",
          note: "PRIVATE",
        }),
      ),
      /9999|PRIVATO|PRIVATE/,
    );
  },
);
Deno.test(
  "Verbale: copia indipendente, stessi byte, SHA e identità finale",
  async () => {
    const m = memoria();
    const r = await registraVerbaleTecnico(m.db, "autore", input(), tentativo);
    assert.equal(r.documento_id, doc);
    assert.equal(m.finali(), 1);
    const [path, copia] = [...m.store.entries()][0];
    assert.notEqual(path, origine);
    assert.ok(
      path.startsWith(`${company}/${mezzo}/${richiesta}-${tentativo}-`),
    );
    assert.deepEqual(copia, bytes);
    assert.equal(m.argsFinale()?._sha256, await sha256Hex(bytes));
    assert.doesNotMatch(
      JSON.stringify(r),
      /PRIVATO|PRIVATE|copia_path|origine_path/,
    );
  },
);
Deno.test(
  "Verbale: il ritentativo completato non rilegge né riscrive l’originale",
  async () => {
    const m = memoria({ esistente: true, originaleAssente: true });
    const r = await registraVerbaleTecnico(m.db, "autore", input(), tentativo);
    assert.equal(r.documento_id, doc);
    assert.equal(m.letture(), 0);
    assert.equal(m.store.size, 0);
    assert.equal(m.finali(), 0);
  },
);
Deno.test(
  "Verbale: fonte cambiata o path estraneo non producono copie",
  async () => {
    for (const op of [{ fonteCambiata: true }, { pathEstraneo: true }]) {
      const m = memoria(op);
      await assert.rejects(() =>
        registraVerbaleTecnico(m.db, "autore", input(), tentativo),
      );
      assert.equal(m.store.size, 0);
      assert.equal(m.finali(), 0);
    }
  },
);
Deno.test(
  "Verbale: originale mancante non registra un documento tecnico",
  async () => {
    const m = memoria({ originaleAssente: true });
    await assert.rejects(
      () => registraVerbaleTecnico(m.db, "autore", input(), tentativo),
      /Originale assente/,
    );
    assert.equal(m.finali(), 0);
    assert.equal(m.store.size, 0);
  },
);
Deno.test(
  "Verbale: copia corrotta o upload fallito ripuliscono solo il tentativo prima della finalizzazione",
  async () => {
    for (const op of [{ corrotta: true }, { uploadFallito: true }]) {
      const m = memoria(op);
      await assert.rejects(() =>
        registraVerbaleTecnico(m.db, "autore", input(), tentativo),
      );
      assert.equal(m.finali(), 0);
      assert.equal(m.store.size, 0);
      assert.equal(m.cancellati.length, 1);
      assert.notEqual(m.cancellati[0], origine);
    }
  },
);
Deno.test(
  "Verbale: dopo una risposta finale incerta conserva la copia per non cancellare un possibile commit",
  async () => {
    for (const op of [
      { erroreFinale: true },
      { rispostaIncompleta: true },
      { ricevutaSenzaPath: true },
    ]) {
      const m = memoria(op);
      await assert.rejects(() =>
        registraVerbaleTecnico(m.db, "autore", input(), tentativo),
      );
      assert.equal(m.finali(), 1);
      assert.equal(m.store.size, 1);
      assert.equal(m.cancellati.length, 0);
    }
  },
);
Deno.test(
  "Verbale: una registrazione concorrente restituisce il vincitore e rimuove solo il proprio tentativo",
  async () => {
    const m = memoria({ concorrente: true });
    const r = await registraVerbaleTecnico(m.db, "autore", input(), tentativo);
    assert.equal(r.documento_id, doc);
    assert.equal(m.store.size, 0);
    assert.equal(m.cancellati.length, 1);
    assert.notEqual(
      m.cancellati[0],
      `${company}/${mezzo}/${richiesta}-77777777-7777-4777-8777-777777777777-altro-tentativo.pdf`,
    );
  },
);
Deno.test(
  "Verbale: la validazione precede ogni chiamata al servizio",
  async () => {
    const m = memoria();
    await assert.rejects(() =>
      registraVerbaleTecnico(
        m.db,
        "autore",
        { ...input(), parametri: { ...parametri(), conferma_tecnica: false } },
        tentativo,
      ),
    );
    assert.equal(m.letture(), 0);
    assert.equal(m.finali(), 0);
    assert.throws(() =>
      validaPathVerbale(`${company}/${mezzo}/../privato`, company, mezzo),
    );
    assert.throws(() =>
      validaPathVerbale(`${company}/altro/test.pdf`, company, mezzo),
    );
  },
);
