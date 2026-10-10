/**
 * La ricerca delle impostazioni capisce le parole di un titolare.
 *
 * Ogni parola della domanda deve comparire nella voce (titolo, parole chiave, gruppo, frase), senza badare ad accenti
 * e maiuscole. Qui le 132 domande raccolte pagina per pagina: 124 trovano la pagina giusta, 8 no e lo dicono,
 * perché la pagina non c'è o non va promossa.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PIU_CERCATE,
  SETTINGS_INDEX,
  cercaImpostazioni,
  filtraGruppiDelMenu,
  vociRicercabili,
  type VoceRicercabile,
} from "@/lib/impostazioni/indiceImpostazioni";
import { buildSettingsGroups } from "@/lib/impostazioni/navigazioneImpostazioni";
import { impostazioneNelPiano, type StatoPiano } from "@/lib/impostazioni/pianoImpostazioni";
import { sezioneDaPercorso } from "@/lib/impostazioni/gruppiImpostazioni";
import type { Permissions } from "@/hooks/usePermissions";

const radice = resolve(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(resolve(radice, percorso), "utf8");

const COMPLETO: StatoPiano = { tuttoVisibile: false, pianoLimitato: false, moduloIncluso: () => true, livelloFunzione: () => "enabled" };
const FUNZIONI_MARKETING = new Set(["ai_agents", "automations", "crm_modulo", "email_marketing", "sales_os", "simulatore", "sms_marketing", "whatsapp_bot_ai"]);
const MARKETING: StatoPiano = { tuttoVisibile: false, pianoLimitato: false, moduloIncluso: () => false, livelloFunzione: (f) => (FUNZIONI_MARKETING.has(f) ? "enabled" : "disabled") };
const permessi = (valori: Record<string, unknown> = {}) => ({ isAdmin: false, isLoading: false, ...valori }) as unknown as Permissions;
const AMMINISTRATORE = permessi({ isAdmin: true });

const sezione = (v: VoceRicercabile) => (v.url === "/azienda/whatsapp" ? "whatsapp-hub" : sezioneDaPercorso(v.url) ?? "?");
const titoli = (voci: VoceRicercabile[]) => voci.map((v) => v.title);

/** Tutto quello che l'amministratore di un'azienda che fattura con Edilizia in Cloud può cercare. */
const tutte = vociRicercabili(AMMINISTRATORE, COMPLETO, false, { fatturazioneNativa: true });

