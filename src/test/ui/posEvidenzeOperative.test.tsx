import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SezioneEmergenze, SezioneRumore } from "@/components/sicurezza/pos/PosSezioni";
import { ConsegneDpiLavorazionePos } from "@/components/sicurezza/pos/EvidenzeOperativePos";
import { RiferimentiSchedaPos } from "@/components/sicurezza/pos/SchedeStandardPos";
import type { DocumentoSicurezza } from "@/lib/sicurezza/documentiSicurezza";
import { lavorazioneVuota, posVuoto, type PosContenuto } from "../../../supabase/functions/_shared/posModello";
import { dataRiscontriDpiPos, type AddettoConConsegne, type RiscontroDpiPos } from "../../../supabase/functions/_shared/posEvidenzeOperative";
import type { FontePscSchedaPos } from "../../../supabase/functions/_shared/posFontiScheda";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePos", () => ({ chiamaServerPos: api }));
const rapporto: Pick<DocumentoSicurezza, "id" | "titolo" | "tipo" | "fonte" | "subappaltatore_id" | "file_path" | "data_documento"> = {
  id: "id-rapporto", titolo: "Rapporto RUM-11", tipo: "valutazione_rumore", fonte: "sicurezza",
  subappaltatore_id: null, file_path: "azienda/file.pdf", data_documento: "2026-10-29",
};
vi.mock("@/hooks/useDocumentiSicurezza", () => ({
  useDocumentiSicurezza: () => ({ data: [rapporto] }),
}));
vi.mock("@/hooks/useDpiCommessa", () => ({
  useDpiCommessa: (_company: string, _ordine: string, data: string, faseId?: string) => {
    const addetti: AddettoConConsegne[] = [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nome: "Mario", cognome: "Verdi", attivo: true,
      assegnazioni: [{ fase_id: faseId ?? null }], consegne: [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tipo: "casco", consegnato_il: data,
        scade_il: null, restituito_il: null, stato: "in_use", versione: 2,
      }],
    }];
    return { data: { data, fase_id: faseId, addetti } };
  },
}));
afterEach(cleanup);

it("compila l'emergenza e, dopo avere cambiato esito, richiede un nuovo confronto del rapporto", async () => {
  api.mockResolvedValue({ fonte: { origine: "archivio", id: "id-rapporto", titolo: "Rapporto RUM-11",
    data_archivio: "2026-10-29", sha256: "c".repeat(64) } });
  function Editor() {
    const [d, set] = useState(posVuoto);
    const modifica = (fn: (next: PosContenuto) => void) => set(prev => {
      const copia = structuredClone(prev);
      fn(copia);
      return copia;
    });
    return <>
      <SezioneEmergenze d={d} modifica={modifica} ro={false} mancanti={1} />
      <SezioneRumore d={d} modifica={modifica} ro={false} mancanti={1} companyId="azienda" orderId="ordine" posId="pos" />
    </>;
  }
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Accesso dei soccorsi"), { target: { value: "Ingresso da via Roma" } });
  expect(screen.getByLabelText("Accesso dei soccorsi")).toHaveValue("Ingresso da via Roma");
  fireEvent.click(screen.getByRole("button", { name: "Scegli dall’archivio o dagli allegati" }));
  fireEvent.change(screen.getByLabelText("Originale del rapporto"), { target: { value: "archivio:id-rapporto" } });
  fireEvent.click(screen.getByRole("button", { name: "Collega originale" }));
  await screen.findByText("Originale collegato · Rapporto RUM-11");
  expect(api).toHaveBeenCalledWith({ azione: "fonte_rapporto_rumore", company_id: "azienda", pos_id: "pos", origine: "archivio", documento_id: "id-rapporto" });
  expect(screen.getByLabelText("Data del rapporto")).toHaveValue("2026-10-29");
  const conferma = screen.getByRole("checkbox", { name: "Ho confrontato gli esiti riportati con questa revisione del rapporto" });
  fireEvent.click(conferma);
  expect(conferma).toBeChecked();
  fireEvent.change(screen.getByLabelText("Esito della valutazione"), { target: { value: "LEX 79 dB(A)" } });
  expect(conferma).not.toBeChecked();
});

it("collega una consegna registrata alla scheda e impedisce il doppio inserimento", () => {
  const l = { ...lavorazioneVuota("lavorazione"), fase_id: "fase", dpi: "Casco di protezione" };
  function Editor() {
    const [consegne, set] = useState<RiscontroDpiPos[]>([]);
    return <ConsegneDpiLavorazionePos l={{ ...l, riscontri_dpi: consegne }} ro={false} companyId="azienda" orderId="ordine"
      aggiungi={r => set([r])} togli={() => set([])} />;
  }
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "Scegli dal registro DPI" }));
  fireEvent.change(screen.getByLabelText("DPI previsto dalla scheda"), { target: { value: l.dpi } });
  const opzione = screen.getByRole("option", { name: `Mario Verdi · Casco · ${dataRiscontriDpiPos()}` });
  fireEvent.change(screen.getByLabelText("Consegna registrata all’addetto"), { target: { value: (opzione as HTMLOptionElement).value } });
  fireEvent.click(screen.getByRole("button", { name: "Collega consegna" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Collega consegna" })).toBeDisabled();
});

it("offre l'inserimento in Procedura PSC soltanto dopo il riesame dell'estratto OCR", async () => {
  const fonte: FontePscSchedaPos = { id: "psc", revisione: "2", sha256: "d".repeat(64),
    estratti: [{ pagina: 4, testo: "Mantenere le vie di esodo libere.", metodo: "ocr", confermato: false }] };
  const copia = vi.fn();
  function Editor() {
    const [psc, set] = useState(fonte);
    return <RiferimentiSchedaPos fonti={{ psc }} usaPrescrizione={copia} confermaOcr={(_, confermato) =>
      set({ ...psc, estratti: [{ ...psc.estratti[0], confermato }] })} />;
  }
  render(<Editor />);
  fireEvent.click(screen.getByText("Fonti della scheda"));
  expect(screen.queryByRole("button", { name: "Porta in Procedure PSC" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Ho confrontato il testo con questa pagina dell’originale" }));
  fireEvent.click(await screen.findByRole("button", { name: "Porta in Procedure PSC" }));
  await waitFor(() => expect(copia).toHaveBeenCalledWith({ ...fonte.estratti[0], confermato: true }));
});
