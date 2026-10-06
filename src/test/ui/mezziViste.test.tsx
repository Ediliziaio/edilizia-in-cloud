import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { MezzoConAssegnazione, MezzoDisponibilita, MezzoScadenza } from "@/types/mezzi";
import type { MontaggioInCorso } from "@/lib/mezzi/gruppiMezzi";

/**
 * La pagina Mezzi e attrezzature divisa in gruppi (06/10/2026), come i
 * subappaltatori: per tipo, dove sono, elenco; i riquadri contano e filtrano;
 * su ogni mezzo i documenti che mancano; i ponteggi sotto i cantieri dove sono
 * montati; da telefono due viste.
 */

const stato = vi.hoisted(() => ({
  mobile: false,
  mezzi: [] as unknown[],
  scadenze: [] as unknown[],
  segnalazioni: [] as unknown[],
  documenti: undefined as Map<string, Set<string>> | undefined,
  montaggi: [] as unknown[],
  disponibilita: new Map<string, unknown>(),
  categorie: [] as unknown[],
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditMezzi: true, isAdmin: false, solaLettura: false }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1", name: "Edile Prova" }, company: null as unknown }) }));
vi.mock("@/hooks/useMezzi", () => ({
  useMezzi: () => ({ data: stato.mezzi, isLoading: false, error: null as Error | null, refetch: vi.fn() }),
  useMezziScadenze: () => ({ data: stato.scadenze }),
  useSegnalazioniAperte: () => ({ data: stato.segnalazioni }),
  useCostiParco: () => ({ data: { documenti: [] as unknown[], manutenzioni: [] as unknown[] } }),
  useMezziCategorie: () => ({ data: stato.categorie }),
  useMezziDisponibilita: () => ({ data: stato.disponibilita }),
  useUltimeViste: () => ({ data: new Map() }),
  useCopertineMezzi: () => ({ data: new Map() }),
  useDocumentiRegistrati: () => ({ data: stato.documenti }),
  useMontaggiInCorso: () => ({ data: stato.montaggi }),
}));
// I dialoghi hanno i loro test: qui conta la pagina.
vi.mock("@/components/mezzi/MezzoFormDialog", () => ({ MezzoFormDialog: (): null => null }));
vi.mock("@/components/mezzi/EtichetteQrDialog", () => ({ EtichetteQrDialog: (): null => null }));
vi.mock("@/components/mezzi/CategorieAttrezziDialog", () => ({ CategorieAttrezziDialog: (): null => null }));
vi.mock("@/components/mezzi/ScansionaMezzo", () => ({ ScansionaMezzoButton: () => <button type="button">Scansiona</button> }));

import MezziList from "@/pages/azienda/MezziList";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const mezzo = (extra: Partial<MezzoConAssegnazione>): MezzoConAssegnazione => ({
  id: "m", company_id: "c1", nome: "Mezzo", tipo: "furgone", targa: null, marca: null, modello: null, matricola: null, anno: null,
  contatore: null, contatore_unita: "km", contatore_aggiornato_il: null, possesso: "proprieta", stato: "in_servizio",
  assegnato_hr_profilo_id: null, assegnato_order_id: null, su_mezzo_id: null, foto_path: null, valore_acquisto: null,
  data_acquisto: null, rata_mensile: null, note: null, deleted_at: null, created_by: null, created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z", classe: "mezzo", categoria_id: null, gestione: "singola", unita_misura: null,
  quantita_totale: null, codice: null, assegnato_persona: null, assegnato_commessa: null, su_mezzo_nome: null,
  ...extra,
});
const scadenza = (extra: Partial<MezzoScadenza>): MezzoScadenza => ({
  company_id: "c1", mezzo_id: "m", mezzo_nome: "Mezzo", targa: null, origine: "documento", riferimento_id: "r",
  categoria: "assicurazione", titolo: null, data_scadenza: "2026-12-31", contatore_scadenza: null, contatore_attuale: null,
  contatore_unita: "km", alert_giorni_prima: 30, stato: "valido", ...extra,
});

function Indirizzo() {
  const l = useLocation();
  return <p data-testid="indirizzo">{l.search}</p>;
}
const apri = (cerca = "") =>
  render(
    <MemoryRouter initialEntries={[`/azienda/mezzi${cerca}`]}>
      <Routes>
        <Route path="/azienda/mezzi" element={<><MezziList incorporata /><Indirizzo /></>} />
      </Routes>
    </MemoryRouter>,
  );
const sezione = (titolo: RegExp) => screen.getByText(titolo, { selector: "h3 span" }).closest("details")!;
// I riquadri sono «bottoni» (role=button); alcune etichette ci sono anche nei riquadri da telefono.
const riquadro = (nome: string) =>
  screen.getAllByText(nome).map((x) => x.closest('[role="button"]')).find(Boolean) as HTMLElement;

beforeEach(() => {
  stato.mobile = false;
  stato.mezzi = [
    mezzo({ id: "f1", nome: "Ducato bianco", tipo: "furgone", targa: "GA123BC", assegnato_order_id: "o1", assegnato_commessa: "ORD-1 · Rossi",
      assegnato_hr_profilo_id: "p1", assegnato_persona: "Luca Ferrari", contatore: 84000 }),
    mezzo({ id: "f2", nome: "Transit grigio", tipo: "furgone", targa: "GB456CD" }),
    mezzo({ id: "g1", nome: "Gru Merlo", tipo: "sollevamento", stato: "in_officina" }),
    mezzo({ id: "a1", nome: "Panda aziendale", tipo: "autovettura", possesso: "noleggio_lungo" }),
  ];
  stato.documenti = new Map([
    ["f1", new Set(["assicurazione"])],
    ["f2", new Set(["assicurazione", "bollo", "revisione"])],
    ["g1", new Set(["assicurazione", "verifica_periodica"])],
    ["a1", new Set(["contratto"])],
  ]);
  stato.scadenze = [
    scadenza({ mezzo_id: "f2", mezzo_nome: "Transit grigio", categoria: "revisione", data_scadenza: "2026-10-20", stato: "in_scadenza" }),
    scadenza({ mezzo_id: "f2", mezzo_nome: "Transit grigio", categoria: "assicurazione", data_scadenza: "2027-03-01", stato: "valido" }),
  ];
  stato.segnalazioni = [];
  stato.montaggi = [];
  stato.disponibilita = new Map();
  stato.categorie = [];
});
afterEach(cleanup);

describe("Mezzi in gruppi", () => {
  it("si apre per tipo: i furgoni insieme, chi è sul cantiere e chi è da sistemare, e su ogni furgone cosa manca", () => {
    apri();
    expect(screen.getByRole("button", { name: "Per tipo" })).toHaveAttribute("aria-pressed", "true");
    const furgoni = sezione(/^Furgoni$/);
    expect(within(furgoni).getByText("2 mezzi")).toBeInTheDocument();
    expect(within(furgoni).getByText(/1 sui cantieri/)).toBeInTheDocument();
    expect(within(furgoni).getByText(/2 da sistemare/)).toBeInTheDocument();
    // il Ducato: dov'è (cantiere e chi lo guida) e cosa manca
    expect(within(furgoni).getByText(/ORD-1 · Rossi · Luca Ferrari/)).toBeInTheDocument();
    expect(within(furgoni).getByText("Mancano: bollo, revisione")).toBeInTheDocument();
    // il Transit ha tutto, ma la revisione sta per scadere
    expect(within(furgoni).getByText(/In sede/)).toBeInTheDocument();
    expect(within(furgoni).getByText(/Revisione · scade il 20\/10\/2026/)).toBeInTheDocument();
    // la Panda a noleggio lungo col contratto è in regola
    expect(sezione(/^Auto$/)).not.toHaveTextContent("Manca");
  });

  it("finché non si sa quali documenti ci sono, nessun «Manca»: meglio di un falso allarme", () => {
    stato.documenti = undefined;
    apri();
    expect(screen.queryByText(/Mancano:/)).not.toBeInTheDocument();
  });

  it("i riquadri contano e filtrano: sui cantieri, documenti da sistemare, fermi", () => {
    apri();
    expect(riquadro("Sui cantieri")).toHaveTextContent("1");
    expect(riquadro("Sui cantieri")).toHaveTextContent("su 1 commessa");
    // Ducato (bollo e revisione mancanti) e Transit (revisione in scadenza)
    expect(riquadro("Documenti da sistemare")).toHaveTextContent("2");
    expect(riquadro("Fermi")).toHaveTextContent("1");
    fireEvent.click(riquadro("Fermi"));
    expect(screen.getByText("Gru Merlo")).toBeInTheDocument();
    expect(screen.queryByText("Ducato bianco")).not.toBeInTheDocument();
    // di nuovo: tolto il filtro
    fireEvent.click(riquadro("Fermi"));
    expect(screen.getByText("Ducato bianco")).toBeInTheDocument();
  });

  it("dove sono: prima i cantieri, con il link alla commessa; i mezzi liberi «in sede»", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Dove sono" }));
    expect(screen.getByTestId("indirizzo")).toHaveTextContent("per=dove");
    const titoli = screen.getAllByText(/./, { selector: "h3 span" }).map((x) => x.textContent);
    expect(titoli).toEqual(["ORD-1 · Rossi", "In sede"]);
    const cantiere = sezione(/^ORD-1 · Rossi$/);
    expect(within(cantiere).getByText("Ducato bianco")).toBeInTheDocument();
    expect(within(cantiere).getByRole("link", { name: "Apri la commessa" })).toHaveAttribute("href", "/azienda/ordini/o1");
    // nella vista dove sono la riga dice il tipo, e chi lo ha sul cantiere
    expect(within(cantiere).getByText(/Furgone · con Luca Ferrari/)).toBeInTheDocument();
    expect(sezione(/^In sede$/)).toHaveTextContent("Gru Merlo");
  });

  it("il ponteggio a m² sta sotto il cantiere dove è montato, con la sua parte, e in magazzino col resto", () => {
    stato.mezzi = [
      mezzo({ id: "p", nome: "Ponteggio a telai", tipo: "attrezzatura", classe: "attrezzatura", gestione: "quantita", unita_misura: "mq", quantita_totale: 800 }),
      mezzo({ id: "t", nome: "Trapano Hilti", tipo: "attrezzatura", classe: "attrezzatura", su_mezzo_id: "f1", su_mezzo_nome: "Ducato bianco" }),
    ];
    stato.montaggi = [{ mezzoId: "p", orderId: "o1", dove: "ORD-1 · Rossi", quantita: 300 }] satisfies MontaggioInCorso[];
    stato.disponibilita = new Map<string, MezzoDisponibilita>([
      ["p", { mezzo_id: "p", company_id: "c1", unita_misura: "mq", quantita_totale: 800, in_uso: 300, disponibile: 500, cantieri: 1 }],
    ]);
    apri("?vista=attrezzature&per=dove");
    expect(sezione(/^ORD-1 · Rossi$/)).toHaveTextContent("300 m² montati");
    expect(sezione(/^A bordo di Ducato bianco$/)).toHaveTextContent("Trapano Hilti");
    expect(sezione(/^In magazzino$/)).toHaveTextContent("500 m² in magazzino su 800 m²");
    // i riquadri delle attrezzature: il ponteggio montato è sui cantieri
    expect(riquadro("Sui cantieri")).toHaveTextContent("1");
    expect(riquadro("Non viste")).toHaveTextContent("si contano con le etichette QR");
  });

  it("l'elenco a tabella, da computer: dove, stato, scadenza da guardare e documenti", () => {
    apri("?per=elenco");
    const righe = screen.getAllByRole("row");
    const ducato = righe.find((r) => r.textContent?.includes("Ducato bianco"))!;
    expect(ducato).toHaveTextContent("ORD-1 · Rossi · Luca Ferrari");
    expect(ducato).toHaveTextContent("Mancano: bollo, revisione");
    expect(ducato).toHaveTextContent("84.000 km");
    const transit = righe.find((r) => r.textContent?.includes("Transit grigio"))!;
    expect(transit).toHaveTextContent("Revisione · scade il 20/10/2026");
    expect(transit).toHaveTextContent("Completi");
    expect(righe.find((r) => r.textContent?.includes("Gru Merlo"))).toHaveTextContent("In officina");
  });

  it("dal telefono due viste sole; un indirizzo all'elenco apre per tipo", () => {
    stato.mobile = true;
    apri("?per=elenco");
    const viste = within(screen.getByRole("group", { name: "Vista" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(viste).toEqual(["Per tipo", "Dove sono"]);
    expect(screen.getByRole("button", { name: "Per tipo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sotto i 768px niente filtro per categoria, ma il bottone delle categorie resta (da tablet si vede)", () => {
    stato.mobile = true;
    stato.mezzi = Array.from({ length: 6 }, (_, i) =>
      mezzo({ id: `t${i}`, nome: `Attrezzo ${i}`, tipo: "attrezzatura", classe: "attrezzatura" }));
    apri("?vista=attrezzature");
    expect(screen.queryByRole("combobox", { name: "Filtra per categoria" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestisci le categorie" })).toBeInTheDocument();
  });

  it("cambiando elenco il filtro dei riquadri si toglie", () => {
    apri();
    fireEvent.click(riquadro("Fermi"));
    expect(screen.queryByText("Ducato bianco")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Attrezzature/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Mezzi/ }));
    expect(screen.getByText("Ducato bianco")).toBeInTheDocument();
  });
});
