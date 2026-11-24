import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render as renderBase, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { aPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import type { AnteprimaChatProgetto } from "@/lib/planimetrie/chatProgetto";

const assistenza = vi.hoisted(() => ({ chiediSulProgetto: vi.fn(), interpretaComando: vi.fn() }));
vi.mock("@/lib/planimetrie/assistenzaStudio", () => assistenza);
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewPreventivi: true, canViewRenderAi: true }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/lib/planimetrie/fontiPrezzi", () => ({ useFontiPrezzi: () => ({ fonti: undefined as never, pronte: true }) }));

import { SilvioPlanimetria } from "@/components/planimetrie/SilvioPlanimetria";

const render = (ui: ReactElement) => renderBase(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

function casa() {
  const esito = comandiDaChatDisegno(piantaVuota(), "fatto", "Soggiorno 5,00 x 4,00 m\nCucina 3,00 x 4,00 m a destra di Soggiorno\nCamera 3,00 x 4,00 m a destra di Cucina\nCorridoio 2,00 x 4,00 m a destra di Camera");
  expect(esito.avvisi).toEqual([]);
  return aPlanimetria(esito.passi.at(-1)!.pianta);
}

function Prova({ onAnteprima, onVista3D }: { onAnteprima: (a: AnteprimaChatProgetto | null) => void; onVista3D?: () => void }) {
  const [documento] = useState(casa);
  const [bozza, setBozza] = useState<AnteprimaChatProgetto | null>(null);
  const [localeId, setLocaleId] = useState("");
  const piano = documento.livelli[0];
  return <SilvioPlanimetria documento={documento} selezione={{ livelloId: piano.id, ambito: "fatto", localeId }} locali={piano.fatto.locali}
    companyId="azienda-1" puoScrivere bozza={bozza} mostraPrima={false} salvataggio={false} analisi={false} onAnalisi={() => {}}
    onSeleziona={setLocaleId} onAnteprima={a => { setBozza(a); onAnteprima(a); }} onSalva={() => {}} onChiudi={() => {}} onVista3D={onVista3D} />;
}

async function scrivi(testo: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Scrivi a Silvio" }), { target: { value: testo } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Invia a Silvio" })); });
}

