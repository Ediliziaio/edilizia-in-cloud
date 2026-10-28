import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApplicabilitaItp } from "@/components/sicurezza/ApplicabilitaItp";
import { nuovoCriterioItp, type VerificaItp } from "@/lib/sicurezza/itp";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
afterEach(cleanup);
const prova = {
  id: "e1",
  company_id: "az",
  order_id: "c1",
  subappaltatore_id: "sub",
  titolo: "Originale esaminato",
  updated_at: "v1",
  file_path: "az/e1/a.pdf",
  file_name: "a.pdf",
  stato: "ricevuto",
} as EvidenzaFascicolo;
const verifica = (criteri: VerificaItp["criteri"]): VerificaItp =>
  ({
    id: "v1",
    company_id: "az",
    order_id: "c1",
    subappaltatore_id: "sub",
    versione: 2,
    fase_id: null,
    precedente_id: null,
    dal: "2026-10-27",
    al: null,
    esito: "da_integrare",
    attivita: "Verifica dimostrativa",
    responsabile: "Responsabile demo",
    ruolo_responsabile: "Tecnico",
    motivazione: "Verifica di prova",
    completezza: false,
    contesto: { impresa: { id: "sub", ragione_sociale: "Impresa demo", campo_subappaltatore_id: null }, commessa: { id: "c1", order_code: "C1", description: "Commessa demo" }, fase: null },
    registrato_da: "utente-demo",
    registrato_da_nome: "Utente demo",
    registrato_il: "2026-10-27T12:00:00Z",
    criteri,
    evidenze: [prova],
  });
describe("Applicabilità documentale registrata", () => {
  it("separa esclusioni motivate, esiti e prove, con ricerca per riferimento", () => {
    const v = verifica([
      {
        ...nuovoCriterioItp(),
        titolo: "PiMUS",
        applicabilita: "non_applicabile",
        esito: "non_applicabile",
        riferimento: "Riesame fase 2",
        note: "Ponteggi non previsti nella fase",
      },
      {
        ...nuovoCriterioItp(),
        titolo: "Attestato",
        applicabilita: "applicabile",
        esito: "conforme",
        evidenze: ["e1"],
      },
    ]);
    render(
      <ApplicabilitaItp verifica={v} evidenze={[prova]} riesame={false} />,
    );
    expect(screen.getByText("Conforme registrato")).toBeInTheDocument();
    expect(
      screen.getByText("Stessa versione del record esaminato"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filtra applicabilità"), {
      target: { value: "non_applicabile" },
    });
    expect(
      screen.getByText("Ponteggi non previsti nella fase"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Attestato")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cerca criteri di applicabilità"), {
      target: { value: "inesistente" },
    });
    expect(
      screen.getByText("Nessun criterio corrisponde ai filtri."),
    ).toBeInTheDocument();
  });
  it.each([
    "cambiata",
    "assente",
    "altra-azienda",
    "altra-commessa",
    "altra-impresa",
    "superata",
  ])("segnala fonte %s senza cancellare lo storico", (tipo) => {
    const current =
      tipo === "assente"
        ? []
        : [
            {
              ...prova,
              ...(tipo === "cambiata"
                ? { updated_at: "v2" }
                : tipo === "altra-azienda"
                  ? { company_id: "altra" }
                  : tipo === "altra-commessa"
                    ? { order_id: "c2" }
                    : tipo === "altra-impresa"
                      ? { subappaltatore_id: "sub2" }
                      : { stato: "superato" as const }),
            },
          ];
    render(
      <ApplicabilitaItp
        verifica={verifica([
          { ...nuovoCriterioItp(), titolo: "Attestato", evidenze: ["e1"] },
        ])}
        evidenze={current}
        riesame
      />,
    );
    expect(screen.getByText("Originale esaminato")).toBeInTheDocument();
    expect(
      screen.getByText("Fonte cambiata o non disponibile: da riesaminare"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "esiti qui sotto sono quelli registrati",
    );
    expect(
      screen.queryByText("Stessa versione del record esaminato"),
    ).not.toBeInTheDocument();
  });
  it("non presenta un’esclusione senza motivazione come completa", () => {
    render(
      <ApplicabilitaItp
        verifica={verifica([
          {
            ...nuovoCriterioItp(),
            titolo: "Da valutare",
            applicabilita: "non_applicabile",
            esito: "non_applicabile",
          },
        ])}
        evidenze={[]}
        riesame={false}
      />,
    );
    expect(
      screen.getByText(
        "Esclusione incompleta: motivazione e riferimento da integrare.",
      ),
    ).toBeInTheDocument();
  });
  it("nessun criterio non significa assenza di obblighi", () => {
    render(
      <ApplicabilitaItp
        verifica={verifica([])}
        evidenze={[]}
        riesame={false}
      />,
    );
    expect(
      screen.getByText(/Non indica assenza di requisiti/),
    ).toBeInTheDocument();
  });
});
