/**
 * I rimandi alle impostazioni portano dove dicono.
 *
 * Gli indirizzi «/azienda/impostazioni/…» sparsi per l'app e i testi «Impostazioni → …» vanno a pagine che esistono
 * (`/impostazioni/email` non esiste: la pagina delle email sta sotto «Il mio profilo»), i link che portano a un'altra
 * schermata durante un lavoro da salvare si aprono in una nuova scheda (LinkImpostazione).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const radice = resolve(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(resolve(radice, percorso), "utf8");

function fileDi(cartella: string, fuori: string[] = []): string[] {
  const risultato: string[] = [];
  for (const nome of readdirSync(cartella)) {
    const completo = join(cartella, nome);
    if (fuori.some((f) => completo.includes(f))) continue;
    if (statSync(completo).isDirectory()) risultato.push(...fileDi(completo, fuori));
    else if (/\.(ts|tsx)$/.test(nome)) risultato.push(completo);
  }
  return risultato;
}
const sorgenti = fileDi(resolve(radice, "src"), [`${"/src/test"}`, "/src/integrations/supabase/types"]);

const rotte = leggi("src/routes/companyRoutes.tsx");
const blocco = rotte.slice(rotte.indexOf("<Route index element={<SettingsIndexRoute />} />"), rotte.indexOf('<Route path="ritenute-garanzia"'));
const segmenti = new Set([...blocco.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1].split("/")[0]));

/** Le schede che le pagine accettano nell'indirizzo, lette dal loro codice. */
const elenco = (file: string, nome: RegExp) => {
  const m = leggi(file).match(nome);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
};
const SCHEDE: Record<string, string[]> = {
  persone: [
    ...elenco("src/pages/azienda/settings/SettingsPeople.tsx", /const VALID_TABS: PeopleTab\[\] = \[([^\]]+)\]/),
    "staff", "operai", "sicurezza", "accessi", "templates", "template", // vecchi nomi che la pagina capisce
  ],
  "mio-profilo": elenco("src/pages/azienda/impostazioni/MioProfilo.tsx", /const PROFILE_TABS: ProfileTab\[\] = \[([^\]]+)\]/),
  "sicurezza-privacy": elenco("src/pages/azienda/settings/SettingsSecurityHub.tsx", /const VALID_TABS: SecurityTab\[\] = \[([^\]]+)\]/),
  fatturazione: ["esterna", "nativa"],
};

