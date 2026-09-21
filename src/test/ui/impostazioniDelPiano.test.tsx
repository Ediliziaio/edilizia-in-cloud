import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Le impostazioni seguono il piano (21/09/2026).
 *
 * Florin: un'azienda col piano Marketing «quando va nelle impostazioni vede
 * tutte le impostazioni anche per le banche, gestione ordini, ecc.». Il menu
 * principale nascondeva già i moduli fuori dal piano; le impostazioni no — né
 * il menu, né la ricerca, né la griglia su telefono, né l'indirizzo diretto.
 */

import {
  IMPOSTAZIONI_PER_TUTTI_I_PIANI,
  REQUISITI_IMPOSTAZIONI,
  REQUISITI_SEZIONI,
  impostazioneNelPiano,
  nomiRequisito,
  requisitoSoddisfatto,
  type StatoPiano,
} from "@/lib/impostazioni/pianoImpostazioni";

const radice = resolve(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(resolve(radice, percorso), "utf8");

/** Ener Italia, piano Marketing (21/09/2026): nessun modulo, CRM e simulatore sì. */
const FUNZIONI_ENER = new Set(["ai_agents", "automations", "crm_modulo", "email_marketing", "sales_os", "simulatore", "sms_marketing", "whatsapp_bot_ai"]);
const MARKETING: StatoPiano = {
  tuttoVisibile: false,
  pianoLimitato: false,
  moduloIncluso: () => false,
  livelloFunzione: (f) => (FUNZIONI_ENER.has(f) ? "enabled" : "disabled"),
};
const COMPLETO: StatoPiano = {
  tuttoVisibile: false,
  pianoLimitato: false,
  moduloIncluso: () => true,
  livelloFunzione: () => "enabled",
};

describe("ogni pagina delle impostazioni ha una regola per il piano", () => {
  it("nessuna pagina resta fuori dalla classificazione", () => {
    const rotte = leggi("src/routes/companyRoutes.tsx");
    const blocco = rotte.slice(
      rotte.indexOf("<Route index element={<SettingsIndexRoute />} />"),
      rotte.indexOf('<Route path="ritenute-garanzia"'),
    );
    const segmenti = [...new Set([...blocco.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1].split("/")[0]))];
    expect(segmenti.length).toBeGreaterThan(50);
    const classificate = new Set<string>([...Object.keys(REQUISITI_IMPOSTAZIONI), ...IMPOSTAZIONI_PER_TUTTI_I_PIANI]);
    expect(segmenti.filter((s) => !classificate.has(s))).toEqual([]);
  });

  it("una pagina non sta in tutte e due le liste", () => {
    const doppie = IMPOSTAZIONI_PER_TUTTI_I_PIANI.filter((s) => s in REQUISITI_IMPOSTAZIONI);
    expect(doppie).toEqual([]);
  });
});

describe("piano Marketing (Ener Italia)", () => {
  it("niente commesse, magazzino, costi, preventivi, fatture, firma, render", () => {
    for (const sezione of [
      "stati-ordine", "cartelle-documenti", "calendari-lavori", "qr-codici", "fornitori", "categorie-costi",
      "automazioni-finanza", "fatturazione", "listino", "tariffe", "bundle", "margini", "scontistica",
      "template-preventivi", "condizioni-firma", "firma-elettronica", "catalogo-render", "sopralluoghi",
    ]) {
      expect(impostazioneNelPiano(sezione, MARKETING), sezione).toBe(false);
    }
  });

  it("CRM, persone, integrazioni restano; i finanziamenti anche, per il simulatore", () => {
    for (const sezione of ["sequenze", "campi-personalizzati", "tag", "persone", "integrazioni", "profilo", "finanziamenti", "whatsapp-bot"]) {
      expect(impostazioneNelPiano(sezione, MARKETING), sezione).toBe(true);
    }
    expect(impostazioneNelPiano("/azienda/impostazioni/tariffe?tab=manutenzione", MARKETING)).toBe(false);
  });

  it("nelle integrazioni spariscono conti correnti e incassi con carta", () => {
    expect(requisitoSoddisfatto(REQUISITI_SEZIONI.conti_correnti, MARKETING)).toBe(false);
    expect(requisitoSoddisfatto(REQUISITI_SEZIONI.pagamenti_carta, MARKETING)).toBe(false);
  });
});