/** Domanda di un titolare → le pagine (primo segmento dell'indirizzo) che la risolvono. Basta che ce ne sia una. */
const DOMANDE: [string, string[]][] = [
  ["prezzo a mano", ["margini"]],
  ["prezzo manuale", ["margini"]],
  ["prezzo finale", ["margini"]],
  ["scrivere il prezzo", ["margini"]],
  ["listino", ["listino"]],
  ["listino prezzi", ["listino", "tariffe"]],
  ["prezzi", ["listino", "tariffe", "margini"]],
  ["sconto", ["scontistica"]],
  ["sconti agli agenti", ["scontistica"]],
  ["margine", ["margini"]],
  ["ricarico", ["margini", "tariffe"]],
  ["iva", ["fatturazione"]],
  ["numero preventivo", ["margini"]],
  ["numerazione preventivi", ["margini"]],
  ["acconto", ["modelli-pagamento"]],
  ["rate", ["modelli-pagamento", "finanziamenti"]],
  ["modelli di pagamento", ["modelli-pagamento"]],
  ["finanziamento", ["finanziamenti"]],
  ["firma", ["firma-elettronica", "condizioni-firma", "margini"]],
  ["firma digitale", ["margini", "firma-elettronica"]],
  ["firma elettronica", ["firma-elettronica"]],
  ["condizioni di vendita", ["condizioni-firma"]],
  ["clausole", ["condizioni-firma"]],
  ["pdf preventivo", ["margini", "template-preventivi"]],
  ["logo", ["branding", "profilo"]],
  ["logo azienda", ["branding", "profilo"]],
  ["colori", ["branding"]],
  ["intestazione", ["branding", "template-preventivi", "fatturazione"]],
  ["carta intestata", ["branding", "fatturazione"]],
  ["modello preventivo", ["template-preventivi"]],
  ["serramenti", ["template-preventivi"]],
  ["fotovoltaico", ["template-preventivi"]],
  ["pacchetti", ["bundle"]],
  ["prodotti", ["listino"]],
  ["importa listino", ["listino"]],
  ["excel", ["listino", "esporta-dati"]],
  ["foto prodotto", ["catalogo-render", "listino"]],
  ["render", ["catalogo-render"]],
  ["stati commessa", ["stati-ordine"]],
  ["fasi", ["modelli-fasi"]],
  ["cartelle", ["cartelle-documenti"]],
  ["squadre", ["calendari-lavori", "persone"]],
  ["calendario lavori", ["calendari-lavori"]],
  ["rapportino", ["rapportini-cantiere"]],
  ["ore lavorate", ["rapportini-cantiere"]],
  ["presenze", ["rapportini-cantiere"]],
  ["timbrature", ["rapportini-cantiere"]],
  ["timbratura", ["rapportini-cantiere"]],
  ["operai", ["persone", "rapportini-cantiere"]],
  ["costi", ["categorie-costi"]],
  ["fornitori", ["fornitori"]],
  ["subappaltatori", ["persone", "fornitori"]],
  ["sopralluogo", ["sopralluoghi"]],
  ["qr", ["qr-codici"]],
  ["automazioni", ["automazioni-finanza", "ai-automazioni"]],
  ["ragione sociale", ["profilo", "fatturazione"]],
  ["partita iva", ["profilo", "fatturazione"]],
  ["sede legale", ["profilo", "fatturazione"]],
  ["sedi", ["sedi"]],
  ["utenti", ["persone"]],
  ["collaboratori", ["persone"]],
  ["ruoli", ["persone"]],
  ["permessi", ["persone"]],
  ["commercialista", ["persone"]],
  ["venditori", ["persone"]],
  ["dipendenti", ["persone"]],
  ["invitare un utente", ["persone"]],
  ["password", ["mio-profilo"]],
  ["2fa", ["mio-profilo"]],
  ["notifiche", ["notifiche"]],
  ["orari", ["calendari", "numeri-telefono", "tariffe", "rapportini-cantiere"]],
  ["telefono", ["numeri-telefono"]],
  ["centralino", ["numeri-telefono"]],
  ["whatsapp", ["notifiche", "whatsapp-hub", "numeri-telefono"]],
  ["email", ["mio-profilo", "dominio-email"]],
  ["posta", ["mio-profilo", "dominio-email"]],
  ["casella email", ["mio-profilo"]],
  ["dominio", ["dominio-email"]],
  ["mittente", ["dominio-email"]],
  ["integrazioni", ["integrazioni"]],
  ["google", ["integrazioni", "calendari"]],
  ["facebook", ["lead-forms", "integrazioni"]],
  ["abbonamento", ["abbonamento"]],
  ["piano", ["abbonamento"]],
  ["fattura abbonamento", ["abbonamento"]],
  ["crediti", ["crediti"]],
  ["backup", ["esporta-dati"]],
  ["esporta", ["esporta-dati"]],
  ["privacy", ["sicurezza-privacy"]],
  ["gdpr", ["sicurezza-privacy"]],
  ["attività", ["sicurezza-privacy"]],
  ["attivita", ["sicurezza-privacy"]],
  ["api", ["api"]],
  ["webhook", ["webhook"]],
  ["tag", ["tag"]],
  ["etichette", ["tag"]],
  ["campi personalizzati", ["campi-personalizzati"]],
  ["pipeline", ["sequenze"]],
  ["motivi di perdita", ["motivi-perdita"]],
  ["modulo contatti", ["form-builder"]],
  ["appuntamenti", ["calendari"]],
  ["bonus", ["profilo"]],
  ["detrazioni", ["profilo"]],
  ["portale clienti", ["profilo"]],
  ["recensioni", ["profilo"]],
  ["conto corrente", ["fatturazione"]],
  ["iban", ["fatturazione"]],
  ["fattura elettronica", ["fatturazione"]],
  ["codice destinatario", ["fatturazione"]],
  ["sdi", ["fatturazione"]],
  ["regime forfettario", ["fatturazione"]],
  ["durc", ["fatturazione"]],
  ["numerazione fatture", ["fatturazione"]],
  ["prefisso fattura", ["fatturazione"]],
  ["bollo", ["fatturazione"]],
  ["split payment", ["fatturazione"]],
  ["fatture", ["fatturazione"]],
  ["commercialista esporta", ["esporta-dati", "fatturazione"]],
  ["prima nota", ["fatturazione", "esporta-dati"]],
  ["silvio", ["ai-memoria"]],
  ["assistente", ["ai-memoria"]],
  ["intelligenza artificiale", ["ai-memoria", "ai-automazioni"]],
  ["margine per categoria", ["margini"]],
  ["seconda firma", ["approvazioni"]],
];

