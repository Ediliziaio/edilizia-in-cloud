import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Il calendario di marketing puo' essere agganciato a UN calendario di UN
 * account esterno (Impostazioni → Calendari → passo 3). Questi test tengono
 * ferme le cose che il 09/09/2026 non tornavano: il push usava l'account del
 * responsabile invece di quello scelto, il ritorno da Google leggeva solo il
 * principale, le prenotazioni pubbliche non arrivavano su nessun calendario e
 * il trigger di cancellazione non aveva una chiave con cui chiamare l'edge.
 */
describe("Aggancio del calendario a Google", () => {
  const sync = leggi("supabase/functions/google-calendar-sync/index.ts");

  it("il push usa l'account dell'aggancio, e la mappa decide chi aggiorna o cancella", () => {
    expect(sync).toContain("async function risolviBersaglio(");
    expect(sync).toContain('c?.external_provider === "google" && c.external_connection_id && c.external_calendar_id');
    // update/delete: la mappa dice quale account ha l'evento, senza filtrare per chi clicca
    expect(sync).toContain("const effectiveUserId: string = mapping.user_id ?? userId;");
    expect(sync).toContain("const effectiveUserId: string = mapping?.user_id ?? userId;");
    expect(sync).not.toContain("resolveCalendarioDestinazione");
  });

  it("le fasce occupate arrivano anche dai calendari agganciati", () => {
    expect(sync).toContain("async function calendariAgganciati(");
    expect(sync).toContain("(await calendariAgganciati(admin, conn, settings?.primary_calendar_id)).forEach((c) => calendarIdSet.add(c.calendarId));");
    // "primary" e l'email dell'account sono lo stesso calendario: mai due mappe
    expect(sync).toContain("function eIlPrincipale(");
  });

  it("il ritorno da Google gira su tutti i calendari agganciati, non solo sul principale", () => {
    expect(sync).toContain("async function reconcileCalendario(");
    expect(sync).toContain("async function reconcilePerCalendario(");
    expect(sync).toContain("daLeggere.set(a.calendarId, a.marketingCalendarId);");
    // un evento importato da un calendario agganciato nasce dentro quel calendario di marketing
    expect(sync).toContain("calendar_id: marketingCalendarId,");
  });

  it("il canale webhook del calendario rilegge anche gli appuntamenti", () => {
    expect(sync).toContain("const appuntamenti = await reconcilePerCalendario(interno.connectionId, interno.calendarId)");
  });

  it("trigger e prenotazioni pubbliche possono spingere senza service key", () => {
    expect(sync).toContain('["push-event", "update-event", "delete-event"].includes(interno.action)');
  });
});

describe("Aggancio del calendario ad Apple e Outlook", () => {
  const apple = leggi("supabase/functions/apple-calendar-sync/index.ts");
  const outlook = leggi("supabase/functions/outlook-calendar-sync/index.ts");
  const hook = leggi("src/hooks/useCalendariEsterni.ts");

  it("Apple scrive nel calendario scelto e legge le fasce anche da li'", () => {
    expect(apple).toContain("async function risolviBersaglio(");
    expect(apple).toContain('c?.external_provider === "apple" && c.external_connection_id && c.external_calendar_id');
    expect(apple).toContain('.eq("external_provider", "apple")');
    expect(apple).not.toContain("aptOwner");
  });

  it("Outlook legge i calendari agganciati, e la tendina dice che non scrive", () => {
    expect(outlook).toContain('.eq("external_provider", "outlook")');
    expect(hook).toContain("outlook: false");
  });
});

describe("Prenotazioni pubbliche e cancellazioni arrivano sui calendari", () => {
  const crea = leggi("supabase/functions/public-booking-crea/index.ts");
  const gestisci = leggi("supabase/functions/public-booking-gestisci/index.ts");
  const trigger = leggi("supabase/migrations/20280913000000_trigger_calendario_delete_via_sveglia.sql");

  it("la prenotazione dal link pubblico spinge subito", () => {
    expect(crea).toContain('sincronizzaCalendariEsterni({ azione: "push-event"');
  });

  it("spostamento e disdetta dal link del cliente aggiornano il calendario", () => {
    expect(gestisci).toContain('azione: "update-event"');
    expect(gestisci).toContain('azione: "delete-event"');
  });

  it("il trigger di cancellazione passa dal segreto interno, non da una chiave che non c'e'", () => {
    expect(trigger).toContain("silvio_internal_cron_secret");
    expect(trigger).not.toContain("supabase_service_role_key");
    expect(trigger).toContain("'apple-calendar-sync', 'delete-event'");
  });
});

describe("Si capisce dove finiscono gli appuntamenti, e di chi e' l'account", () => {
  const config = leggi("src/components/settings/MarketingCalendarsConfig.tsx");
  const overview = leggi("src/components/integrations/CompanyCalendarsOverview.tsx");

  it("l'elenco dei calendari mostra nome del calendario e indirizzo dell'account", () => {
    expect(config).toContain("Calendario esterno</TableHead>");
    expect(config).toContain("emailAccount(cal.external_connection_id)");
  });

  it("la pagina dei collegamenti distingue il proprio account da quelli del team", () => {
    expect(config).toContain("Il tuo account");
    expect(config).toContain("Tutta l'azienda");
    expect(config).toContain("<CompanyCalendarsOverview />");
  });

  it("per ogni account collegato si vede a quali calendari serve", () => {
    expect(overview).toContain("calendari-per-account");
    expect(overview).toContain("Ci scrivono:");
  });
});

describe("Il calendario personale nasce agganciato", () => {
  const auth = leggi("supabase/functions/google-calendar-auth/index.ts");
  it("al collegamento Google il calendario personale punta al principale dell'account", () => {
    expect(auth).toContain('external_provider: "google", external_connection_id: conn.id, external_calendar_id: userInfo.email');
    // il nome lo chiede a Google: "Principale" sarebbe uguale per tutti
    expect(auth).toContain("calendar/v3/calendars/primary");
    expect(auth).toContain("if (cal.summary) nomePrincipale = cal.summary;");
  });
});
