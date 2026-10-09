/**
 * Codice di firma anche via SMS: il numero si normalizza, l'SMS parte solo con
 * credito e addebita una volta, e non rompe mai la firma.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Per percorso in una variabile: i moduli delle edge function non devono entrare nel controllo dei tipi dell'app.
const TEL = "../../../supabase/functions/_shared/telefonoE164";
const SMS = "../../../supabase/functions/_shared/inviaSmsFirma";
const { normalizzaTelefonoE164, mascheraTelefono } = await import(/* @vite-ignore */ TEL);
const { inviaSmsCodiceFirma, testoSmsCodice } = await import(/* @vite-ignore */ SMS);

describe("numero di telefono", () => {
  it.each([
    ["333 123 4567", "+393331234567"],
    ["+39 333 123 4567", "+393331234567"],
    ["0039 333 1234567", "+393331234567"],
    ["333-1234567", "+393331234567"],
    ["06 1234567", "+39061234567"],
    ["+44 7911 123456", "+447911123456"],
  ])("%s → %s", (grezzo, atteso) => expect(normalizzaTelefonoE164(grezzo)).toBe(atteso));

  it.each(["", null, undefined, "abc", "123", "+39 12", "33312"])("%s non è un numero", (x) => {
    expect(normalizzaTelefonoE164(x)).toBeNull();
  });

  it("si maschera senza poterlo ricostruire", () => {
    expect(mascheraTelefono("+393331234567")).toBe("+39*******567");
    expect(mascheraTelefono("boh")).toBeNull();
  });
});

type Tabelle = Record<string, Record<string, unknown> | null>;
function finto(tabelle: Tabelle, rpcEsito: unknown = { ok: true }) {
  const scritture: { tabella: string; tipo: string; dati: unknown }[] = [];
  const rpcChiamate: { nome: string; args: Record<string, unknown> }[] = [];
  const admin = {
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.limit = () => q;
      q.maybeSingle = async () => ({ data: tabelle[t] ?? null });
      q.single = async () => ({ data: { id: "msg-1" } });
      q.insert = (dati: unknown) => { scritture.push({ tabella: t, tipo: "insert", dati }); return q; };
      q.update = (dati: unknown) => { scritture.push({ tabella: t, tipo: "update", dati }); return q; };
      return q;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => { rpcChiamate.push({ nome, args }); return { data: [rpcEsito] }; },
  };
  return { admin, scritture, rpcChiamate };
}
const dati = { companyId: "c1", richiestaId: "r1", to: "+393331234567", otp: "482913", aziendaNome: "Renova Solution S.r.l." };