/** Tutti gli indirizzi scritti per intero nel codice (quelli costruiti con ${…} non si controllano). */
const indirizzi: { file: string; url: string }[] = [];
for (const file of sorgenti) {
  // Le righe di commento (docblock e //) non sono rimandi: possono citare indirizzi che non esistono per spiegare un nome.
  const testo = readFileSync(file, "utf8").split("\n").map((r) => (/^\s*(\*|\/\*|\/\/)/.test(r) ? "" : r)).join("\n");
  for (const m of testo.matchAll(/\/azienda\/impostazioni\/([a-z0-9-]+)((?:\/[a-z0-9-]+)*)(\?[A-Za-z0-9=&_-]*)?(#[A-Za-z0-9_-]+)?/g)) {
    if (testo[m.index! + m[0].length] === "$" ) continue; // «…/utenti/${id}»
    indirizzi.push({ file: relative(radice, file), url: m[0] });
  }
}

describe("gli indirizzi delle impostazioni scritti nel codice esistono", () => {
  it("la lettura funziona: centinaia di indirizzi, tutti i segmenti letti dalle rotte", () => {
    expect(indirizzi.length).toBeGreaterThan(200);
    expect(segmenti.size).toBeGreaterThan(50);
    expect(SCHEDE.persone).toEqual(expect.arrayContaining(["utenti", "commercialista"]));
    expect(SCHEDE["mio-profilo"]).toEqual(expect.arrayContaining(["email", "calendari"]));
  });

  it("ogni indirizzo cade su una rotta delle impostazioni (non sul catch-all che riporta alla home)", () => {
    const sbagliati = indirizzi.filter(({ url }) => !segmenti.has(url.split("/")[3].split(/[?#]/)[0]));
    expect(sbagliati.map((x) => `${x.file}: ${x.url}`)).toEqual([]);
  });

  it("ogni scheda indicata esiste nella pagina", () => {
    const sbagliati = indirizzi.filter(({ url }) => {
      const scheda = new URLSearchParams(url.split("?")[1]?.split("#")[0] ?? "").get("tab");
      const pagina = url.split("/")[3]?.split(/[?#]/)[0];
      return scheda && SCHEDE[pagina]?.length && !SCHEDE[pagina].includes(scheda);
    });
    expect(sbagliati.map((x) => `${x.file}: ${x.url}`)).toEqual([]);
  });
});

describe("i rimandi che non portavano dove dicevano", () => {
  it("la casella di posta si collega da «Il mio profilo → Email», non da una pagina che non c'è", () => {
    for (const file of [
      "src/components/clients/CustomerComposeBar.tsx",
      "src/pages/azienda/conversazioni/ConversazioneComposer.tsx",
    ]) {
      const testo = leggi(file);
      expect(testo, file).not.toContain("/azienda/impostazioni/email");
      expect(testo, file).toContain("/azienda/impostazioni/mio-profilo?tab=email");
    }
    // la firma email si scrive dove si collega la casella, non in Integrazioni
    expect(leggi("src/components/clients/CustomerComposeBar.tsx")).not.toContain("/azienda/impostazioni/integrazioni");
  });

  it("«Nessuna previsione impostata» non rimanda più a Prezzo e margini, dove la previsione non c'è", () => {
    const testo = leggi("src/pages/azienda/ComeStiamoAndando.tsx");
    expect(testo).toContain("Nessuna previsione impostata");
    expect(testo).not.toContain("/azienda/impostazioni/margini");
  });

  it("nessun testo manda a configurare un token che l'azienda non può scrivere", () => {
    const testo = leggi("src/pages/azienda/marketing/MarketingContactDetail.tsx");
    expect(testo).not.toMatch(/token openapi\.it/i);
    expect(testo).toContain("avvisa l'assistenza");
  });

  it("l'AI a consumo manda ai pagamenti dell'abbonamento, non a una pagina «AI» che non c'è", () => {
    expect(leggi("src/components/quotes/QuoteAdvisorPanel.tsx")).toContain("Impostazioni → Piano abbonamento → Pagamenti");
  });
});

describe("i nomi che nel menu non esistono più", () => {
  // I file fuori dalle pagine delle impostazioni che citano le impostazioni: il nome è quello del menu.
  // (ServiziSection, MatchTariffaPickerDialog e StepContenuti li corregge il gruppo del Listino e dei modelli, che li ha in carico.)
  const CORRETTI = [
    "src/components/orders/SalvaFasiComeModello.tsx",
    "src/components/orders/CantiereDaOrganizzare.tsx",
    "src/components/orders/ModelliFasiPicker.tsx",
    "src/components/flow-builder/FlowBuilderConfigPanel.tsx",
    "src/components/opportunities/OpportunityAppointmentTab.tsx",
    "src/components/flow-builder/config-panels/EmailConfigPanel.tsx",
    "src/pages/azienda/email/EmailLayout.tsx",
    "src/components/clients/CustomerProfileCard.tsx",
    "src/pages/accountant/AccountantDashboard.tsx",
    "src/components/prezzario/PrezzoDiZonaRiepilogo.tsx",
    "src/components/preventivi/VotoOnlineDelProfilo.tsx",
    "src/components/preventivi/PrezzoPreventivoAMano.tsx",
    "src/components/orders/CaricaDocumentiDialog.tsx",
    "src/components/automazioni/BulkScheduleWizard.tsx",
  ];
  const VIETATI: [RegExp, string][] = [
    [/Tariffe aziendali/, "«Tariffe aziendali» → Listino → Manodopera e servizi"],
    [/Impostazioni (→|›|>) Tariffe\b/, "«Impostazioni → Tariffe» → Listino → Manodopera e servizi"],
    [/Template Moduli Vendita/, "«Template Moduli Vendita» → Modelli di preventivo → Moduli"],
    [/Impostazioni (→|›|>) (Modelli di fasi|Fasi commessa)/, "«Modelli di fasi», «Fasi commessa» → Fasi e avanzamento"],
    [/Impostazioni (→|›|>) Posta/, "«Posta» → Il mio profilo → Email"],
    [/Impostazioni (→|›|>) Email\b/, "«Impostazioni → Email» → Il mio profilo → Email"],
    [/Impostazioni (→|›|>) Calendari(?! lavori)/, "«Calendari» → Appuntamenti e prenotazioni"],
    [/Impostazioni (→|›|>) Abbonamento/, "«Abbonamento» → Piano abbonamento"],
    [/Persone & Utenti/, "«Persone & Utenti» → Persone & Accessi"],
    [/Impostazioni (→|›|>) AI\b/, "«Impostazioni → AI» non c'è"],
    [/Profilo azienda\b(?!le)/, "«Profilo azienda» → Profilo aziendale"],
  ];

  it.each(CORRETTI)("%s", (file) => {
    const testo = leggi(file);
    for (const [vietato, perche] of VIETATI) expect(testo, perche).not.toMatch(vietato);
  });
});

describe("i rimandi dai posti dove si lavora non ricaricano l'app", () => {
  // Un <a href> a una pagina delle impostazioni, dentro un preventivo o una finestra di invio, ricarica tutto e
  // fa perdere quello che non è salvato. Sono LinkImpostazione: si aprono in una nuova scheda.
  const FILE = [
    "src/components/clients/CustomerComposeBar.tsx",
    "src/pages/azienda/conversazioni/ConversazioneComposer.tsx",
    "src/components/contacts/QuickContactSendDialog.tsx",
    "src/components/marketing/preventivi/ProductPicker.tsx",
    "src/components/marketing/preventivi/QuoteFinancingPanel.tsx",
    "src/components/marketing/simulatore/SimScenariPanel.tsx",
    "src/components/serramenti/SimulazioneFinanziamento.tsx",
  ];
  it.each(FILE)("%s", (file) => {
    const testo = leggi(file);
    expect(testo).not.toMatch(/<a\s[^>]*href=\{?["`][^>]*\/azienda\/impostazioni/s);
    expect(testo).toContain("LinkImpostazione");
  });

  it("LinkImpostazione si apre in una nuova scheda, senza dare al sito aperto il controllo di questo", () => {
    const testo = leggi("src/components/impostazioni/LinkImpostazione.tsx");
    expect(testo).toContain('target="_blank"');
    expect(testo).toContain('rel="noopener noreferrer"');
  });
});
