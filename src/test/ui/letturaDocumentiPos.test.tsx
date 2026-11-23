/**
 * «Leggi PSC e contratto» nell'editor del POS: si scelgono i documenti, la lettura gira in background, e dai
 * risultati entra nella bozza solo ciò che l'utente sceglie, dopo aver deciso i conflitti e confermato il confronto
 * con gli originali. Le emergenze entrano solo dal PSC ancora collegato al POS.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LetturaDocumentiPos } from "@/components/sicurezza/pos/LetturaDocumentiPos";
import type { LetturaDocumentiVista } from "@/hooks/useLetturaDocumentiPos";

const { api, apri, allegati } = vi.hoisted(() => ({
  api: vi.fn(), apri: vi.fn().mockResolvedValue(undefined),
  allegati: [
    { id: "a-1", file_name: "Foto sopralluogo.pdf", file_url: "ord/foto.pdf", file_type: "application/pdf", created_at: "2026-11-20" },
    { id: "a-2", file_name: "Contratto d'appalto.pdf", file_url: "ord/ai-contratti/c.pdf", file_type: "application/pdf", created_at: "2026-11-10" },
    { id: "a-3", file_name: "Pianta.dwg", file_url: "ord/pianta.dwg", file_type: "application/acad", created_at: "2026-11-09" },
  ],
}));
vi.mock("@/hooks/usePos", () => ({ chiamaServerPos: api }));
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: apri }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: allegati, error: null as unknown }) }) }) }) }) },
}));

const psc = {
  archivio: "sicurezza_documenti" as const, id: "psc-1", company_id: "az", order_id: "ord", file_name: "PSC.pdf",
  file_path: "az/PSC.pdf", titolo: "PSC Via Verdi", data_documento: "", revisione: "1", sha256: "a".repeat(64),
};
const base: LetturaDocumentiVista = {
  id: "l-1", stato: "pronta", errore: null, avvisi: [], ferma: false, aggiornata_il: "2026-11-23T10:00:00Z",
  fonti: { psc: { id: "psc-1", titolo: "PSC Via Verdi", revisione: "1", sha256: "a".repeat(64) },
    contratto: { id: "a-2", file_name: "Contratto d'appalto.pdf", file_path: "ord/ai-contratti/c.pdf" } },
  avanzamento: { fatti: 1, blocchi: 1 },
  decisioni: {},
  risultato: {
    versione: 2,
    indicazioni: [
      { campo: "accessi", documento: "contratto", pagina: 2, citazione: "L'appaltatore accede dall'ingresso principale di Via Verdi 12", metodo: "testo" },
      { campo: "accessi", documento: "psc", pagina: 7, citazione: "L'accesso dei mezzi avviene dal passo carraio di Via Rossi 3", metodo: "testo" },
      { campo: "fronti", documento: "psc", pagina: 12, citazione: "il locale interessato deve essere sgomberato dagli occupanti", metodo: "testo" },
      { campo: "raccolta", documento: "psc", pagina: 15, citazione: "Il punto di raccolta è nella corte interna lato Via Rossi", metodo: "ocr" },
      { campo: "allarme", documento: "contratto", pagina: 3, citazione: "In caso di emergenza l'appaltatore chiama il 112", metodo: "testo" },
    ],
    conflitti: [{ campo: "accessi", descrizione: "Due ingressi diversi per i mezzi.",
      psc: { pagina: 7, citazione: "L'accesso dei mezzi avviene dal passo carraio di Via Rossi 3" },
      contratto: { pagina: 2, citazione: "L'appaltatore accede dall'ingresso principale di Via Verdi 12" } }],
    mancanti: ["servizi", "esodo"],
  },
};

function monta(lettura: LetturaDocumentiVista | null, opzioni: { psc?: typeof psc; salva?: () => Promise<boolean> } = { psc }) {
  let corrente = lettura;
  api.mockImplementation(async (corpo: Record<string, unknown>) => {
    if (corpo.azione === "avvia_lettura_documenti") corrente = { ...base, stato: "in_corso", risultato: null, avanzamento: { fatti: 0, blocchi: 2 } };
    if (corpo.azione === "decidi_lettura_documenti") return { decisioni: corpo.decisioni };
    return { lettura: corrente };
  });
  const onInserisci = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <LetturaDocumentiPos companyId="az" posId="pos" orderId="ord" psc={opzioni.psc} salva={opzioni.salva} onInserisci={onInserisci} />
  </QueryClientProvider>);
  return { onInserisci };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("propone il contratto fra i PDF della commessa, salva la bozza e avvia la lettura in background", async () => {
  const salva = vi.fn().mockResolvedValue(true);
  monta(null, { psc, salva });
  fireEvent.click(await screen.findByRole("button", { name: "Leggi PSC e contratto" }));
  const dialog = await screen.findByRole("dialog");
  const scelta = within(dialog).getByLabelText("Contratto") as HTMLSelectElement;
  await waitFor(() => expect(scelta.value).toBe("a-2"));
  expect(within(scelta).queryByText(/Pianta/)).toBeNull();
  expect(within(dialog).getByRole("checkbox", { name: "Leggi il PSC" })).toBeChecked();
  fireEvent.click(within(dialog).getByRole("button", { name: "Avvia la lettura" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.objectContaining({
    azione: "avvia_lettura_documenti", pos_id: "pos", contratto_id: "a-2", usa_psc: true,
  })));
  expect(salva).toHaveBeenCalledOnce();
  expect(await within(dialog).findByText(/0 di 2 blocchi di pagine/)).toBeInTheDocument();
});

it("senza scelta sul conflitto l’accesso non entra; dopo la scelta e la conferma entrano citazione e fonte", async () => {
  const { onInserisci } = monta(base);
  fireEvent.click(await screen.findByRole("button", { name: "Risultati della lettura" }));
  const dialog = await screen.findByRole("dialog");
  const decisioni = within(dialog).getByRole("region", { name: "Decisioni da prendere" });
  expect(within(decisioni).getByText(/Accessi e percorsi: PSC e contratto non coincidono/)).toBeInTheDocument();
  const accessoPsc = within(dialog).getByRole("checkbox", { name: "Usa l’indicazione del PSC a pagina 7 per Accessi e percorsi" });
  expect(accessoPsc).toBeDisabled();
  expect(within(dialog).getByRole("checkbox", { name: "Usa l’indicazione del Contratto a pagina 3 per Allarme, chiamata e procedura" })).toBeDisabled();
  const daChiarire = within(dialog).getByRole("region", { name: "Da chiarire" });
  expect(within(daChiarire).getAllByRole("listitem").map(li => li.textContent)).toEqual([
    "Quali servizi e spazi comuni usa l’impresa, e con quali regole?", "Quali sono le vie di esodo e le uscite di emergenza?",
  ]);

  fireEvent.click(within(decisioni).getByRole("radio", { name: /Vale il PSC/ }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.objectContaining({
    azione: "decidi_lettura_documenti", lettura_id: "l-1", decisioni: { accessi: "psc" },
  })));
  expect(accessoPsc).toBeEnabled();
  expect(accessoPsc).toBeChecked();
  expect(within(dialog).getByRole("checkbox", { name: "Usa l’indicazione del Contratto a pagina 2 per Accessi e percorsi" })).not.toBeChecked();

  const inserisci = within(dialog).getByRole("button", { name: /Inserisci 3 nella bozza/ });
  expect(inserisci).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Ho confrontato le citazioni/ }));
  fireEvent.click(inserisci);
  expect(onInserisci).toHaveBeenCalledWith(
    [
      "Accessi e percorsi: L'accesso dei mezzi avviene dal passo carraio di Via Rossi 3 (PSC rev. 1, p. 7)",
      "Coordinamento dei fronti: il locale interessato deve essere sgomberato dagli occupanti (PSC rev. 1, p. 12)",
    ],
    [{ campo: "raccolta", id: "psc-1", revisione: "1", sha256: "a".repeat(64), pagina: 15,
      estratto: "Il punto di raccolta è nella corte interna lato Via Rossi", metodo: "ocr" }],
  );
});

it("apre la pagina originale del documento citato", async () => {
  monta(base);
  fireEvent.click(await screen.findByRole("button", { name: "Risultati della lettura" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Apri la pagina 2 del Contratto" }));
  expect(apri).toHaveBeenCalledWith("order-attachments", "ord/ai-contratti/c.pdf", 2);
  fireEvent.click(within(dialog).getByRole("button", { name: "Apri la pagina 7 del PSC" }));
  expect(apri).toHaveBeenCalledWith("sicurezza-documenti", "az/PSC.pdf", 7);
});

it("se il PSC del POS è cambiato, le emergenze lette dal vecchio non si possono inserire", async () => {
  monta(base, { psc: { ...psc, revisione: "2", sha256: "b".repeat(64) } });
  fireEvent.click(await screen.findByRole("button", { name: "Risultati della lettura" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Il PSC del POS non è più quello letto/)).toBeInTheDocument();
  expect(within(dialog).getByRole("checkbox", { name: "Usa l’indicazione del PSC a pagina 15 per Punti di raccolta" })).toBeDisabled();
  expect(within(dialog).getByRole("checkbox", { name: "Usa l’indicazione del PSC a pagina 12 per Coordinamento dei fronti" })).toBeEnabled();
});

it("una lettura fermata si riprende con gli stessi documenti", async () => {
  monta({ ...base, stato: "errore", risultato: null, errore: "Credito AI esaurito." });
  fireEvent.click(await screen.findByRole("button", { name: "Leggi PSC e contratto" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Credito AI esaurito.");
  expect(within(dialog).getByText(/avvia prima «Leggi tutto il PSC»/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Riprendi da dove si è fermata" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.objectContaining({
    azione: "avvia_lettura_documenti", contratto_id: "a-2", usa_psc: true,
  })));
});

it("con due estratti per la stessa voce di emergenza chiede la fase di ciascuno, come «Cerca indicazioni nel PSC»", async () => {
  const dueSoccorsi: LetturaDocumentiVista = { ...base, risultato: { ...base.risultato!, conflitti: [], indicazioni: [
    { campo: "primo_soccorso", documento: "psc", pagina: 38, citazione: "almeno un pacchetto di medicazione per ogni 10 addetti", metodo: "testo" },
    { campo: "primo_soccorso", documento: "psc", pagina: 66, citazione: "garantire la presenza di pacchetti di medicazione per tutta la durata", metodo: "testo" },
  ] } };
  const { onInserisci } = monta(dueSoccorsi);
  fireEvent.click(await screen.findByRole("button", { name: "Risultati della lettura" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Ho confrontato le citazioni/ }));
  const inserisci = within(dialog).getByRole("button", { name: /Inserisci 2 nella bozza/ });
  expect(inserisci).toBeDisabled();
  expect(within(dialog).getByText(/indica la fase o l’ambito di ciascuno/)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("Fase o ambito · pagina 38"), { target: { value: "Allestimento" } });
  fireEvent.change(within(dialog).getByLabelText("Fase o ambito · pagina 66"), { target: { value: "Lavori in quota" } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /Ho confrontato le citazioni/ }));
  fireEvent.click(inserisci);
  expect(onInserisci).toHaveBeenCalledWith([], [
    expect.objectContaining({ campo: "primo_soccorso", pagina: 38, fase: "Allestimento" }),
    expect.objectContaining({ campo: "primo_soccorso", pagina: 66, fase: "Lavori in quota" }),
  ]);
});

it("una lettura di una versione precedente del lettore si rifà invece di aprire risultati vuoti", async () => {
  monta({ ...base, risultato: null });
  fireEvent.click(await screen.findByRole("button", { name: "Leggi PSC e contratto" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Avvia la lettura" })).toBeInTheDocument();
});