describe("SMS col codice", () => {
  // Le edge function girano su Deno: qui se ne simula solo l'ambiente.
  const conChiave = () => vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "TELNYX_MASTER_API_KEY" ? "k" : undefined) } });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("senza portafoglio o senza credito non parte e non chiama il provider", async () => {
    conChiave();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const wallet of [null, { crediti: 0.01, crediti_riservati: 0 }, { crediti: 1, crediti_riservati: 0.99 }]) {
      const { admin } = finto({ sms_pricing_config: { prezzo_per_sms: 0.06 }, sms_wallet: wallet });
      const esito = await inviaSmsCodiceFirma(admin, dati);
      expect(esito.inviato).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con credito manda un solo SMS, addebita una volta e non scrive il codice nel registro", async () => {
    conChiave();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: "tx-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { admin, scritture, rpcChiamate } = finto({ sms_pricing_config: { prezzo_per_sms: 0.06 }, sms_wallet: { crediti: 5, crediti_riservati: 0 } });
    const esito = await inviaSmsCodiceFirma(admin, dati);
    expect(esito).toEqual({ inviato: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const corpo = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(corpo.to).toBe("+393331234567");
    expect(corpo.text).toContain("482913");
    expect(corpo.from).toBe("RenovaSolut");
    expect(rpcChiamate).toHaveLength(1);
    expect(rpcChiamate[0].args).toMatchObject({ p_company_id: "c1", p_importo: 0.06, p_tipo: "addebito_sms" });
    const registro = scritture.find((s) => s.tabella === "sms_messages" && s.tipo === "insert")!.dati as { body: string; trigger_type: string; trigger_entity: string };
    expect(registro.body).not.toContain("482913");
    expect(registro.trigger_type).toBe("api");
    expect(registro.trigger_entity).toBe("documento");
  });

  it("se il provider rifiuta, niente addebito e la firma prosegue (esito negativo, nessuna eccezione)", async () => {
    conChiave();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("numero non valido", { status: 400 })));
    const { admin, rpcChiamate, scritture } = finto({ sms_pricing_config: { prezzo_per_sms: 0.06 }, sms_wallet: { crediti: 5, crediti_riservati: 0 } });
    const esito = await inviaSmsCodiceFirma(admin, dati);
    expect(esito).toEqual({ inviato: false, motivo: "Telnyx 400" });
    expect(rpcChiamate).toHaveLength(0);
    expect(scritture.some((s) => s.tipo === "update" && (s.dati as { status?: string }).status === "failed")).toBe(true);
  });

  it("un errore di rete non lancia", async () => {
    conChiave();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rete giù"); }));
    const { admin } = finto({ sms_pricing_config: { prezzo_per_sms: 0.06 }, sms_wallet: { crediti: 5, crediti_riservati: 0 } });
    await expect(inviaSmsCodiceFirma(admin, dati)).resolves.toMatchObject({ inviato: false });
  });

  // L'alfabeto GSM-7 di base (3GPP TS 23.038): un solo carattere fuori da qui e l'SMS passa a UCS-2, 70 caratteri per segmento.
  const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

  it("il testo sta in un solo SMS da 160 caratteri, tutto nell'alfabeto GSM-7, anche con un nome lungo e accentato", () => {
    const t = testoSmsCodice("482913", "Società Édile Più & Figli S.r.l. di Mario Rossi e Associati");
    expect(t.length).toBeLessThanOrEqual(160);
    expect([...t].filter((c) => !GSM7.includes(c))).toEqual([]);
    expect(t).toContain("482913");
  });

  it("dice «è il tuo codice», con l'accento", () => {
    expect(testoSmsCodice("482913", "Renova")).toMatch(/^482913 è il tuo codice per firmare il documento di Renova\./);
  });

  it("non raddoppia il punto dopo «S.r.l.»", () => {
    expect(testoSmsCodice("482913", "Renova Solution S.r.l.")).toContain("di Renova Solution S.r.l. Valido 10 minuti.");
    expect(testoSmsCodice("482913", "Renova")).toContain("di Renova. Valido 10 minuti.");
    expect(testoSmsCodice("482913", "Società Édile Più & Figli S.r.l. di Mario Rossi e Associati")).not.toContain("..");
  });

  it("il taglio del nome a 40 caratteri non lascia uno spazio prima del punto", () => {
    const t = testoSmsCodice("482913", `${"A".repeat(39)} BBBB`);
    expect(t).toContain(`di ${"A".repeat(39)}. Valido`);
  });

  it("senza un nome valido si dice «dell'azienda» (non «di l'azienda»)", () => {
    expect(testoSmsCodice("482913", "***")).toContain("il documento dell'azienda. Valido 10 minuti.");
  });
});

describe("collegamenti", () => {
  const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  it("genera-otp manda l'SMS in più, segna il canale e non rimanda un codice appena inviato", () => {
    const f = leggi("supabase/functions/fea-genera-otp/index.ts");
    expect(f).toContain("inviaSmsCodiceFirma(supabaseAdmin");
    expect(f).toContain("otp_canale");
    expect(f).toContain("gia_inviato");
  });
  it("il numero entra dalle tre porte: preventivi, fotovoltaico, schede in app", () => {
    expect(leggi("supabase/functions/send-quote-signature/index.ts")).toContain("signer_phone: normalizzaTelefonoE164(");
    expect(leggi("supabase/functions/fea-richiedi-firma/index.ts")).toContain("insertPayload.signer_phone");
    expect(leggi("src/components/marketing/preventivi/SendSignatureDialog.tsx")).toContain("recipientPhone");
    expect(leggi("src/components/moduli/InviaFirmaCard.tsx")).toContain("telefono.trim()");
  });
});
