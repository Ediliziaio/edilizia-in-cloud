import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FatturaElettronicaPannello } from "@/components/fatturazione/FatturaElettronicaPannello";
import sorgenteDettaglio from "@/pages/azienda/fatturazione/DocumentoDetail.tsx?raw";
import type { DocumentoFiscale } from "@/types/fatturazione";

/**
 * Emettere una bozza dal dettaglio del documento (12/10/2026).
 *
 * Chi apriva una bozza dal dettaglio trovava «Emetti» solo dentro la modifica.
 * Ora l'azione sta anche sul dettaglio e nel riquadro «Stato fattura elettronica»,
 * dove i passi la descrivono: assegna il numero definitivo e porta la fattura a
 * «Da inviare allo SDI». Proforma e preventivo hanno il loro flusso e non la vedono.
 */

const doc = (x: Record<string, unknown>) =>
  ({ numero: "1", sdi_errori: [], ...x }) as unknown as DocumentoFiscale;
const noop = () => {};

afterEach(cleanup);

describe("FatturaElettronicaPannello: «Emetti» per una bozza", () => {
  it("una bozza col gancio onEmetti mostra «Emetti» e chiede conferma prima di assegnare il numero", async () => {
    const onEmetti = vi.fn();
    render(
      <FatturaElettronicaPannello
        doc={doc({ tipo: "fattura", stato: "bozza", numero: "Bozza TEST0001" })}
        azienda={null}
        tipoLabel="Fattura"
        onEsportaXml={noop}
        onEmetti={onEmetti}
      />,
    );

    // Il riquadro dice che è una bozza modificabile ed espone «Emetti».
    expect(screen.getByText(/Non è ancora stata emessa/)).toBeInTheDocument();
    const emetti = screen.getByRole("button", { name: "Emetti" });
    // Prima si emette: «Invia allo SDI» non c'è ancora.
    expect(screen.queryByRole("button", { name: /Invia allo SDI/ })).not.toBeInTheDocument();

    // La conferma avverte che il numero definitivo è assegnato adesso, senza ritorno.
    fireEvent.click(emetti);
    expect(await screen.findByText(/numero definitivo/i)).toBeInTheDocument();
    expect(screen.getByText(/aggiornata a oggi/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Emetti documento" }));
    expect(onEmetti).toHaveBeenCalledTimes(1);
  });

  it("senza il gancio onEmetti il riquadro resta com'era: nessun pulsante «Emetti»", () => {
    render(
      <FatturaElettronicaPannello
        doc={doc({ tipo: "fattura", stato: "bozza" })}
        azienda={null}
        tipoLabel="Fattura"
        onEsportaXml={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: "Emetti" })).not.toBeInTheDocument();
  });

  it("una volta emessa (da inviare allo SDI) compare «Invia allo SDI» e non più «Emetti»", () => {
    // Anche passando onEmetti, lo stato comanda: a documento emesso tocca l'invio.
    render(
      <FatturaElettronicaPannello
        doc={doc({ tipo: "fattura", stato: "emessa" })}
        azienda={null}
        tipoLabel="Fattura"
        onEsportaXml={noop}
        onInvia={noop}
        onEmetti={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /Invia allo SDI/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Emetti" })).not.toBeInTheDocument();
  });
});

describe("DocumentoDetail: l'azione «Emetti» sul dettaglio", () => {
  it("riusa useEmittiDocumento e rilegge il documento a emissione riuscita", () => {
    expect(sorgenteDettaglio).toContain("useEmittiDocumento");
    expect(sorgenteDettaglio).toContain("emittiMutation.mutate(doc.id, { onSuccess: () => { void refetch(); } })");
  });

  it("mostra «Emetti» solo per una bozza di tipo SDI, mai per proforma o preventivo", () => {
    expect(sorgenteDettaglio).toContain(
      'const canEmettere = doc.stato === "bozza" && TIPI_SDI.includes(doc.tipo) && !isProforma && !isPreventivo;',
    );
  });

  it("porta il gancio «Emetti» anche nel riquadro «Stato fattura elettronica»", () => {
    expect(sorgenteDettaglio).toContain("onEmetti={canEmettere ? handleEmetti : undefined}");
    expect(sorgenteDettaglio).toContain("isEmitting={emittiMutation.isPending}");
  });
});
