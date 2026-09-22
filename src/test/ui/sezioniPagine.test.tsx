import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

// Il voto del Profilo azienda si legge dal database: qui basta sapere che c'è.
vi.mock("@/components/preventivi/VotoOnlineDelProfilo", () => ({
  VotoOnlineDelProfilo: () => <p>Il voto del Profilo azienda</p>,
}));

import { SezionePaginaEdile } from "@/components/preventivi/SezionePaginaEdile";
import { ContenutoPagina } from "@/components/preventivi/ContenutoPagina";
import {
  PAGINE_EDITOR_EDILI, PAGINE_EDITOR_FOTOVOLTAICO, PAGINE_EDITOR_SERRAMENTI, paginaEditor, type PaginaEditor,
} from "@/components/preventivi/pagineEditor";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { SR_PDF_PAGES_META } from "@/types/serramenti";
import { FV_PDF_PAGES_META } from "@/lib/fotovoltaico/pdfPages";
import { BLOCCHI, PAGINE_BLOCCO } from "../../../supabase/functions/_shared/blocchiPreventivo";

/**
 * Le pagine del preventivo nel menu degli editor (22/09/2026): ogni pagina che si scrive
 * ha la sua sezione, come «Chi siamo», nell'ordine in cui esce nel documento; prima le
 * pagine nuove si trovavano solo in «Ordine pagine».
 */
afterEach(cleanup);

