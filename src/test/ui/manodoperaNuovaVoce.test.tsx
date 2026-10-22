/**
 * Manodopera e servizi → finestra «Nuova voce» (10/10/2026).
 *
 * Il prezzo veniva dopo otto campi e le due scelte che decidono (il tipo di lavoro e l'unità) stavano in mezzo a codice,
 * descrizione, area e gruppo. Ora: Tipo e Unità, poi il Nome, poi il Costo e il prezzo che ne nasce (22/10/2026: prima
 * il prezzo veniva prima del costo); il resto è in «Altri dati», chiuso. Una voce nuova parte «dal costo», con il
 * ricarico del margine obiettivo; «Prezzo libero» è il modo di prima, con le stesse regole che bloccano il salvataggio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TariffaDialog } from "@/pages/azienda/settings/SettingsTariffe";
import { campiConCostoLavorazione, leggiCostoLavorazione } from "@/lib/tariffe/costoLavorazione";
import type { Tariffa } from "@/pages/azienda/settings/SettingsTariffe/types";

const api = vi.hoisted(() => ({
  insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(), error: vi.fn(), success: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => api } }));
vi.mock("@/hooks/useUserPermissions", () => ({ useUserPermissions: () => ({ data: { can_view_costs: false } }) }));
vi.mock("@/components/listino/TariffaProdottiCollegati", () => ({ TariffaProdottiCollegati: (): null => null }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success } }));

const squadre = [{ id: "squadra-1", name: "Squadra Nord" }];
const props = { open: true, onClose: vi.fn(), editing: null as Tariffa | null, companyId: "company-1", isAdmin: true, currentVertical: "bagno", onSaved: vi.fn(), squadre };

beforeEach(() => {
  vi.clearAllMocks();
  api.insert.mockResolvedValue({ error: null as null });
  api.update.mockReturnValue(api);
  api.eq.mockReturnValue(api);
  api.select.mockReturnValue(api);
  api.single.mockResolvedValue({ data: { id: "tariffa-1" }, error: null as null });
});
afterEach(cleanup);

const dialogo = () => screen.getByRole("dialog");
const altriDati = () => dialogo().querySelector("details") as HTMLDetailsElement;
/** `a` sta prima di `b` nella pagina. */
const prima = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const salva = () => screen.getByRole("button", { name: "Salva" });
/** il prezzo scritto a mano: il modo di prima del 22/10/2026 */
const prezzoLibero = () => fireEvent.click(screen.getByRole("radio", { name: "Prezzo libero" }));

describe("Nuova voce: l'ordine dei campi", () => {
  it("prima Tipo e Unità, poi il Nome, poi il Costo, poi il Prezzo che ne nasce e il Margine, poi «Altri dati»", () => {
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "60" } });

    const tipo = screen.getByLabelText("Tipo");
    const unita = screen.getByLabelText(/^Unità di fatturazione/);
    const nome = screen.getByLabelText(/^Nome/);
    const costo = screen.getByRole("heading", { name: "Come esegui il lavoro?" });
    const prezzo = screen.getByLabelText(/^Prezzo di vendita/);
    const margine = screen.getByText(/^Anteprima economica/);
    const altri = screen.getByText("Altri dati");

    expect([tipo, unita, nome, costo, prezzo, margine, altri].map((e, i, tutti) => i === 0 || prima(tutti[i - 1], e))).toEqual(Array(7).fill(true));
  });

  it("Tipo e Unità partono con il valore di oggi: «Posa» e «pz»", () => {
    render(<TariffaDialog {...props} />);
    expect(screen.getByLabelText("Tipo")).toHaveTextContent("Posa");
    expect(screen.getByLabelText(/^Unità di fatturazione/)).toHaveTextContent("pz");
    expect(screen.getByLabelText(/^Prezzo di vendita/)).toHaveAccessibleName("Prezzo di vendita (€ per pz)");
  });

  it("tutto il resto sta in «Altri dati», chiuso: codice, descrizione, listino di, area, gruppo, stato, incidenza, fonte", () => {
    render(<TariffaDialog {...props} />);
    const dettagli = altriDati();
    expect(dettagli.open).toBe(false);
    expect(within(dettagli).getByText("Altri dati")).toBeInTheDocument();
    for (const etichetta of ["Codice", "Descrizione", "Listino di", "Area di lavoro", "Gruppo di lavorazioni", "Stato", "Incidenza manodopera %", "Fonte"]) {
      expect(within(dettagli).getByLabelText(etichetta), etichetta).toBeInTheDocument();
    }
    // le due scelte e il prezzo NON sono lì dentro
    for (const campo of [screen.getByLabelText("Tipo"), screen.getByLabelText(/^Nome/), screen.getByLabelText(/^Prezzo di vendita/)]) {
      expect(dettagli.contains(campo)).toBe(false);
    }
  });

  it("«Altri dati» dice area e gruppo con cui nasce la voce, senza aprirlo", () => {
    render(<TariffaDialog {...props} currentVertical="serramentista" gruppoIniziale="finiture" />);
    expect(altriDati().querySelector("summary")).toHaveTextContent("Area: Serramenti · Gruppo: Finiture e ripristini");
  });

  it("si apre con un clic", () => {
    render(<TariffaDialog {...props} />);
    fireEvent.click(screen.getByText("Altri dati"));
    expect(altriDati().open).toBe(true);
  });
});

