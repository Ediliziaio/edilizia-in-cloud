/**
 * «Documenti da confermare»: i collegamenti (30/10/2026). Le bozze lette dagli allegati si vedevano
 * solo dentro la singola email; ora hanno un elenco, un numero in home e un posto nella barra delle
 * email. Qui si tiene fermo che i pezzi siano agganciati, e che confermare, scartare o caricare
 * aggiorni l'elenco e il numero (altrimenti la bozza resterebbe lì a vita).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

/** Il corpo di una funzione esportata di hooks.ts, fino alla successiva. */
function hook(nome: string): string {
  const sorgente = leggi("src/lib/email-ai/hooks.ts");
  const inizio = sorgente.indexOf(`export function ${nome}(`);
  expect(inizio, `hook ${nome} non trovato`).toBeGreaterThan(-1);
  const fine = sorgente.indexOf("\nexport function ", inizio + 10);
  return sorgente.slice(inizio, fine === -1 ? undefined : fine);
}

describe("agganci", () => {
  it("la rotta c'è e chiede il permesso delle email, come l'elenco delle email", () => {
    const rotte = leggi("src/routes/companyRoutes.tsx");
    expect(rotte).toContain('path="email/documenti" element={withCompanyPermission("canViewMarketingEmail", <DocumentiDaConfermarePage />)}');
    expect(rotte).toContain('lazy(() => import("@/pages/azienda/email/DocumentiDaConfermarePage"))');
  });

  it("il riquadro sta in Attività subito sotto «Dal cantiere, da approvare»", () => {
    const attivita = leggi("src/pages/azienda/AttivitaStaff.tsx");
    expect(attivita).toMatch(/<DaApprovareCantieri \/>[\s\S]{0,260}<DocumentiDaConfermareBox \/>/);
  });

  it("la home da computer lo conta tra le cose da sbloccare, solo per chi vede le email", () => {
    const regia = leggi("src/hooks/useRegiaOperativa.ts");
    expect(regia).toContain("useDocumentiDaConfermareCount(companyId, !!permessi.canViewMarketingEmail)");
    expect(regia).toContain("documentiDaConfermare: documenti.data ?? 0");
    expect(leggi("src/pages/azienda/CompanyDashboard.tsx")).toContain('to: "/azienda/email/documenti"');
  });

  it("la barra delle email ha il collegamento solo nel contesto azienda, non in quello amministratore", () => {
    expect(leggi("src/pages/azienda/email/EmailLayout.tsx")).toContain('documentiPath={companyIdOverride ? null : "/azienda/email/documenti"}');
    const barra = leggi("src/pages/azienda/email/components/EmailSidebar.tsx");
    expect(barra).toContain("useDocumentiDaConfermareCount(effectiveCompany?.id, !!documentiPath)");
    expect(barra).toMatch(/documentiPath && documentiDaConfermare > 0/);
  });

  it("l'elenco riusa la scheda del pannello dell'email: una sola scheda, non due", () => {
    const lista = leggi("src/components/email-ai/DocumentiDaConfermareLista.tsx");
    expect(lista).toContain('from "./DocumentoEstrattoPanel"');
    expect(lista).toMatch(/<DraftCard draft=\{doc\}/);
    expect(lista).toMatch(/<CarichiSection documentoId=\{doc\.id\}/);
    expect(lista).toMatch(/<ScadenzeSection documentoId=\{doc\.id\}/);
    const pannello = leggi("src/components/email-ai/DocumentoEstrattoPanel.tsx");
    expect(pannello).toMatch(/export function DraftCard\(/);
    expect(pannello).toMatch(/export function CarichiSection\(/);
    expect(pannello).toMatch(/export function ScadenzeSection\(/);
    // il pannello dell'email funziona come prima: le sezioni per email
    expect(pannello).toContain("<CarichiSection emailId={emailId} />");
    expect(pannello).toContain("<ScadenzeSection emailId={emailId} />");
  });
});

describe("l'elenco e il numero si aggiornano", () => {
  const CHIAVE = '["email-documenti-da-confermare"]';
  it.each([
    "useEstraiAllegato",
    "useAggiornaStatoDocumentoEstratto",
    "useAggiornaStatoCaricoDdt",
    "useScartaDocumentiEstratti",
  ])("%s invalida l'elenco unico", (nome) => {
    expect(hook(nome)).toContain(CHIAVE);
  });

  it("i carichi e le scadenze per documento si aggiornano con quelli per email", () => {
    for (const nome of ["useCreaCaricoDdt", "useAggiornaStatoCaricoDdt"]) {
      expect(hook(nome), nome).toContain('["email-ddt-carichi", "documento"]');
    }
    for (const nome of ["useRilevaScadenza", "useConfermaScadenza", "useScartaScadenza"]) {
      expect(hook(nome), nome).toContain('["email-scadenze-bozze", "documento"]');
    }
  });

  it("confermare il carico chiude anche la bozza del DDT, e solo se ancora da confermare", () => {
    const corpo = hook("useAggiornaStatoCaricoDdt");
    expect(corpo).toContain("documento_estratto_id");
    expect(corpo).toMatch(/update\(\{ stato: "confermato"[\s\S]*\.eq\("id", input\.documento_estratto_id\)[\s\S]*\.eq\("stato", "da_confermare"\)/);
    // dopo la conferma del carico, non prima: se il carico fallisce la bozza resta
    expect(corpo.indexOf('rpc("conferma_carico_ddt"')).toBeLessThan(corpo.indexOf('.from("email_documento_estratto")'));
  });

  it("il numero conta solo i documenti veri, e lo scarto in blocco tocca solo le bozze ancora da confermare", () => {
    expect(hook("useDocumentiDaConfermareCount")).toContain('.neq("tipo", TIPO_ALTRO)');
    const blocco = hook("useScartaDocumentiEstratti");
    expect(blocco).toContain('.in("id", ids)');
    expect(blocco).toContain('.eq("stato", "da_confermare")');
  });
});