describe("le regole del menu principale", () => {
  it("piano completo: tutto", () => {
    for (const sezione of Object.keys(REQUISITI_IMPOSTAZIONI)) expect(impostazioneNelPiano(sezione, COMPLETO)).toBe(true);
  });

  it("azienda demo, piano in caricamento o assente: tutto", () => {
    const tutto = { ...MARKETING, tuttoVisibile: true };
    for (const sezione of Object.keys(REQUISITI_IMPOSTAZIONI)) expect(impostazioneNelPiano(sezione, tutto)).toBe(true);
  });

  it("piano limitato: i moduli non inclusi restano (in prova), le funzioni spente no", () => {
    const limitato = { ...MARKETING, pianoLimitato: true };
    expect(impostazioneNelPiano("stati-ordine", limitato)).toBe(true);
    expect(impostazioneNelPiano("firma-elettronica", limitato)).toBe(false);
  });

  it("una funzione in prova conta come presente", () => {
    const inProva: StatoPiano = { ...MARKETING, livelloFunzione: (f) => (f === "preventivi_crm" ? "preview" : "disabled") };
    expect(impostazioneNelPiano("template-preventivi", inProva)).toBe(true);
  });

  it("dice a parole cosa servirebbe", () => {
    expect(nomiRequisito("/azienda/impostazioni/stati-ordine")).toBe("Commesse");
    expect(nomiRequisito("listino")).toBe("Preventivi, Commesse o Magazzino");
  });
});

describe("tutte le porte d'ingresso guardano il piano", () => {
  it("menu, ricerca, griglia su telefono, Cmd+K, integrazioni", () => {
    expect(leggi("src/components/layouts/CompanyLayout.tsx")).toMatch(/visible: voce\.visible && impostazioneNelPiano\(voce\.to, piano\)/);
    expect(leggi("src/components/layouts/SettingsSearch.tsx")).toContain("impostazioneNelPiano(e.url, piano)");
    expect(leggi("src/pages/azienda/settings/SettingsMobileHub.tsx")).toContain("impostazioneNelPiano(i.to, piano)");
    expect(leggi("src/components/CommandPalette.tsx")).toContain("impostazioneNelPiano(item.path, piano)");
    expect(leggi("src/pages/azienda/settings/SettingsIntegrations.tsx")).toContain("{mostraContiCorrenti && <BankConnectionsCard />}");
  });

  it("il menu principale e le impostazioni leggono le stesse regole (useStatoPiano)", () => {
    expect(leggi("src/components/layouts/CompanyLayout.tsx")).not.toMatch(/const isLimitedPlan =/);
    expect(leggi("src/hooks/useStatoPiano.ts")).toMatch(/const isLimitedPlan =/);
  });
});

// ── La pagina aperta dall'indirizzo ──────────────────────────────────────────
let statoPiano: StatoPiano = MARKETING;
let isAdmin = true;
vi.mock("@/hooks/useStatoPiano", () => ({ useStatoPiano: () => ({ stato: statoPiano }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin, isLoading: false }) }));

import { SettingsLayout } from "@/components/layouts/SettingsLayout";

function apri(percorso: string) {
  return render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/azienda/impostazioni" element={<SettingsLayout />}>
          <Route path="stati-ordine" element={<p>Pagina degli stati ordine</p>} />
          <Route path="sequenze" element={<p>Pagina delle sequenze</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { statoPiano = MARKETING; isAdmin = true; });
afterEach(cleanup);

describe("Impostazioni aperte dall'indirizzo", () => {
  it("fuori dal piano: niente pagina, il motivo e il link ai piani", () => {
    apri("/azienda/impostazioni/stati-ordine");
    expect(screen.queryByText("Pagina degli stati ordine")).toBeNull();
    expect(screen.getByText("Non incluso nel tuo piano")).toBeTruthy();
    expect(screen.getByText(/fa parte di Commesse/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vedi i piani" }).getAttribute("href")).toBe("/azienda/impostazioni/abbonamento");
  });

  it("chi non è amministratore non vede i piani: gli si dice a chi chiedere", () => {
    isAdmin = false;
    apri("/azienda/impostazioni/stati-ordine");
    expect(screen.queryByRole("link", { name: "Vedi i piani" })).toBeNull();
    expect(screen.getByText(/chiedi all.amministratore/)).toBeTruthy();
  });

  it("nel piano: la pagina si apre", () => {
    apri("/azienda/impostazioni/sequenze");
    expect(screen.getByText("Pagina delle sequenze")).toBeTruthy();
    statoPiano = COMPLETO;
    cleanup();
    apri("/azienda/impostazioni/stati-ordine");
    expect(screen.getByText("Pagina degli stati ordine")).toBeTruthy();
  });
});