describe("Nuova voce: etichette collegate ai campi", () => {
  it("ogni etichetta punta a un campo che esiste, e ogni campo ha un nome per il lettore di schermo", () => {
    render(<TariffaDialog {...props} />);
    const etichette = Array.from(dialogo().querySelectorAll("label[for]"));
    expect(etichette.length).toBeGreaterThanOrEqual(12);
    for (const etichetta of etichette) {
      const campo = document.getElementById(etichetta.getAttribute("for")!);
      expect(campo, `«${etichetta.textContent}» punta a un campo`).not.toBeNull();
      expect(campo!, `«${etichetta.textContent}»`).toHaveAccessibleName();
    }
  });

  it("l'interruttore dello stato ha il suo nome e dice cosa succede", () => {
    render(<TariffaDialog {...props} />);
    const stato = screen.getByRole("switch", { name: "Stato" });
    expect(stato).toBeChecked();
    expect(stato).toHaveAccessibleDescription("Attiva (selezionabile in preventivo)");
  });

  it("il titolo è un titolo di finestra e «Prodotti collegati» ha il livello giusto e niente emoji", () => {
    render(<TariffaDialog {...props} editing={{ id: "t1", company_id: "company-1", nome: "Posa lavabo", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 250, costo_interno: 80, prezzo_costo: 80, attivo: true, custom_field_values: {} }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Modifica voce" })).toBeInTheDocument();
    const collegati = screen.getByRole("heading", { name: "Prodotti collegati a questa voce" });
    expect(collegati.tagName).toBe("H3");
    expect(collegati.textContent).toBe("Prodotti collegati a questa voce");
    expect(dialogo().textContent).not.toMatch(/🔗|⚠/u);
  });

  it("niente «tariffa»: la parola è «voce»", () => {
    render(<TariffaDialog {...props} />);
    expect(dialogo().textContent).not.toMatch(/tariff/i);
  });
});

describe("Nuova voce: cosa si salva non cambia", () => {
  it("nome, prezzo e costo: tutte le colonne di prima, con i valori di partenza (Posa, pz, area dal filtro, attiva)", async () => {
    render(<TariffaDialog {...props} />);
    prezzoLibero();
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "  Posa lavabo  " } });
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "60" } });
    fireEvent.click(salva());
    await waitFor(() => expect(api.insert).toHaveBeenCalledOnce());
    const dati = api.insert.mock.calls[0][0];
    expect(dati).toMatchObject({
      company_id: "company-1", nome: "Posa lavabo", codice: null, descrizione: null,
      tipo: "posa", unita: "pz", unita_fatturazione: "pz", vertical_associato: "bagno",
      prezzo_vendita: 100, fonte: null, incidenza_manodopera_pct: null,
      attivo: true, attiva: true, external_team_id: null, piano_base: null, prezzo_piano_aggiuntivo: null,
      costo_interno: 60, costo_default: 60, prezzo_costo: 60,
    });
    expect(dati.custom_field_values._gruppo_lavorazione).toBe("posa");
    expect(leggiCostoLavorazione(dati.custom_field_values)).toMatchObject({ modalita: "manuale", costo_applicato: 60 });
    expect(api.success).toHaveBeenCalledWith("Voce creata");
  });

  it("i campi di «Altri dati» si salvano anche chiusi", async () => {
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Ponteggio" } });
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Codice"), { target: { value: "PON-1" } });
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "Montaggio incluso" } });
    fireEvent.change(screen.getByLabelText("Incidenza manodopera %"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "Prezzario 2026" } });
    fireEvent.click(salva());
    await waitFor(() => expect(api.insert).toHaveBeenCalledOnce());
    expect(api.insert.mock.calls[0][0]).toMatchObject({ codice: "PON-1", descrizione: "Montaggio incluso", incidenza_manodopera_pct: 0.35, fonte: "Prezzario 2026" });
  });

  it("chi non vede i costi scrive prezzo e basta: niente colonne del costo", async () => {
    render(<TariffaDialog {...props} isAdmin={false} />);
    expect(screen.queryByLabelText("Costo diretto")).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Posa" } });
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "45" } });
    fireEvent.click(salva());
    await waitFor(() => expect(api.insert).toHaveBeenCalledOnce());
    expect(api.insert.mock.calls[0][0]).toMatchObject({ prezzo_vendita: 45 });
    expect(api.insert.mock.calls[0][0]).not.toHaveProperty("costo_interno");
  });
});