function Edile({ sezione, mostraGaranzieIniziale = true }: { sezione: string; mostraGaranzieIniziale?: boolean }) {
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  const [ordine, setOrdine] = useState<unknown>(null);
  const [mostraGaranzie, setMostraGaranzie] = useState(mostraGaranzieIniziale);
  return (
    <>
      <SezionePaginaEdile
        sezione={sezione}
        settore="bagni"
        blocchi={blocchi}
        onBlocchi={setBlocchi}
        ordine={ordine}
        pagine={[]}
        onOrdine={setOrdine}
        mostraGaranzie={mostraGaranzie}
        onMostraGaranzie={setMostraGaranzie}
        contenuti={{
          recensioni: <p>Le recensioni del modello</p>,
          garanzie: <p>Le garanzie del modello</p>,
          domande: <p>Le domande del modello</p>,
          lavori: <p>Le foto dei lavori</p>,
        }}
        campoFoto={() => <div>carica una foto</div>}
      />
      <output data-testid="salvato">{JSON.stringify({ blocchi, ordine, mostraGaranzie })}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");
const visibile = (ordine: Array<{ chiave: string; visibile: boolean }>, chiave: string) => ordine.find((v) => v.chiave === chiave)?.visibile;

describe("il menu delle pagine", () => {
  const ordinate = (pagine: PaginaEditor[], documento: string[]) => {
    const posizioni = pagine.filter((p) => p.pagina).map((p) => documento.indexOf(p.pagina as string));
    expect(posizioni.every((x) => x >= 0)).toBe(true);
    expect(posizioni).toEqual([...posizioni].sort((a, b) => a - b));
  };

  it("Piano dei lavori: ogni blocco e ogni pagina con la testata ha la sua sezione, nell'ordine del documento", () => {
    const ids = PAGINE_EDITOR_EDILI.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BLOCCHI) expect(PAGINE_EDITOR_EDILI.some((p) => p.blocco === b.chiave)).toBe(true);
    for (const t of ["recensioni", "domande", "garanzie", "lavori"]) expect(PAGINE_EDITOR_EDILI.some((p) => p.testata === t)).toBe(true);
    ordinate(PAGINE_EDITOR_EDILI, CAPITOLI_EDILI.map((c) => c.chiave));
    // Le sezioni di prima restano, coi loro indirizzi: chi ha un link salvato ci arriva ancora.
    for (const id of ["page_ordine", "page_cover", "page_chi_siamo", "page_percorso", "page_testimonianze", "page_crono", "page_condizioni", "garanzie"]) {
      expect(ids).toContain(id);
    }
  });

  it("Serramenti e Fotovoltaico: lo stesso, sulle loro pagine", () => {
    for (const [pagine, meta] of [[PAGINE_EDITOR_SERRAMENTI, SR_PDF_PAGES_META], [PAGINE_EDITOR_FOTOVOLTAICO, FV_PDF_PAGES_META]] as const) {
      const documento = meta.map((m) => m.id as string);
      for (const id of Object.keys(PAGINE_BLOCCO).filter((id) => documento.includes(id))) {
        expect(pagine.some((p) => p.pagina === id)).toBe(true);
      }
      for (const id of ["recensioni", "faq", "garanzie"]) expect(pagine.some((p) => p.pagina === id)).toBe(true);
      ordinate(pagine, documento);
    }
    expect(PAGINE_EDITOR_SERRAMENTI.some((p) => p.pagina === "gallery_lavori" && p.testata === "lavori")).toBe(true);
  });
});

describe("la sezione di una pagina, negli editor edili", () => {
  it("un blocco: testi e foto, e «Mostra nel PDF» che è lo stesso dell'ordine delle pagine", () => {
    render(<Edile sezione="page_protezione" />);
    expect(screen.getByText("Protezione della casa")).toBeInTheDocument();
    const interruttore = screen.getByRole("switch", { name: "Mostra «Protezione della casa» nel PDF" });
    expect(interruttore).toBeChecked();
    fireEvent.change(screen.getByDisplayValue("Trattiamo la tua casa *come se fosse la nostra*."), { target: { value: "La tua casa, *protetta*." } });
    expect(salvato().blocchi).toEqual({ protezione: { titolo: "La tua casa, *protetta*." } });
    fireEvent.click(interruttore);
    expect(visibile(salvato().ordine, "protezione")).toBe(false);
    expect(visibile(salvato().ordine, "controlli")).toBe(true);
  });

  it("«Dicono di noi»: la testata, il voto del Profilo, le recensioni e la foto di fondo pagina", () => {
    render(<Edile sezione="page_testimonianze" />);
    expect(screen.getByLabelText("Titolo")).toHaveValue("La parola ai *nostri clienti*.");
    expect(screen.getByText("Il voto del Profilo azienda")).toBeInTheDocument();
    expect(screen.getByText("Le recensioni del modello")).toBeInTheDocument();
    expect(screen.queryByText("Le domande del modello")).toBeNull();
    expect(screen.getByText("Foto di «Dicono di noi»")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Titolo"), { target: { value: "Parlano *loro*." } });
    expect(salvato().blocchi).toEqual({ testata_recensioni: { titolo: "Parlano *loro*." } });
  });

  it("garanzie spente con l'interruttore di prima: riaccese, le domande restano spente com'erano", () => {
    render(<Edile sezione="garanzie" mostraGaranzieIniziale={false} />);
    expect(screen.getByText("Le garanzie del modello")).toBeInTheDocument();
    const interruttore = screen.getByRole("switch", { name: "Mostra «Le garanzie» nel PDF" });
    expect(interruttore).not.toBeChecked();
    fireEvent.click(interruttore);
    const s = salvato();
    expect(s.mostraGaranzie).toBe(true);
    expect(visibile(s.ordine, "garanzie")).toBe(true);
    expect(visibile(s.ordine, "domande")).toBe(false);
  });

  it("le sezioni che c'erano già ricevono solo la foto della pagina; le altre sezioni niente", () => {
    const { container, unmount } = render(<Edile sezione="page_chi_siamo" />);
    expect(screen.getByText("Foto della pagina")).toBeInTheDocument();
    expect(screen.getByText("Foto sotto «Chi siamo»")).toBeInTheDocument();
    expect(screen.queryByLabelText("Titolo")).toBeNull();
    expect(container.querySelector('[role="switch"]')).toBeNull();
    unmount();
    const vuota = render(<Edile sezione="brand" />);
    expect(vuota.container.querySelector("output")?.previousElementSibling).toBeNull();
  });

  it("una tavola esce da sola: un posto solo; una foto la sostituisce, e una tavola sostituisce le foto", () => {
    render(<Edile sezione="page_controlli" />);
    // Nei bagni i controlli hanno di serie la tavola dell'acqua.
    expect(screen.getByText("La tavola")).toBeInTheDocument();
    expect(screen.getByText(/Una tavola esce da sola e intera/)).toBeInTheDocument();
    const dallaLibreria = (nome: string) => {
      fireEvent.click(screen.getAllByRole("button", { name: /Scegli dalla libreria/ })[0]);
      fireEvent.click(screen.getAllByText(nome, { selector: "span" })[0].closest("button") as HTMLButtonElement);
    };
    dallaLibreria("installazione");
    expect(salvato().blocchi.controlli.foto).toEqual(["/pdf-stock/bagni/installazione.jpg"]);
    dallaLibreria("protezione");
    expect(salvato().blocchi.controlli.foto).toEqual(["/pdf-stock/bagni/installazione.jpg", "/pdf-stock/bagni/protezione.jpg"]);
    expect(screen.getByText("Foto (al massimo due)")).toBeInTheDocument();
    dallaLibreria("tavola dal vecchio al nuovo");
    expect(salvato().blocchi.controlli.foto).toEqual(["/pdf-stock/bagni/tavola-dal-vecchio-al-nuovo.jpg"]);
  });
});

describe("la sezione di una pagina, in Serramenti e Fotovoltaico", () => {
  function Pagina({ motore, sezione }: { motore: "serramenti" | "fotovoltaico"; sezione: string }) {
    const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
    const [esce, setEsce] = useState(true);
    return (
      <>
        <ContenutoPagina
          pagina={paginaEditor(motore, sezione) as PaginaEditor}
          motore={motore}
          settore={motore}
          blocchi={blocchi}
          onBlocchi={setBlocchi}
          contenuto={<p>Le domande del modello</p>}
          campoFoto={() => <div>carica una foto</div>}
          visibile={{ valore: esce, onChange: setEsce }}
        />
        <output data-testid="salvato">{JSON.stringify({ blocchi, esce })}</output>
      </>
    );
  }

  it("Serramenti, domande frequenti: l'interruttore della pagina, la testata di serie e il contenuto", () => {
    render(<Pagina motore="serramenti" sezione="page_faq" />);
    expect(screen.getByText("Esce nel preventivo")).toBeInTheDocument();
    expect(screen.getByLabelText("Titolo")).toHaveValue("Le risposte\nprima della conferma.");
    expect(screen.getByText("Le domande del modello")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Mostra «Domande frequenti» nel PDF" }));
    expect(salvato().esce).toBe(false);
    expect(screen.getByText("Spenta: nel preventivo non esce")).toBeInTheDocument();
  });

  it("Fotovoltaico, un blocco: testi e foto del blocco, senza testata", () => {
    render(<Pagina motore="fotovoltaico" sezione="page_come_funziona" />);
    expect(screen.queryByLabelText("Introduzione", { selector: "textarea#testata_domande-intro" })).toBeNull();
    fireEvent.change(screen.getByDisplayValue("Dal tuo tetto *alla tua presa*."), { target: { value: "Il sole, *in casa*." } });
    expect(salvato().blocchi).toEqual({ comeFunziona: { titolo: "Il sole, *in casa*." } });
  });
});