describe("le domande di un titolare trovano la pagina giusta", () => {
  it("sono 124, e sulla lista completa trovano tutte", () => {
    expect(DOMANDE).toHaveLength(124);
  });

  it.each(DOMANDE)("«%s»", (domanda, attese) => {
    const trovate = cercaImpostazioni(tutte, domanda);
    expect(trovate.map(sezione), `«${domanda}» → ${titoli(trovate).join(" | ") || "niente"}`).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^(${attese.join("|")})$`))]));
  });
});

describe("le domande senza una pagina giusta lo dicono", () => {
  it.each([
    ["aliquota iva", "l'aliquota si sceglie nella riga della fattura, non esiste un'impostazione dell'azienda"],
    ["ritenuta d'acconto", "la scheda in Fatturazione non la legge nessuno"],
    ["ritenuta di garanzia", "è un registro a parte, non un'impostazione"],
    ["fideiussione", "idem"],
    ["solleciti", "li governa «Cosa fa Silvio da solo», che non si promuove (scelta di prodotto)"],
    ["autonomia ai", "idem"],
  ])("«%s» non porta a una pagina sbagliata (%s)", (domanda) => {
    expect(titoli(cercaImpostazioni(tutte, domanda))).toEqual([]);
  });

  it("«ritenuta» porta solo alla sezione dei bonus del Profilo aziendale (la ritenuta dell'11%), non ad Automazioni finanza", () => {
    const trovate = cercaImpostazioni(tutte, "ritenuta");
    expect(titoli(trovate)).toEqual(["Bonus edilizi e blocca prezzo"]);
    expect(trovate.map(sezione)).toEqual(["profilo"]);
  });

  it("«scadenze» non porta ad Automazioni finanza, che le scadenze non le gestisce", () => {
    const trovate = titoli(cercaImpostazioni(tutte, "scadenze"));
    expect(trovate).not.toContain("Automazioni finanza");
    expect(trovate.length).toBeGreaterThan(0);
  });
});

describe("il motore", () => {
  const cerca = (testo: string) => titoli(cercaImpostazioni(tutte, testo));

  it("gli accenti non contano, né le maiuscole", () => {
    expect(cerca("attività")).toContain("Registro attività");
    expect(cerca("ATTIVITA")).toContain("Registro attività");
    expect(cerca("attivita")).toEqual(cerca("attività"));
  });

  it("ogni parola della domanda deve comparire, in qualunque ordine", () => {
    expect(cerca("ore lavorate")).toContain("Rapportini e presenze");
    expect(cerca("lavorate ore")).toContain("Rapportini e presenze");
    expect(cerca("ore sconto")).toEqual([]);
  });

  it("le particelle non contano: «il prezzo a mano» è «prezzo mano»", () => {
    expect(cerca("il prezzo a mano")[0]).toBe("Prezzo scritto a mano");
  });

  it("una parola si cerca all'inizio delle parole, non dentro: «logo» non trova «catalogo», «iva» non trova «privacy»", () => {
    expect(cerca("logo")).not.toContain("Catalogo render");
    expect(cerca("logo")).not.toContain("Listino · Prodotti");
    expect(cerca("logo")).toEqual(expect.arrayContaining(["Logo aziendale", "Marchio e colori"]));
    expect(cerca("iva").some((t) => /privacy/i.test(t))).toBe(false);
    expect(cerca("iva")).toContain("Fatturazione");
  });

  it("singolare e plurale: «tariffa» trova le tariffe, ma «ricarica» non trova il ricarico", () => {
    expect(cerca("tariffa")).toContain("Listino · Manodopera e servizi");
    expect(cerca("ricarica")).not.toContain("Listino · Manodopera e servizi");
    expect(cerca("ricarica")).toContain("Crediti e ricariche");
    expect(cerca("carta")).not.toContain("Cartelle documenti");
  });

  it("la voce più precisa viene prima", () => {
    expect(cerca("firma").slice(0, 2)).toEqual(["Firma e condizioni", "Firma e condizioni · Firma elettronica"]);
    // «privacy»: la scheda che apre la privacy, poi la pagina intera
    expect(cerca("privacy").slice(0, 2)).toEqual(["Privacy e consensi", "Sicurezza & Privacy"]);
    expect(cerca("iban")[0]).toBe("Fatturazione · Conto corrente e IBAN");
    expect(cerca("commercialista")[0]).toBe("Commercialista");
    expect(cerca("password")[0]).toBe("Sicurezza profilo");
  });

  it("il nome intero di una voce la porta in cima, prima di chi ha la stessa frase tra le parole chiave", () => {
    const conLaFrase = { title: "Altra pagina", group: "G", keywords: ["chi è collegato"] };
    const conIlNome = { title: "Chi è collegato", group: "G", keywords: [] as string[] };
    expect(cercaImpostazioni([conLaFrase, conIlNome], "chi è collegato")[0]).toBe(conIlNome);
    // …e anche se la voce con la frase viene prima nell'elenco
    expect(cercaImpostazioni([conIlNome, conLaFrase], "chi è collegato")[0]).toBe(conIlNome);
  });
  it("una domanda uguale a una parola chiave intera vale più della stessa domanda con le parole sparse", () => {
    const sparse = { title: "Prezzo e margine a mano libera", group: "G", keywords: [] as string[] };
    const intera = { title: "Altro", group: "G", keywords: ["prezzo a mano"] };
    expect(cercaImpostazioni([sparse, intera], "prezzo a mano")[0]).toBe(intera);
  });

  it("una domanda vuota lascia le voci come sono", () => {
    expect(cercaImpostazioni(tutte, "")).toBe(tutte);
    expect(cercaImpostazioni(tutte, "  ")).toBe(tutte);
    expect(cercaImpostazioni(tutte, "l a")).toEqual(cercaImpostazioni(tutte, "l a")); // solo particelle: non si rompe
  });
});

describe("il campo di ricerca del menu a sinistra", () => {
  const menu = () => buildSettingsGroups(true, AMMINISTRATORE, COMPLETO, false).map((g) => ({ ...g, items: g.items.filter((i) => i.visible) }));
  const voceDi = (domanda: string) => filtraGruppiDelMenu(menu(), tutte, domanda).flatMap((g) => g.items.map((i) => i.label));

  it("accende la voce che contiene la funzione, non solo quelle che hanno la parola nel nome", () => {
    expect(voceDi("prezzo")).toEqual(expect.arrayContaining(["Modelli di preventivo", "Listino"]));
    expect(voceDi("iban")).toEqual(expect.arrayContaining(["Fatturazione", "Fornitori"]));
    expect(voceDi("password")).toContain("Il mio profilo");
    expect(voceDi("ore lavorate")).toEqual(["Rapportini e presenze"]);
  });

  it("i gruppi senza voci spariscono, e il nome di un gruppo ne mostra le voci", () => {
    const gruppi = filtraGruppiDelMenu(menu(), tutte, "ore lavorate").map((g) => g.label);
    expect(gruppi).toEqual(["Cantieri & Costi"]);
    expect(voceDi("persone")).toContain("Utenti e permessi");
  });

  it("casella vuota: il menu com'è; senza risposta: niente", () => {
    const completo = menu();
    expect(filtraGruppiDelMenu(completo, tutte, "  ")).toBe(completo);
    expect(filtraGruppiDelMenu(completo, tutte, "zxqv")).toEqual([]);
  });
});

describe("l'elenco delle voci", () => {
  it("nessun indirizzo ripetuto, né nell'indice né nell'elenco finale", () => {
    const indirizzi = SETTINGS_INDEX.map((v) => v.url);
    expect(indirizzi.filter((u, i) => indirizzi.indexOf(u) !== i)).toEqual([]);
    const finali = tutte.map((v) => v.url);
    expect(finali.filter((u, i) => finali.indexOf(u) !== i)).toEqual([]);
  });

  it("ogni voce del menu si trova scrivendone il nome", () => {
    const delMenu = buildSettingsGroups(true, AMMINISTRATORE, COMPLETO, false).flatMap((g) => g.items.filter((i) => i.visible));
    expect(delMenu.length).toBeGreaterThan(35);
    for (const voce of delMenu) {
      expect(cercaImpostazioni(tutte, voce.label).map((v) => v.url), voce.label).toContain(voce.to);
    }
  });

  it("il gruppo di ogni voce è un nome del menu, non un vocabolario a parte", () => {
    const gruppi = new Set(buildSettingsGroups(true, AMMINISTRATORE, COMPLETO, false).map((g) => g.label));
    expect([...new Set(tutte.map((v) => v.group))].filter((g) => !gruppi.has(g))).toEqual([]);
  });

  it("le voci che si cercano di più ci sono tutte, per un amministratore", () => {
    for (const url of PIU_CERCATE) expect(tutte.map((v) => v.url), url).toContain(url);
  });

  it("senza permessi restano solo il profilo e gli avvisi personali", () => {
    const voci = vociRicercabili(permessi(), COMPLETO, false, { fatturazioneNativa: true });
    expect([...new Set(voci.map((v) => sezioneDaPercorso(v.url)))].sort()).toEqual(["mio-profilo", "notifiche"]);
  });

  it("mentre i permessi si caricano non c'è niente da cercare", () => {
    expect(vociRicercabili(permessi({ isAdmin: true, isLoading: true }), COMPLETO, false)).toEqual([]);
  });

  it("ogni voce è dentro il piano dell'azienda", () => {
    const voci = vociRicercabili(AMMINISTRATORE, MARKETING, false, { fatturazioneNativa: true });
    expect(voci.length).toBeGreaterThan(20);
    for (const v of voci) expect(impostazioneNelPiano(v.url, MARKETING), v.url).toBe(true);
    const sezioni = new Set(voci.map((v) => sezioneDaPercorso(v.url)));
    for (const fuori of ["stati-ordine", "fatturazione", "listino", "margini", "fornitori", "sopralluoghi"]) expect(sezioni.has(fuori), fuori).toBe(false);
  });

  it("da telefono spariscono le voci che hanno schede solo da computer", () => {
    const telefono = vociRicercabili(AMMINISTRATORE, COMPLETO, true, { fatturazioneNativa: true });
    const nomi = titoli(telefono);
    for (const soloComputer of ["Commercialista", "Venditori e provvigioni", "Il mio profilo · Calendari", "Registro attività", "Integrazioni", "Fatturazione · Conto corrente e IBAN"]) {
      expect(nomi, soloComputer).not.toContain(soloComputer);
    }
    expect(nomi).toEqual(expect.arrayContaining(["Il mio profilo", "Sicurezza profilo", "Utenti e permessi"]));
  });
});

describe("chi non può aprire una pagina non la trova", () => {
  const nomi = (p: Permissions, piano = COMPLETO, opzioni = {}) => titoli(vociRicercabili(p, piano, false, opzioni));

  it("le schede di Persone & Accessi hanno permessi loro", () => {
    const soloPersone = nomi(permessi({ canViewSettingsPeople: true }));
    expect(soloPersone).toEqual(expect.arrayContaining(["Utenti e permessi", "Dipendenti e operai", "Subappaltatori e app cantiere", "Venditori e provvigioni", "Team e squadre"]));
    for (const scheda of ["Commercialista", "Persone di altre aziende", "Controllo accessi", "Modelli di permessi"]) expect(soloPersone, scheda).not.toContain(scheda);
    const conUtenti = nomi(permessi({ canViewSettingsPeople: true, canViewUsers: true }));
    expect(conUtenti).toEqual(expect.arrayContaining(["Commercialista", "Persone di altre aziende", "Controllo accessi"]));
    expect(conUtenti).not.toContain("Modelli di permessi");
    // i modelli di permessi li scrive solo l'amministratore: «Modifica» sulle persone non basta (lo dice anche la pagina)
    expect(nomi(permessi({ canViewSettingsPeople: true, canEditSettingsPeople: true, canViewUsers: true }))).not.toContain("Modelli di permessi");
    expect(nomi(AMMINISTRATORE)).toContain("Modelli di permessi");
  });

  it("il registro delle attività e gli accessi sono solo dell'amministratore", () => {
    const sicurezza = nomi(permessi({ canViewSettingsSecurity: true }));
    expect(sicurezza).toContain("Sicurezza & Privacy");
    expect(sicurezza).not.toContain("Registro attività");
    expect(sicurezza).not.toContain("Chi è collegato");
    expect(nomi(AMMINISTRATORE)).toEqual(expect.arrayContaining(["Registro attività", "Chi è collegato"]));
  });

  it("senza il permesso sui costi non si trova il prezzo scritto a mano", () => {
    const soloListino = nomi(permessi({ canViewSettingsPricing: true }));
    expect(soloListino).not.toContain("Prezzo scritto a mano");
    expect(soloListino).not.toContain("Margini e spese generali");
    expect(soloListino).toContain("Listino");
    expect(nomi(permessi({ canViewCosts: true }))).toContain("Prezzo scritto a mano");
  });

  it("le voci dentro la Fatturazione ci sono solo se l'azienda fattura con Edilizia in Cloud", () => {
    const conFatturazione = permessi({ canViewBilling: true });
    expect(nomi(conFatturazione, COMPLETO, { fatturazioneNativa: false })).toContain("Fatturazione");
    expect(nomi(conFatturazione, COMPLETO, { fatturazioneNativa: false }).filter((t) => t.startsWith("Fatturazione ·"))).toEqual([]);
    expect(nomi(conFatturazione, COMPLETO, { fatturazioneNativa: true }).filter((t) => t.startsWith("Fatturazione ·")).length).toBe(7);
    expect(nomi(permessi(), COMPLETO, { fatturazioneNativa: true }).filter((t) => t.startsWith("Fatturazione"))).toEqual([]);
  });

  it("«Crediti e ricariche» c'è per chi ha la fatturazione, anche senza essere amministratore", () => {
    expect(nomi(permessi({ canViewBilling: true }))).toContain("Crediti e ricariche");
    expect(nomi(permessi())).not.toContain("Crediti e ricariche");
  });

  it("la pagina WhatsApp (fuori da Impostazioni) ha il suo permesso e la sua funzione del piano", () => {
    expect(nomi(permessi({ canViewMarketingWhatsapp: true }))).toContain("WhatsApp (numeri, bot, modelli)");
    expect(nomi(permessi())).not.toContain("WhatsApp (numeri, bot, modelli)");
    const senzaWhatsapp: StatoPiano = { ...COMPLETO, livelloFunzione: (f) => (f === "whatsapp" ? "disabled" : "enabled") };
    expect(nomi(permessi({ canViewMarketingWhatsapp: true }), senzaWhatsapp)).not.toContain("WhatsApp (numeri, bot, modelli)");
  });

  it("caricare una tabella di finanziamento vuole la modifica: chi le vede soltanto non trova «Nuova tabella»", () => {
    const solaLettura = nomi(permessi({ canViewSettingsFinanziamenti: true }));
    expect(solaLettura).toEqual(expect.arrayContaining(["Finanziamenti", "Finanziamenti · Calcolatore rate"]));
    expect(solaLettura).not.toContain("Finanziamenti · Nuova tabella");
    expect(nomi(permessi({ canViewSettingsFinanziamenti: true, canEditSettingsFinanziamenti: true }))).toContain("Finanziamenti · Nuova tabella");
  });

  it("la voce per «Email · Mittente e aspetto» vuole il permesso delle email", () => {
    expect(nomi(permessi())).not.toContain("Email · Mittente e aspetto");
    expect(nomi(permessi({ canViewMarketingEmail: true }))).toContain("Email · Mittente e aspetto");
  });

  it("le sezioni del Profilo aziendale che si cambiano (logo, portale clienti, bonus) le vede solo chi può modificare il profilo", () => {
    const soloLettura = nomi(permessi({ canViewSettingsProfile: true }));
    expect(soloLettura).toEqual(expect.arrayContaining(["Profilo aziendale", "Recensioni online", "Prefisso del codice commessa"]));
    for (const t of ["Logo aziendale", "Portale clienti", "Bonus edilizi e blocca prezzo"]) expect(soloLettura, t).not.toContain(t);
    const conModifica = nomi(permessi({ canViewSettingsProfile: true, canEditSettingsProfile: true }));
    expect(conModifica).toEqual(expect.arrayContaining(["Logo aziendale", "Portale clienti", "Bonus edilizi e blocca prezzo"]));
    expect(nomi(permessi())).not.toContain("Recensioni online");
  });

  it("le regole di sicurezza dell'azienda e i messaggi programmati sono dell'amministratore; gli orari di silenzio sono di tutti", () => {
    const molti = nomi(permessi({ canViewSettingsProfile: true, canEditSettingsProfile: true, canViewSettingsSecurity: true, canViewSettingsPeople: true, canEditSettingsPeople: true }));
    expect(molti).not.toContain("Regole di sicurezza dell'azienda");
    expect(molti).not.toContain("Notifiche · Messaggi programmati");
    expect(nomi(AMMINISTRATORE)).toEqual(expect.arrayContaining(["Regole di sicurezza dell'azienda", "Notifiche · Messaggi programmati"]));
    expect(nomi(permessi())).toEqual(expect.arrayContaining(["Notifiche · Orari di silenzio", "Notifiche · Messaggi automatici"]));
  });

  it("da telefono non ci sono le sezioni che la pagina nasconde (recensioni, portale clienti, bonus, regole di sicurezza, messaggi programmati)", () => {
    const telefono = titoli(vociRicercabili(AMMINISTRATORE, COMPLETO, true));
    for (const t of ["Recensioni online", "Portale clienti", "Bonus edilizi e blocca prezzo", "Regole di sicurezza dell'azienda", "Notifiche · Messaggi programmati"]) {
      expect(telefono, t).not.toContain(t);
    }
    expect(telefono).toEqual(expect.arrayContaining(["Logo aziendale", "Prefisso del codice commessa", "Notifiche · Orari di silenzio", "Notifiche · Messaggi automatici"]));
  });
});

describe("le sezioni dentro le pagine hanno la loro voce, che le apre già scorse", () => {
  it.each([
    ["logo", "Logo aziendale", "/azienda/impostazioni/profilo#logo"],
    ["recensioni", "Recensioni online", "/azienda/impostazioni/profilo#recensioni"],
    ["voto google", "Recensioni online", "/azienda/impostazioni/profilo#recensioni"],
    ["portale clienti", "Portale clienti", "/azienda/impostazioni/profilo#portale-clienti"],
    ["bonus", "Bonus edilizi e blocca prezzo", "/azienda/impostazioni/profilo#bonus"],
    ["blocca prezzo", "Bonus edilizi e blocca prezzo", "/azienda/impostazioni/profilo#bonus"],
    ["prefisso commessa", "Prefisso del codice commessa", "/azienda/impostazioni/profilo#prefisso-commessa"],
    ["silenzio", "Notifiche · Orari di silenzio", "/azienda/impostazioni/notifiche#orari-di-silenzio"],
    ["non disturbare", "Notifiche · Orari di silenzio", "/azienda/impostazioni/notifiche#orari-di-silenzio"],
    ["messaggi automatici", "Notifiche · Messaggi automatici", "/azienda/impostazioni/notifiche#messaggi-automatici"],
    ["messaggi programmati", "Notifiche · Messaggi programmati", "/azienda/impostazioni/notifiche#messaggi-programmati"],
    ["password sbagliate", "Regole di sicurezza dell'azienda", "/azienda/impostazioni/mio-profilo?tab=sicurezza#regole-azienda"],
    ["ip consentiti", "Regole di sicurezza dell'azienda", "/azienda/impostazioni/mio-profilo?tab=sicurezza#regole-azienda"],
    ["chi è collegato", "Chi è collegato", "/azienda/impostazioni/sicurezza-privacy?tab=dashboard"],
    ["privacy e consensi", "Privacy e consensi", "/azienda/impostazioni/sicurezza-privacy?tab=privacy"],
    ["cancella account", "Privacy e consensi", "/azienda/impostazioni/sicurezza-privacy?tab=privacy"],
    ["modelli di permessi", "Modelli di permessi", "/azienda/impostazioni/persone?tab=template-permessi"],
    ["accesso app cantiere", "Subappaltatori e app cantiere", "/azienda/impostazioni/persone?tab=subappaltatori"],
    ["cosa vede il cliente", "Stati commessa · Cosa vede il cliente", "/azienda/impostazioni/stati-ordine#cliente"],
    ["commessa nuova", "Fasi e avanzamento · Quando apri una commessa", "/azienda/impostazioni/modelli-fasi#nuova-commessa"],
    ["chi spunta", "Fasi e avanzamento · Chi spunta e come si calcola", "/azienda/impostazioni/modelli-fasi#regole"],
    ["rata al sal", "Modelli di pagamento · Quando matura la rata di un SAL", "/azienda/impostazioni/modelli-pagamento#sal"],
    ["account google", "Squadre e calendari lavori · Google Calendar", "/azienda/impostazioni/calendari-lavori?tab=google"],
    ["diritto di ripensamento", "Diritto di ripensamento", "/azienda/impostazioni/firma-elettronica#ripensamento"],
    ["firma dei preventivi", "Firma dei preventivi", "/azienda/impostazioni/firma-elettronica#firma-sul-preventivo"],
    ["calcolatore rate", "Finanziamenti · Calcolatore rate", "/azienda/impostazioni/finanziamenti/calcolatore"],
    ["nuova tabella", "Finanziamenti · Nuova tabella", "/azienda/impostazioni/finanziamenti/nuova"],
    ["nuovo preventivo", "Quali preventivi compaiono in «Nuovo preventivo»", "/azienda/impostazioni/template-preventivi?tab=moduli-vendita"],
    ["spostamenti", "Appuntamenti e prenotazioni · Spostamenti", "/azienda/impostazioni/calendari?tab=preferences"],
    ["dati normativi", "Telefonia · Dati normativi", "/azienda/impostazioni/numeri-telefono#dati-normativi"],
  ])("«%s» porta a «%s» (%s)", (domanda, titolo, url) => {
    const prima = cercaImpostazioni(tutte, domanda)[0];
    expect(prima.title).toBe(titolo);
    expect(prima.url).toBe(url);
  });

  it("le parole di una sezione non restano anche sulla pagina intera: una voce per funzione", () => {
    const parole = (segmento: string) => SETTINGS_INDEX.filter((v) => sezioneDaPercorso(v.url) === segmento && !v.url.includes("#") && !v.url.includes("?")).flatMap((v) => v.keywords ?? []);
    for (const w of ["recensioni", "portale clienti", "bonus edilizi", "blocca prezzo", "prefisso commessa"]) expect(parole("profilo"), w).not.toContain(w);
    for (const w of ["silenzio", "orari di silenzio", "non disturbare"]) expect(parole("notifiche"), w).not.toContain(w);
  });

  it("Fornitori si trova con le parole della sua pagina: unire i doppioni, il registro, i codici GS1", () => {
    for (const domanda of ["unisci doppioni", "chi compriamo di più", "cosa è cambiato", "gs1", "codici a barre"]) {
      expect(titoli(cercaImpostazioni(tutte, domanda)), domanda).toContain("Fornitori");
    }
  });

  it("ChatGPT non porta alle chiavi API (non le usa: si collega da Integrazioni)", () => {
    const trovate = titoli(cercaImpostazioni(tutte, "chatgpt"));
    expect(trovate).toContain("Integrazioni");
    expect(trovate).not.toContain("Chiavi di accesso");
  });
});

describe("le pagine che non fanno quello che dicono non si promuovono", () => {
  const indice = (segmento: string) => SETTINGS_INDEX.filter((v) => sezioneDaPercorso(v.url) === segmento);

  it("nessuna voce porta al Bot WhatsApp «classico» né a «Cosa fa Silvio da solo»", () => {
    expect(indice("whatsapp-bot")).toEqual([]);
    expect(indice("ai-automazioni")).toEqual([]);
    expect(tutte.some((v) => /whatsapp-bot|ai-automazioni/.test(v.url))).toBe(false);
  });

  it("Webhook non ha parole di ricerca in più", () => {
    expect(indice("webhook").map((v) => v.keywords)).toEqual([["webhook", "eventi", "callback"]]);
  });

  it("Automazioni finanza non risponde a «ritenute», «trattenuta» e «fideiussione»: la pagina non ne parla", () => {
    const parole = indice("automazioni-finanza").flatMap((v) => v.keywords ?? []).join(" ");
    expect(parole).not.toMatch(/ritenut|trattenut|fideiuss|garanzia/);
    expect(cercaImpostazioni(tutte, "trattenuta")).toEqual([]);
    expect(titoli(cercaImpostazioni(tutte, "automazioni"))).toContain("Automazioni finanza");
  });
});

describe("ogni voce porta a una pagina che esiste", () => {
  const rotte = leggi("src/routes/companyRoutes.tsx");
  const blocco = rotte.slice(rotte.indexOf("<Route index element={<SettingsIndexRoute />} />"), rotte.indexOf('<Route path="ritenute-garanzia"'));
  const segmenti = new Set([...blocco.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1].split("/")[0]));
  // I segmenti che sono solo un rimando ad altro: una voce non deve puntarvi.
  const rimandi = new Set([...blocco.matchAll(/<Route\s+path="([^"/]+)"\s+element=\{<Navigate/g)].map((m) => m[1]));

  /** Le schede che le pagine accettano, lette dal loro codice. */
  const schede = (file: string, nome: RegExp) => {
    const m = leggi(file).match(nome);
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  };
  const SCHEDE: Record<string, string[]> = {
    persone: schede("src/pages/azienda/settings/SettingsPeople.tsx", /const VALID_TABS: PeopleTab\[\] = \[([^\]]+)\]/),
    "mio-profilo": schede("src/pages/azienda/impostazioni/MioProfilo.tsx", /const PROFILE_TABS: ProfileTab\[\] = \[([^\]]+)\]/),
    "sicurezza-privacy": schede("src/pages/azienda/settings/SettingsSecurityHub.tsx", /const VALID_TABS: SecurityTab\[\] = \[([^\]]+)\]/),
    fatturazione: ["esterna", "nativa"],
    tariffe: ["manutenzione"],
  };

  // Dove vive ogni àncora (id="…"). Le sezioni di Profilo aziendale, Notifiche e Il mio profilo arrivano col ramo che
  // riscrive quelle pagine («una sezione per argomento»): finché non è unito le pagine non hanno sezioni e il link le
  // apre dall'inizio, senza danno. Dopo l'unione le àncore devono esserci davvero: il controllo si accende da solo.
  const FILE_DELLE_ANCORE: Record<string, string[]> = {
    margini: ["src/pages/azienda/settings/SettingsMargini.tsx"],
    profilo: ["src/pages/azienda/settings/SettingsProfile.tsx", "src/components/settings/CompanyProfileForm.tsx"],
    notifiche: ["src/pages/azienda/impostazioni/SettingsNotifiche.tsx", "src/components/notifications/AvvisiPerEvento.tsx"],
    "mio-profilo": ["src/pages/azienda/impostazioni/MioProfilo.tsx", "src/components/settings/CompanySecuritySettings.tsx"],
    "stati-ordine": ["src/components/settings/OrderStatusConfig.tsx"],
    "modelli-fasi": ["src/pages/azienda/settings/SettingsModelliFasi.tsx", "src/components/settings/NuovaCommessaConfig.tsx"],
    "modelli-pagamento": ["src/pages/azienda/settings/SettingsModelliPagamento.tsx", "src/components/settings/ModelliPagamentoConfig.tsx", "src/components/settings/SalMaturaConfig.tsx"],
    "firma-elettronica": ["src/pages/azienda/settings/SettingsFirmaElettronica.tsx"],
    "numeri-telefono": ["src/pages/azienda/settings/SettingsPhoneNumbers.tsx"],
  };
  const leggiSeC = (file: string) => (existsSync(resolve(radice, file)) ? leggi(file) : "");

  it.each(SETTINGS_INDEX.filter((v) => v.url.includes("#")).map((v) => [v.title, v.url] as const))("l'àncora di «%s» (%s) è nella pagina", (_titolo, url) => {
    const segmento = sezioneDaPercorso(url)!;
    const ancora = url.split("#")[1];
    const file = FILE_DELLE_ANCORE[segmento];
    expect(file, `${segmento} ha un'àncora ma non è tra le pagine con le sezioni: aggiungila a FILE_DELLE_ANCORE`).toBeDefined();
    const codice = file.map(leggiSeC).join("\n");
    // Le pagine che ancora non hanno le sezioni (il ramo del loro gruppo non è unito) non si controllano: il link le apre dall'inizio.
    const conSezioni = codice.includes("<SezioneImpostazione") || codice.includes('id="dati-normativi"');
    if (segmento !== "margini" && !conSezioni) return;
    expect(codice, `id="${ancora}" non c'è in ${file.join(" né in ")}`).toContain(`id="${ancora}"`);
  });

  it("le pagine delle impostazioni sono più di 50 (la lettura delle rotte funziona)", () => {
    expect(segmenti.size).toBeGreaterThan(50);
    expect(SCHEDE.persone.length).toBeGreaterThan(5);
    expect(SCHEDE["mio-profilo"]).toContain("sicurezza");
    expect(SCHEDE["sicurezza-privacy"]).toEqual(expect.arrayContaining(["dashboard", "attivita"]));
  });

  it.each(SETTINGS_INDEX.filter((v) => v.url.startsWith("/azienda/impostazioni/")).map((v) => [v.title, v.url, v.parent] as const))(
    "«%s» → %s",
    (_titolo, url, parent) => {
      const s = sezioneDaPercorso(url)!;
      expect(segmenti.has(s), `${s} non è una rotta delle impostazioni`).toBe(true);
      expect(rimandi.has(s), `${s} è solo un rimando ad altro`).toBe(false);
      if (parent) expect(segmenti.has(parent), `il genitore ${parent} non è una pagina`).toBe(true);
      const scheda = new URLSearchParams(url.split("?")[1]?.split("#")[0] ?? "").get("tab");
      if (scheda && SCHEDE[s]?.length) expect(SCHEDE[s], `la scheda ${scheda} di ${s}`).toContain(scheda);
    },
  );
});