describe("Nuova voce: le regole che bloccano il salvataggio sono quelle di prima", () => {
  it("il costo uguale al prezzo (margine 0%) blocca, e lo dice con le parole giuste; più basso sblocca", () => {
    render(<TariffaDialog {...props} />);
    prezzoLibero();
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "50" } });
    expect(salva()).toBeDisabled();
    expect(dialogo()).toHaveTextContent("Il costo è uguale o più alto del prezzo di vendita. Correggi prima di salvare.");
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "49" } });
    expect(salva()).toBeEnabled();
    expect(dialogo()).not.toHaveTextContent("Correggi prima di salvare");
  });

  it("il costo più alto del prezzo blocca", () => {
    render(<TariffaDialog {...props} />);
    prezzoLibero();
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "80" } });
    expect(salva()).toBeDisabled();
  });

  it("una voce nuova senza prezzo non si salva", () => {
    render(<TariffaDialog {...props} />);
    prezzoLibero();
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "10" } });
    expect(salva()).toBeDisabled();
    expect(dialogo()).toHaveTextContent("Il prezzo di vendita deve essere maggiore di 0 per una nuova voce.");
  });

  it("senza nome non si salva, e non scrive niente", async () => {
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "20" } });
    fireEvent.click(salva());
    await waitFor(() => expect(api.error).toHaveBeenCalledWith("Il nome è obbligatorio"));
    expect(api.insert).not.toHaveBeenCalled();
  });
});

