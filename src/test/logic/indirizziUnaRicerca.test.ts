/**
 * Indirizzi: una ricerca sola in tutta l'app (30/10/2026).
 *
 * Il 30/10 creando una commessa d'appalto l'«Indirizzo del cantiere» non trovava niente: era un campo di testo
 * semplice. Allo stesso modo una ventina di moduli (modifica commessa, preventivi, ticket e interventi, fornitori,
 * subappaltatori, magazzini, sedi, azienda, documenti, uscita merce, HR, portale cliente, modelli dei PDF…);
 * il fotovoltaico aveva una copia sua della ricerca. Ora tutti usano CampoIndirizzo (direttamente, o dentro
 * AddressAutocomplete per l'indirizzo strutturato) e la ricerca vive in ricercaIndirizzi.
 *
 * Tiene fermo:
 *   · solo ricercaIndirizzi chiama la ricerca di maps-proxy (niente copie);
 *   · nessun campo di testo semplice con un segnaposto da indirizzo («Via …», «Indirizzo …») o registrato come
 *     indirizzo, salvo le eccezioni scritte qui sotto col perché;
 *   · nessun campo in linea (InlineField: scheda cliente, scheda contatto) con l'etichetta «Indirizzo» senza ricerca;
 *   · ogni modulo dell'elenco usa la ricerca.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = process.cwd();
const relativo = (p: string) => relative(RADICE, p).split("\\").join("/");
const leggi = (p: string) => readFileSync(join(RADICE, p), "utf8");

function sorgenti(estensioni: RegExp): string[] {
  const file: string[] = [];
  const cammina = (cartella: string) => {
    for (const nome of readdirSync(cartella)) {
      const percorso = join(cartella, nome);
      if (statSync(percorso).isDirectory()) {
        if (!["test", "node_modules", "data"].includes(nome)) cammina(percorso);
      } else if (estensioni.test(nome) && !/\.test\.tsx?$/.test(nome)) {
        file.push(relativo(percorso));
      }
    }
  };
  cammina(join(RADICE, "src"));
  return file.sort();
}

/** Un <Input …/> o <Textarea …/>: le proprietà fino alla chiusura. */
const ELEMENTO = /<(Input|Textarea)\b((?:(?!\/>)[\s\S])*?)\/>/g;
/** Segnaposto da indirizzo («Via Roma 1», «Es. Via…», «Indirizzo…»), anche dentro un'espressione. */
const SEGNAPOSTO_INDIRIZZO = /placeholder=(?:"|\{[\s\S]{0,200}?["'`])\s*(?:Es\.?\s*)?(?:Via\b|Via,|Via\s*\/|Indirizzo|indirizzo)/;
/** Campo registrato (react-hook-form) col nome di un indirizzo. */
const REGISTRATO_INDIRIZZO = /register\(\s*["'](?:indirizzo|address|legal_address)["']\s*\)/;
/** Un <InlineField …/> (campo che si modifica cliccando il valore). */
const CAMPO_IN_LINEA = /<InlineField\b((?:(?!\/>)[\s\S])*?)\/>/g;
const ETICHETTA_INDIRIZZO = /label="(?:Indirizzo|Via)\b[^"]*"/;
/** La proprietà `indirizzo` da sola (non `value={x.indirizzo}` né `onSelectIndirizzo`). */
const CON_RICERCA = /(?:^|\s)indirizzo(?=\s|$|=\{true\})/;
const inLineaSenzaRicerca = (testo: string) =>
  [...testo.matchAll(CAMPO_IN_LINEA)].filter((m) => ETICHETTA_INDIRIZZO.test(m[1]) && !CON_RICERCA.test(m[1]));

/** I campi semplici che restano tali: file e perché. */
const ECCEZIONI: Record<string, string> = {
  "src/pages/OffertaCheckout.tsx": "pagina pubblica: chi compra non ha ancora un accesso, e la ricerca (maps-proxy) lo chiede",
  "src/components/shared/AddressAutocomplete.tsx": "i dettagli da correggere a mano, sotto la ricerca",
  "src/components/orders/VariationEditor.tsx": "testo libero per il PDF (indirizzo, P.IVA e contatti insieme), non un indirizzo da cercare",
};

/** I moduli che chiedono un indirizzo: tutti con la ricerca. */
const MODULI = [
  // Già con la ricerca prima del 30/10 (AddressAutocomplete).
  "src/components/customers/CustomerAddressFields.tsx",
  "src/pages/azienda/CreateOrder.tsx",
  "src/pages/azienda/sopralluoghi/NuovoSopralluogo.tsx",
  "src/components/appointments/AppointmentDialog.tsx",
  "src/components/marketing/MarketingAppointmentDialog.tsx",
  "src/components/opportunities/OpportunityAppointmentTab.tsx",
  "src/components/settings/CalendarDialog.tsx",
  // Commesse.
  "src/pages/azienda/CreateLavoroAppaltatore.tsx",
  "src/pages/azienda/EditOrder.tsx",
  // Preventivi.
  "src/pages/azienda/marketing/QuoteBuilder.tsx",
  "src/components/preventivatore/IndirizzoDeiLavori.tsx",
  "src/pages/azienda/serramenti/SerramentiWizard.tsx",
  "src/pages/azienda/fotovoltaico/FotovoltaicoWizard.tsx",
  "src/components/quotes/CaptureReviewPanel.tsx",
  // Modelli dei PDF: l'indirizzo dell'impresa in testata.
  "src/components/bagni/BagniTemplateEditor.tsx",
  "src/components/climatizzazione/ClimatizzazioneTemplateEditor.tsx",
  "src/components/elettrico/ElettricoTemplateEditor.tsx",
  "src/components/pavimenti/PavimentiTemplateEditor.tsx",
  "src/components/piscine/PiscineTemplateEditor.tsx",
  "src/components/ristrutturazione/RistrutturazioneTemplateEditor.tsx",
  "src/components/serramenti/SerramentiTemplateEditor.tsx",
  "src/components/termoidraulico/TermoidraulicoTemplateEditor.tsx",
  "src/components/tetti/TettiTemplateEditor.tsx",
  // Assistenza.
  "src/pages/azienda/TicketDetail.tsx",
  "src/components/tickets/NuovoTicketForm.tsx",
  "src/components/interventi/NuovoInterventoDialog.tsx",
  // Anagrafiche.
  "src/pages/azienda/SubappaltatoriPage.tsx",
  "src/pages/azienda/SubappaltatoreDetail.tsx",
  "src/components/suppliers/FornitoreEditor.tsx",
  "src/pages/azienda/WarehouseManager.tsx",
  "src/components/hr/HrProfiloSheet.tsx",
  "src/pages/azienda/personale/tabs/TabSedi.tsx",
  "src/components/marketing/ConvertToCustomerDialog.tsx",
  "src/components/opportunities/OpportunityDetailDialog.tsx",
  "src/pages/cliente/CustomerProfile.tsx",
  // Azienda e impostazioni.
  "src/components/settings/CompanyProfileForm.tsx",
  "src/pages/azienda/settings/SettingsSedi.tsx",
  "src/pages/azienda/fatturazione/ImpostazioniFatturazione.tsx",
  "src/components/billing/BillingDetailsCard.tsx",
  "src/components/billing/BillingActivationGuard.tsx",
  "src/components/telephony/TelephonyComplianceCard.tsx",
  "src/components/whatsapp-multi/WhatsAppProfiloDialog.tsx",
  "src/components/agenti/AgenteWhatsAppLeadPanel.tsx",
  // Documenti e magazzino.
  "src/pages/azienda/fatturazione/editor/EditorClienteSection.tsx",
  "src/pages/azienda/fatturazione/editor/EditorDDTOpzioniCard.tsx",
  "src/components/warehouse/UscitaMerceSheet.tsx",
  // Piattaforma.
  "src/pages/admin/CreateCompany.tsx",
  "src/components/admin/company/CompanyDetailsTab.tsx",
  "src/components/admin/outreach/OutreachBrands.tsx",
];

describe("indirizzi: una ricerca sola", () => {
  it("solo ricercaIndirizzi chiama la ricerca di maps-proxy", () => {
    const chiamano = sorgenti(/\.tsx?$/).filter((f) => /action:\s*["'](?:autocomplete|place-details)["']/.test(leggi(f)));
    expect(chiamano).toEqual(["src/lib/indirizzi/ricercaIndirizzi.ts"]);
  });

  it("nessun campo indirizzo senza ricerca, salvo le eccezioni scritte", () => {
    const senza: string[] = [];
    for (const f of sorgenti(/\.tsx$/)) {
      if (ECCEZIONI[f]) continue;
      const testo = leggi(f);
      for (const m of testo.matchAll(ELEMENTO)) {
        if (SEGNAPOSTO_INDIRIZZO.test(m[2]) || REGISTRATO_INDIRIZZO.test(m[2])) {
          senza.push(`${f}:${testo.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    // Un campo nuovo qui: usare CampoIndirizzo (riga unica, o via con città/CAP/provincia riempiti da onScegli);
    // se davvero non è un indirizzo da cercare, va tra le eccezioni col perché.
    expect(senza).toEqual([]);
  });

  it("le eccezioni esistono ancora e hanno davvero il campo semplice (se no si tolgono)", () => {
    for (const f of Object.keys(ECCEZIONI)) {
      const testo = leggi(f);
      const semplici = [...testo.matchAll(ELEMENTO)].filter((m) => SEGNAPOSTO_INDIRIZZO.test(m[2]) || REGISTRATO_INDIRIZZO.test(m[2]));
      expect(semplici.length, f).toBeGreaterThan(0);
    }
  });

  it.each(MODULI)("%s usa la ricerca", (f) => {
    expect(leggi(f)).toMatch(/<CampoIndirizzo\b|<AddressAutocomplete\b|<CustomerAddressFields\b|<IndirizzoDeiLavori\b/);
  });

  it("i campi in linea con l'etichetta «Indirizzo» cercano l'indirizzo", () => {
    const senza = sorgenti(/\.tsx$/).flatMap((f) => {
      const testo = leggi(f);
      return inLineaSenzaRicerca(testo).map((m) => `${f}:${testo.slice(0, m.index).split("\n").length}`);
    });
    expect(senza).toEqual([]);
    // Scheda cliente (residenza e cantiere) e scheda contatto: la scelta salva via, città, CAP e provincia insieme.
    for (const f of ["src/components/clients/CustomerProfileCard.tsx", "src/pages/azienda/marketing/MarketingContactDetail.tsx"]) {
      expect(leggi(f), f).toMatch(/<InlineField\b(?:(?!\/>)[\s\S])*?\sindirizzo\s(?:(?!\/>)[\s\S])*?onSelectIndirizzo=/);
    }
    expect(leggi("src/components/marketing/contacts/InlineField.tsx")).toMatch(/<CampoIndirizzo\b/);
  });

  it("il guardiano riconosce i campi semplici", () => {
    const prova = (jsx: string) => [...jsx.matchAll(ELEMENTO)].some((m) => SEGNAPOSTO_INDIRIZZO.test(m[2]) || REGISTRATO_INDIRIZZO.test(m[2]));
    expect(prova(`<Input value={a} onChange={(e) => set(e.target.value)} placeholder="Via Roma 1" />`)).toBe(true);
    expect(prova(`<Input\n  value={a}\n  placeholder={x ? \`\${x} · dal profilo\` : "Es. Via Roma 42"}\n/>`)).toBe(true);
    expect(prova(`<Textarea rows={2} placeholder="Indirizzo cantiere o luogo consegna…" />`)).toBe(true);
    expect(prova(`<Input id="sede-indirizzo" {...form.register('indirizzo')} />`)).toBe(true);
    expect(prova(`<Input placeholder="Milano" />`)).toBe(false);
    expect(prova(`<CampoIndirizzo value={a} onChange={set} placeholder="Via Roma 1" />`)).toBe(false);

    const inLinea = (jsx: string) => inLineaSenzaRicerca(jsx).length > 0;
    expect(inLinea(`<InlineField label="Indirizzo" value={c.address || ""} onSave={(v) => salva(v)} />`)).toBe(true);
    expect(inLinea(`<InlineField\n  label="Indirizzo"\n  value={c.indirizzo}\n  onSelectIndirizzo={scegli}\n/>`)).toBe(true);
    expect(inLinea(`<InlineField\n  label="Indirizzo"\n  value={c.address}\n  indirizzo\n  onSelectIndirizzo={scegli}\n/>`)).toBe(false);
    expect(inLinea(`<InlineField label="Città" value={c.city} onSave={salva} />`)).toBe(false);
  });
});