describe("una sola chat sulla scheda della planimetria", () => {
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); assistenza.chiediSulProgetto.mockReset(); assistenza.interpretaComando.mockReset(); });

  it("esegue con le regole, poi con l'interprete, e lascia le domande a Silvio", async () => {
    const onAnteprima = vi.fn();
    render(<Prova onAnteprima={onAnteprima} />);

    await scrivi("Porta tra Cucina e Soggiorno da 80 cm");
    expect(assistenza.interpretaComando).not.toHaveBeenCalled();
    expect(assistenza.chiediSulProgetto).not.toHaveBeenCalled();
    expect(onAnteprima).toHaveBeenCalledTimes(1);
    expect(onAnteprima.mock.calls[0][0]).toMatchObject({ ambito: "progetto:A", disegno: true });
    expect(screen.getByRole("region", { name: "Proposta di Silvio" })).toHaveTextContent("Variante A · Disegno");
    expect(screen.getByRole("button", { name: /Salva come variante/ })).toBeEnabled();

    assistenza.interpretaComando.mockResolvedValue({ comandi: ["Porta tra Camera e Corridoio da 80 cm"], domanda: "" });
    await scrivi("fammi una porticina da ottanta fra camera e corridoio");
    expect(assistenza.interpretaComando).toHaveBeenCalledWith("azienda-1", "fammi una porticina da ottanta fra camera e corridoio",
      ["Soggiorno", "Cucina", "Camera", "Corridoio"], "progetto");
    expect(await screen.findByText(/Ho capito così: Porta tra Camera e Corridoio/)).toBeInTheDocument();
    const seconda = onAnteprima.mock.calls.at(-1)![0] as AnteprimaChatProgetto;
    expect(seconda.ambito).toBe("progetto:A");
    expect(seconda.modifiche).toHaveLength(2);
    expect(seconda.documento.livelli[0].proposte[0].aperture.filter(a => a.tipo === "porta")).toHaveLength(2);
    expect(assistenza.chiediSulProgetto).not.toHaveBeenCalled();

    assistenza.chiediSulProgetto.mockResolvedValue({ testo: "Il bagno non c’è: la camera misura 12 m².", modifiche: [] });
    await scrivi("quanti metri quadri ha la camera?");
    await waitFor(() => expect(assistenza.chiediSulProgetto).toHaveBeenCalledTimes(1));
    expect(assistenza.interpretaComando).toHaveBeenCalledTimes(1);
    const [, , contesto, cronologia] = assistenza.chiediSulProgetto.mock.calls[0];
    expect(contesto.ambiente.nome).toBe("Camera");
    expect(contesto.stato).toMatch(/Variante A/);
    expect(cronologia.at(-1).testo).toMatch(/^Anteprima aperta/);
    expect(await screen.findByText(/la camera misura 12 m²/)).toBeInTheDocument();
    // Una domanda senza modifiche non scarta la proposta aperta.
    expect(screen.getByRole("region", { name: "Proposta di Silvio" })).toBeInTheDocument();
  });

  it("l'interprete che riconosce una domanda la passa a Silvio, un chiarimento resta suo", async () => {
    render(<Prova onAnteprima={() => {}} />);
    assistenza.interpretaComando.mockResolvedValueOnce({ comandi: [], domanda: "Di quanti centimetri?" });
    await scrivi("allarga un po' la cucina");
    expect(await screen.findByText("Di quanti centimetri?")).toBeInTheDocument();
    expect(assistenza.chiediSulProgetto).not.toHaveBeenCalled();

    assistenza.interpretaComando.mockResolvedValueOnce({ comandi: [], domanda: "", silvio: true });
    assistenza.chiediSulProgetto.mockResolvedValue({ testo: "Propongo il parquet.", modifiche: [] });
    await scrivi("metti il parquet in cucina");
    await waitFor(() => expect(assistenza.chiediSulProgetto).toHaveBeenCalledTimes(1));
    expect(assistenza.chiediSulProgetto.mock.calls[0][2].ambiente.nome).toBe("Cucina");
  });

  it("«3D» apre la vista della scheda senza AI", async () => {
    const onVista3D = vi.fn();
    render(<Prova onAnteprima={() => {}} onVista3D={onVista3D} />);
    await scrivi("3D");
    expect(onVista3D).toHaveBeenCalledOnce();
    expect(assistenza.interpretaComando).not.toHaveBeenCalled();
  });

  it("i comandi del disegno si spuntano, si annullano e restano quando cambia la stanza", async () => {
    const onAnteprima = vi.fn();
    render(<Prova onAnteprima={onAnteprima} />);
    await scrivi("Porta tra Cucina e Soggiorno da 80 cm");
    await scrivi("Finestra Cucina sul lato alto da 120 cm");
    const proposta = within(screen.getByRole("region", { name: "Proposta di Silvio" }));
    expect(proposta.getByRole("list", { name: "Proposte di modifica" }).querySelectorAll("li")).toHaveLength(2);
    expect(proposta.getByRole("tab", { name: "Computo" })).toBeInTheDocument();

    fireEvent.click(proposta.getByRole("checkbox", { name: "Includi Porta tra Cucina e Soggiorno da 80 cm" }));
    const senzaPorta = onAnteprima.mock.calls.at(-1)![0] as AnteprimaChatProgetto;
    expect(senzaPorta.documento.livelli[0].proposte[0].aperture.map(a => a.tipo)).toEqual(["finestra"]);

    // Cambiare stanza non scarta la variante né la conversazione.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: (onAnteprima.mock.calls[0][0] as AnteprimaChatProgetto).documento.livelli[0].fatto.locali[1].id } });
    expect(screen.getByRole("region", { name: "Proposta di Silvio" })).toBeInTheDocument();
    expect(screen.getAllByText("Finestra Cucina sul lato alto da 120 cm").length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "Includi Porta tra Cucina e Soggiorno da 80 cm" }));
    await scrivi("annulla l'ultimo");
    expect(await screen.findByText(/Ho tolto «Finestra Cucina sul lato alto da 120 cm»/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Annulla l’ultimo/ }));
    expect(onAnteprima.mock.calls.at(-1)![0]).toBeNull();
    expect(screen.queryByRole("region", { name: "Proposta di Silvio" })).not.toBeInTheDocument();
    expect(assistenza.interpretaComando).not.toHaveBeenCalled();
  });
});