describe("Prezzo dal costo (22/10/2026)", () => {
  const prezzo = () => screen.getByLabelText(/^Prezzo di vendita/) as HTMLInputElement;

  it("una voce nuova parte dal costo con il ricarico del margine obiettivo, e salva come è nato il prezzo", async () => {
    render(<TariffaDialog {...props} ricaricoObiettivo={25} />);
    expect(screen.getByRole("radio", { name: "Dal costo" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Ricarico sul costo %")).toHaveValue(25);
    expect(screen.getByLabelText("oppure margine %")).toHaveValue(20);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Posa lavabo" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "60" } });
    expect(prezzo().value).toMatch(/75,00/);
    expect(prezzo()).toHaveAttribute("readonly");
    fireEvent.click(salva());
    await waitFor(() => expect(api.insert).toHaveBeenCalledOnce());
    expect(api.insert.mock.calls[0][0]).toMatchObject({ prezzo_vendita: 75, prezzo_modo: "dal_costo", ricarico_pct: 25, costo_interno: 60 });
  });

  it("ricarico e margine sono collegati: scrivendo il margine si aggiorna il ricarico, e viceversa", () => {
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText("oppure margine %"), { target: { value: "20" } });
    expect(screen.getByLabelText("Ricarico sul costo %")).toHaveValue(25);
    fireEvent.change(screen.getByLabelText("Ricarico sul costo %"), { target: { value: "100" } });
    expect(screen.getByLabelText("oppure margine %")).toHaveValue(50);
  });

  it("dal margine si calcola col ricarico esatto: 40% di margine su 60 € fa 100 €, non 100,002 €", async () => {
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Posa" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("oppure margine %"), { target: { value: "40" } });
    expect(screen.getByLabelText("Ricarico sul costo %")).toHaveValue(66.67);
    expect(prezzo().value).toMatch(/^100,00\s?€$/);
    fireEvent.click(salva());
    await waitFor(() => expect(api.insert).toHaveBeenCalledOnce());
    expect(api.insert.mock.calls[0][0]).toMatchObject({ prezzo_vendita: 100, ricarico_pct: 66.6667 });
  });

  it("le spese generali entrano nel costo pieno, e il ricarico si fa su quello", () => {
    render(<TariffaDialog {...props} speseGenerali={10} />);
    fireEvent.change(screen.getByLabelText("Ricarico sul costo %"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "100" } });
    expect(dialogo()).toHaveTextContent(/Costo pieno 110,00 €/);
    expect(prezzo().value).toMatch(/132,00/);
  });

  it("senza costo un prezzo dal costo non si salva, e dice cosa fare", () => {
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Posa" } });
    expect(salva()).toBeDisabled();
    expect(dialogo()).toHaveTextContent("Per un prezzo dal costo serve un costo maggiore di zero");
  });

  it("anche un costo a zero blocca il prezzo dal costo: il prezzo andrebbe a zero", () => {
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Posa" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "0" } });
    expect(salva()).toBeDisabled();
    expect(dialogo()).toHaveTextContent("serve un costo maggiore di zero");
  });

  it("il blocco «costo più alto del prezzo» guarda il costo pieno: con le spese generali 105 € su 100 € è una perdita", () => {
    render(<TariffaDialog {...props} speseGenerali={10} />);
    prezzoLibero();
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "105" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "100" } });
    expect(salva()).toBeDisabled();
    expect(dialogo()).toHaveTextContent("Il costo pieno, con le spese generali, è uguale o più alto del prezzo di vendita. Correggi prima di salvare.");
  });

  it("chi non vede i costi non riscrive il prezzo di una voce dal costo: lo legge e basta", async () => {
    render(<TariffaDialog {...props} isAdmin={false} editing={{ id: "t1", company_id: "company-1", nome: "Posa lavabo", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 130, costo_interno: 100, prezzo_costo: 100, attivo: true, custom_field_values: {}, prezzo_modo: "dal_costo", ricarico_pct: 30 }} />);
    expect(prezzo()).toHaveAttribute("readonly");
    expect(prezzo().value).toMatch(/130,00/);
    expect(screen.queryByRole("radio", { name: "Prezzo libero" })).toBeNull();
    expect(dialogo()).toHaveTextContent("Il prezzo nasce dal costo: lo cambia chi vede i costi.");
    fireEvent.click(salva());
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][0]).toMatchObject({ prezzo_vendita: 130 });
    expect(api.update.mock.calls[0][0]).not.toHaveProperty("prezzo_modo");
  });

  it("il prezzo salvato è al centesimo e torna col ricarico salvato (niente «da aggiornare» appena salvata)", async () => {
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Posa" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("oppure margine %"), { target: { value: "40" } });
    fireEvent.click(salva());
    await waitFor(() => expect(api.insert).toHaveBeenCalledOnce());
    // 1000 × 1,666667 = 1666,667 → 1666,67; dal ricarico salvato (66,6667) torna lo stesso prezzo
    expect(api.insert.mock.calls[0][0]).toMatchObject({ prezzo_vendita: 1666.67, ricarico_pct: 66.6667 });
  });

  it("una voce con prezzo libero passa al costo senza cambiare prezzo: parte dal ricarico che ha già", async () => {
    render(<TariffaDialog {...props} editing={{ id: "t1", company_id: "company-1", nome: "Posa lavabo", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 130, costo_interno: 100, prezzo_costo: 100, attivo: true, custom_field_values: {} }} />);
    expect(screen.getByRole("radio", { name: "Prezzo libero" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Dal costo" }));
    expect(screen.getByLabelText("Ricarico sul costo %")).toHaveValue(30);
    expect(prezzo().value).toMatch(/130,00/);
    fireEvent.click(salva());
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][0]).toMatchObject({ prezzo_vendita: 130, prezzo_modo: "dal_costo", ricarico_pct: 30 });
  });
});

