/**
 * Preferenze del calendario Google (09/10/2026): il dialogo dice quello che fa.
 *
 * Due comandi non facevano niente e sono usciti: «Crea contatti dagli invitati Google» (nessun codice creava
 * contatti) e «Mostra gli eventi Google come "Occupato"» (la sincronizzazione salva il titolo vero e i colleghi lo
 * leggono). E il testo dell'importazione diceva il contrario del comportamento: con l'interruttore acceso
 * entrano TUTTI gli eventi, anche «Dentista»; solo da spento valgono quelli che iniziano con [CRM]
 * (google-calendar-sync/index.ts, `importAll`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import GoogleCalendarSyncPrefsDialog from "@/components/settings/GoogleCalendarSyncPrefsDialog";

const FRASE_COLLEGHI = "Per ora i colleghi dell'azienda vedono il titolo degli eventi di Google nel calendario.";

function apri(props: Partial<React.ComponentProps<typeof GoogleCalendarSyncPrefsDialog>> = {}) {
  const onSave = vi.fn();
  render(
    <GoogleCalendarSyncPrefsDialog
      open
      onOpenChange={() => {}}
      syncMode="two_way"
      direzione="both"
      importGoogleEvents
      allowTwoWay
      allowGoogleToImport
      onSave={onSave}
      isSaving={false}
      {...props}
    />,
  );
  return onSave;
}
afterEach(cleanup);

describe("Preferenze del calendario Google", () => {
  it("non ha più i due comandi che non facevano niente", () => {
    apri();
    expect(screen.getByRole("heading", { name: "Preferenze del calendario" })).toBeInTheDocument();
    expect(screen.queryByText(/Crea contatti dagli invitati/)).toBeNull();
    expect(screen.queryByText(/come "Occupato"/)).toBeNull();
    expect(screen.queryByText(/Mostra gli eventi Google/)).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("al posto del finto «Occupato» dice cosa vedono i colleghi", () => {
    apri();
    expect(screen.getByText(FRASE_COLLEGHI)).toBeInTheDocument();
    // vale in ogni direzione: gli impegni personali entrano comunque come fasce occupate, col loro titolo
    cleanup();
    apri({ direzione: "to_google" });
    expect(screen.getByText(FRASE_COLLEGHI)).toBeInTheDocument();
  });

  it("il testo dell'importazione dice cosa fa da acceso e da spento", () => {
    apri();
    const interruttore = screen.getByRole("switch", { name: /Importa tutti gli eventi di Google come appuntamenti/ });
    expect(interruttore).toBeChecked();
    const testo = document.querySelector("label[for='import-events']")?.textContent ?? "";
    expect(testo).toContain("Se è acceso, ogni evento del tuo Google Calendar diventa un appuntamento nel gestionale, anche quelli personali.");
    expect(testo).toContain("Se è spento, entrano solo gli eventi che iniziano con [CRM].");
    expect(testo).not.toContain("crm_sync");
  });

  it("l'importazione si sceglie solo se gli eventi di Google tornano nel gestionale", () => {
    apri({ direzione: "to_google" });
    expect(screen.queryByRole("switch")).toBeNull();
    cleanup();
    apri({ allowGoogleToImport: false });
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("salvando passa soltanto verso, modo e importazione: le due colonne senza lettore non si riscrivono", () => {
    const onSave = apri({ importGoogleEvents: false });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toEqual({ sync_mode: "two_way", sync_direction: "both", import_google_events_to_crm: true });
  });

  it("scegliendo «Solo verso il calendario» l'importazione si spegne", () => {
    const onSave = apri();
    fireEvent.click(screen.getByRole("radio", { name: /Solo verso il calendario/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(onSave.mock.calls[0][0].import_google_events_to_crm).toBe(false);
  });

  it("nessun lettore per le due colonne: lo dice il codice della sincronizzazione", () => {
    // La prova per cui sono uscite: se un giorno qualcuno le legge, questo test lo ricorda e il comando può tornare.
    for (const cartella of ["supabase/functions/google-calendar-sync/index.ts", "supabase/functions/google-calendar-auth/index.ts"]) {
      const codice = readFileSync(resolve(process.cwd(), cartella), "utf8");
      expect(codice, cartella).not.toContain("event_privacy");
      expect(codice, cartella).not.toContain("create_contacts_from_guests");
    }
  });
});
