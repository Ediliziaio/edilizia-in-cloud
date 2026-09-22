/**
 * La Posta dell'Outreach divisa per brand e per tipo di risposta (22/09/2026).
 * Florin non riusciva a separare i brand né a capire le risposte: 57 risposte
 * (un terzo automatiche) sepolte sotto centinaia di email appena inviate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  abbiamoRisposto,
  chiaveConversazione,
  contaPerBrand,
  contaPosta,
  type ConversazionePosta,
  daRispondere,
  filtraPosta,
  type MessaggioPosta,
  SENZA_BRAND,
  tintaBrand,
  tipoConversazione,
} from "../../components/admin/outreach/postaViste";

const ROOT = join(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

const noi: MessaggioPosta = { direction: "out", intent: null };
const lui = (intent: string | null = null): MessaggioPosta => ({ direction: "in", intent });

describe("tipoConversazione", () => {
  it("solo email nostre: inviata", () => {
    expect(tipoConversazione([noi, noi])).toBe("inviata");
  });

  it("solo risponditori automatici: automatica", () => {
    expect(tipoConversazione([noi, lui("auto_reply")])).toBe("automatica");
  });

  it("basta una risposta scritta da una persona", () => {
    expect(tipoConversazione([noi, lui("auto_reply"), lui("interested")])).toBe("risposta");
    expect(tipoConversazione([noi, lui(null)])).toBe("risposta");
  });

  it("«Fuori sede» resta una risposta vera: è anche il bottone «Dopo»", () => {
    expect(tipoConversazione([noi, lui("out_of_office")])).toBe("risposta");
  });
});

describe("daRispondere e abbiamoRisposto", () => {
  it("ha scritto per ultimo lui: aspetta una nostra risposta", () => {
    expect(daRispondere([noi, lui("question")])).toBe(true);
    expect(abbiamoRisposto([noi, lui("question")])).toBe(false);
  });

  it("dopo la sua risposta abbiamo scritto noi", () => {
    expect(daRispondere([noi, lui("interested"), noi])).toBe(false);
    expect(abbiamoRisposto([noi, lui("interested"), noi])).toBe(true);
  });

  it("un'auto-risposta arrivata dopo non cancella il «da rispondere»", () => {
    expect(daRispondere([noi, lui("interested"), lui("auto_reply")])).toBe(true);
  });

  it("un no o una disiscrizione non aspettano niente", () => {
    expect(daRispondere([noi, lui("not_interested")])).toBe(false);
    expect(daRispondere([noi, lui("unsubscribe")])).toBe(false);
  });

  it("solo automatiche: niente da rispondere", () => {
    expect(daRispondere([noi, lui("auto_reply")])).toBe(false);
    expect(abbiamoRisposto([noi, lui("auto_reply"), noi])).toBe(false);
  });
});

describe("chiaveConversazione", () => {
  it("una conversazione per brand e per persona", () => {
    expect(chiaveConversazione("me", "c1", null)).not.toBe(chiaveConversazione("eic", "c1", null));
    expect(chiaveConversazione("me", "c1", "a@b.it")).toBe("me|c1");
  });

  it("senza contatto conta l'indirizzo, senza brand un segnaposto", () => {
    expect(chiaveConversazione(null, null, "Mario@Rossi.IT")).toBe(`${SENZA_BRAND}|email:mario@rossi.it`);
  });
});

const conv = (over: Partial<ConversazionePosta>): ConversazionePosta => ({
  brandId: "me",
  tipo: "risposta",
  unread: false,
  archived: false,
  snoozedUntil: null,
  lastIntent: null,
  daRispondere: false,
  senderAccountIds: [],
  sequenceIds: [],
  lastAt: "2026-09-22T10:00:00Z",
  testoRicerca: "",
  ...over,
});

const POSTA: ConversazionePosta[] = [
  conv({ brandId: "me", unread: true, lastIntent: "interested", daRispondere: true, testoRicerca: "modonesi falegnameria" }),
  conv({ brandId: "me", lastIntent: "not_interested", testoRicerca: "habitat infissi" }),
  conv({ brandId: "thermo", unread: true, lastIntent: "question", daRispondere: true, senderAccountIds: ["casella-t"] }),
  conv({ brandId: "thermo", tipo: "automatica", unread: true }),
  conv({ brandId: "eic", tipo: "inviata" }),
  conv({ brandId: "eic", tipo: "inviata" }),
  conv({ brandId: "me", archived: true }),
  conv({ brandId: "me", snoozedUntil: "2026-09-30T09:00:00Z", lastIntent: "interested" }),
  conv({ brandId: null, lastIntent: "other" }),
];

describe("filtraPosta", () => {
  const f = (over: Partial<Parameters<typeof filtraPosta>[1]>) =>
    filtraPosta(POSTA, { vista: "risposte", filtro: "tutte", brand: null, ...over });

  it("la vista di partenza sono le risposte vere, senza automatiche, inviate, archiviate e posticipate", () => {
    expect(f({})).toHaveLength(4);
  });

  it("le automatiche, le inviate e l'archivio hanno la loro vista", () => {
    expect(f({ vista: "automatiche" })).toHaveLength(1);
    expect(f({ vista: "inviate" })).toHaveLength(2);
    expect(f({ vista: "archiviate" })).toHaveLength(1);
  });

  it("per brand, e «senza brand» per le altre", () => {
    expect(f({ brand: "me" })).toHaveLength(2);
    expect(f({ brand: "thermo" })).toHaveLength(1);
    expect(f({ brand: SENZA_BRAND })).toHaveLength(1);
  });

  it("da leggere, da rispondere, interessati, posticipate", () => {
    expect(f({ filtro: "da_leggere" })).toHaveLength(2);
    expect(f({ filtro: "da_rispondere" })).toHaveLength(2);
    expect(f({ filtro: "interessati" })).toHaveLength(1);
    expect(f({ filtro: "posticipate" })).toHaveLength(1);
  });

  it("casella, periodo e ricerca", () => {
    expect(f({ casellaId: "casella-t" })).toHaveLength(1);
    expect(f({ daQuando: Date.parse("2026-09-23T00:00:00Z") })).toHaveLength(0);
    expect(f({ ricerca: "  Modonesi " })).toHaveLength(1);
  });
});

describe("contatori", () => {
  it("i numeri delle viste e dei filtri, dentro il brand", () => {
    expect(contaPosta(POSTA, null)).toEqual({
      risposte: 4, automatiche: 1, inviate: 2, archiviate: 1,
      daLeggere: 2, daRispondere: 2, interessati: 1, posticipate: 1,
    });
    expect(contaPosta(POSTA, "thermo")).toMatchObject({ risposte: 1, automatiche: 1, daLeggere: 1 });
  });

  it("le linguette dei brand contano solo le risposte vere", () => {
    const m = contaPerBrand(POSTA);
    expect(m.get("me")).toEqual({ daLeggere: 1, risposte: 2 });
    expect(m.get("thermo")).toEqual({ daLeggere: 1, risposte: 1 });
    expect(m.get("eic")).toBeUndefined();
    expect(m.get(SENZA_BRAND)).toEqual({ daLeggere: 0, risposte: 1 });
  });
});

describe("tintaBrand", () => {
  it("i tre brand del freddo hanno un colore fisso, diverso", () => {
    const tinte = ["Marketing Edile", "ThermoDMR", "Edilizia in Cloud"].map(tintaBrand);
    expect(new Set(tinte).size).toBe(3);
  });

  it("gli altri un colore stabile", () => {
    expect(tintaBrand("Vendita Edile")).toBe(tintaBrand("vendita edile "));
  });
});

describe("la Posta usa le regole", () => {
  const client = leggi("src/components/admin/outreach/OutreachMailClient.tsx");
  const hook = leggi("src/components/admin/outreach/useOutreachConversations.tsx");

  it("la conversazione aperta sta nella cronologia, con un «Indietro» sempre visibile", () => {
    expect(client).toContain("const selectedKey = typeof stato.postaConv === \"string\" ? stato.postaConv : null;");
    expect(client).toContain("if (stato.postaDaLista === true) navigate(-1);");
    expect(client).toContain("<ChevronLeft className=\"h-4 w-4\" /> Indietro");
    // Il vecchio «indietro» esisteva solo su telefono (md:hidden).
    expect(client).not.toContain('aria-label="Torna alla lista"');
  });

  it("niente più colonna delle caselle: a dividere la posta sono i brand", () => {
    expect(client).not.toContain("mailboxColumnVisible");
    expect(client).toContain("<BrandTabs");
  });

  it("le azioni lavorano sulle risposte della conversazione, non sul contatto intero", () => {
    expect(client).toContain("markRead.mutate({ replyIds: conv.unreadReplyIds })");
    expect(hook).toContain('.in("id", replyIds.slice(i, i + 150))');
    expect(hook).not.toContain('.eq("contact_id", contactId)\n        .eq("status", UNREAD)');
  });

  it("i thread di chi ha risposto sono completi anche oltre le ultime 500 inviate", () => {
    expect(hook).toContain('leggiInviate((q) => q.in("contact_id", ids)');
  });

  it("il numero sulla linguetta Posta non conta le risposte automatiche", () => {
    expect(client).toContain('.or("intent.is.null,intent.neq.auto_reply")');
  });

  it("si risponde dalla casella della conversazione, cioè dal suo brand", () => {
    expect(client).toContain("{ contactId: selected.contact.id, senderId: selected.primarySenderId }");
    const funzione = leggi("supabase/functions/outreach-reply-send/index.ts");
    // Oggetto «Re: …» dall'ultima email di quella casella, aggancio alle risposte del suo brand.
    expect(funzione).toContain('if (soloCasella) q = q.eq("sender_account_id", soloCasella);');
    expect(funzione).toContain('if (explicitSenderId && sender.brand_id) lastReplyQ = lastReplyQ.eq("brand_id", sender.brand_id);');
  });
});