describe("Nuova voce: «Altri dati» si apre da solo quando lì c'è da correggere", () => {
  const conSquadra = (modalita: "interna" | "subappalto"): Tariffa => {
    const config = { ...leggiCostoLavorazione(null), modalita, subappalto: 90, risorse: [{ id: "r1", nome: "Posatore", operatori: 1, ore: 2, costo_orario: 20 }] };
    return {
      id: "t2", company_id: "company-1", nome: "Posa con squadra", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 200,
      costo_interno: 40, prezzo_costo: 40, attivo: true, external_team_id: "squadra-1",
      custom_field_values: campiConCostoLavorazione({}, config, 40, "posa"),
    };
  };

  it("squadra interna + listino di una squadra: il campo da correggere è sotto gli occhi", () => {
    render(<TariffaDialog {...props} editing={conSquadra("interna")} />);
    expect(altriDati().open).toBe(true);
    expect(dialogo()).toHaveTextContent("Una squadra interna non può usare un listino riservato al subappaltatore: in «Altri dati» scegli Listino aziendale (generico).");
    expect(salva()).toBeDisabled();
    expect(within(altriDati()).getByLabelText("Listino di")).toBeVisible();
  });

  it("con il subappalto la stessa voce è a posto: «Altri dati» resta chiuso e si salva", () => {
    render(<TariffaDialog {...props} editing={conSquadra("subappalto")} />);
    expect(altriDati().open).toBe(false);
    expect(salva()).toBeEnabled();
  });
});

describe("Nuova voce: se non va a buon fine lo dice in italiano", () => {
  it("senza rete", async () => {
    api.insert.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Posa" } });
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "20" } });
    fireEvent.click(salva());
    await waitFor(() => expect(api.error).toHaveBeenCalledOnce());
    expect(api.error).toHaveBeenCalledWith("Voce non salvata. Connessione persa. Controlla la rete e riprova.");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("senza permesso (il database risponde con il suo testo)", async () => {
    api.insert.mockResolvedValue({ error: { code: "42501", message: "new row violates row-level security policy for table \"tariffe_aziendali\"" } });
    render(<TariffaDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Posa" } });
    fireEvent.change(screen.getByLabelText(/^Prezzo di vendita/), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Costo diretto"), { target: { value: "20" } });
    fireEvent.click(salva());
    await waitFor(() => expect(api.error).toHaveBeenCalledOnce());
    const testo = String(api.error.mock.calls[0][0]);
    expect(testo).toBe("Voce non salvata. Non hai i permessi per questa operazione. Contatta l'amministratore.");
    expect(testo).not.toMatch(/row-level|violates/i);
  });

  it("una modifica che il database ignora senza errore non si annuncia come «aggiornata»", async () => {
    api.single.mockResolvedValue({ data: null as null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } });
    render(<TariffaDialog {...props} editing={{ id: "t1", company_id: "company-1", nome: "Posa lavabo", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 250, costo_interno: 80, prezzo_costo: 80, attivo: true, custom_field_values: {} }} />);
    fireEvent.click(salva());
    await waitFor(() => expect(api.error).toHaveBeenCalledOnce());
    expect(api.error).toHaveBeenCalledWith("Voce non salvata. Non è stato cambiato niente: forse non hai il permesso, o l'elemento non esiste più.");
    expect(api.success).not.toHaveBeenCalled();
  });
});
