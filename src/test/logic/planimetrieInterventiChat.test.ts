import { expect, it } from "vitest";
import { aPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import {
  anteprimaInterventi, creaAlternativaInterventi, modificaIntervento, piantaDaApplicare, preparaInterventi, propostaChatApplicabile,
} from "@/components/planimetrie/editor/interventiChat";
import { computoStudio, computoStudioRevisionato, importiLavorazioni, percorsoMisuraSullaPianta, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { calcolaVoce } from "@/lib/computo/editorNativo";
import { nuovaPlanimetria, validaPlanimetria, type PrezzoVocePlanimetria } from "../../../shared/planimetrie/modello";

it("ricalcola gli interventi dipendenti dal disegno creato e applica un sottoinsieme coerente", () => {
  const base = piantaVuota();
  const contesto = { documento: nuovaPlanimetria() };
  const richieste = "Cucina 3,20 × 4,10 m\nIngresso 2 × 2,5 m a destra della cucina\nPorta tra ingresso e cucina da 80 cm\nFinestra cucina sul lato alto da 120 cm";
  const { revisione } = preparaInterventi(base, "fatto", richieste, contesto);
  expect(revisione.interventi).toHaveLength(4);
  expect(anteprimaInterventi(revisione).pianta.aperture.map(a => a.larghezza)).toEqual([80, 120]);

  const seleziona = (id: number, selezionata: boolean, attuale = revisione) => modificaIntervento(attuale, "fatto", contesto, id, { selezionata });
  const senzaIngresso = seleziona(2, false);
  expect(senzaIngresso.interventi[2].errore).toMatch(/ingresso/i);
  expect(propostaChatApplicabile(anteprimaInterventi(senzaIngresso))).toBe(false);
  const senzaPorta = seleziona(3, false, senzaIngresso);
  expect(propostaChatApplicabile(anteprimaInterventi(senzaPorta))).toBe(true);
  expect(anteprimaInterventi(senzaPorta).pianta.locali.map(l => l.nome)).toEqual(["Cucina"]);
  expect(anteprimaInterventi(senzaPorta).pianta.aperture.map(a => a.larghezza)).toEqual([120]);
  expect(base.locali).toEqual([]);
});

it("salva la tariffa solo sulla nuova variante e la riporta nel computo con la fonte e la misura", () => {
  const base = comandiDaChatDisegno(piantaVuota(), "fatto", "Cucina 3,20 × 4,10 m").passi[0].pianta;
  const documento = aPlanimetria(base);
  const [piano] = documento.livelli;
  piano.proposte = [{ ...piano.fatto, id: "A", nome: "Partenza" }];
  const contesto = { documento, livelloId: piano.id, propostaId: "A" };
  const { revisione } = preparaInterventi(base, "progetto", "Finestra cucina sul lato alto da 120 cm", contesto);
  const prima = anteprimaInterventi(revisione);
  expect(propostaChatApplicabile(prima)).toBe(true);
  const idFinestra = prima.pianta.aperture[0].id;
  const prezzo: PrezzoVocePlanimetria = { importo: 420.5, unita: "cad", fonte: "Listino di collaudo", tariffa: "F-1" };
  const quotata = { ...revisione, prezzi: { [idFinestra]: prezzo, estranea: prezzo } };
  const pianta = piantaDaApplicare(anteprimaInterventi(quotata), contesto);
  expect(pianta.prezziProgetto).toEqual({ [idFinestra]: prezzo });
  const { documento: salvato, id } = creaAlternativaInterventi(documento, piano.id, "A", pianta, "  Serramento  ");

  expect(validaPlanimetria(salvato).ok).toBe(true);
  expect(salvato.livelli[0].proposte).toContainEqual(expect.objectContaining({ id, nome: "Serramento", alternativaDi: "A" }));
  expect(studioVariante(salvato, "A").righe).toEqual([]);
  const { righe } = studioVariante(salvato, id);
  expect(importiLavorazioni(righe)).toEqual({ importo: 420.5, daQuotare: 0, daMisurare: 0 });
  expect(documento.livelli[0].proposte).toHaveLength(1);

  const fonte = { planimetriaId: "00000000-0000-4000-8000-000000000001", versione: 5, varianteId: id };
  const bozza = computoStudio(fonte, "Serramento", righe);
  expect(bozza.fontePlanimetria).toEqual(fonte);
  expect(bozza.voci[0]).toMatchObject({ prezzo: "420.5", fonte: prezzo.fonte, tariffa: "F-1" });
  expect(calcolaVoce(bozza.voci[0]).importo).toBe(420.5);
  const link = new URL(percorsoMisuraSullaPianta(fonte, righe[0])!, "http://localhost");
  expect(Object.fromEntries(link.searchParams)).toMatchObject({ versione: "5", ambito: "progetto:" + id, apertura: idFinestra });

  const variata = computoStudio({ ...fonte, versione: 6 }, "Serramento", righe.map(r => ({ ...r, prezzo: { ...prezzo, importo: 455 } })));
  const precedente = { ...bozza, voci: [{ ...bozza.voci[0], prezzo: "430", costo: "290" }] };
  expect(computoStudioRevisionato(variata, precedente, bozza).voci[0]).toMatchObject({ prezzo: "455", costo: "290" });
});

it("rende correggibili le richieste inizialmente respinte senza includerle nella pianta", () => {
  const base = comandiDaChatDisegno(piantaVuota(), "fatto", "Cucina 3,20 × 4,10 m").passi[0].pianta;
  const documento = aPlanimetria(base);
  const contesto = { documento, livelloId: documento.livelli[0].id };
  const { revisione } = preparaInterventi(base, "progetto", "Finestra garage sul lato alto da 120 cm\nImpianto elettrico in cucina", contesto);
  expect(revisione.interventi[0]).toMatchObject({ richiesta: { selezionata: false }, errore: expect.stringMatching(/garage/i) });
  expect(propostaChatApplicabile(anteprimaInterventi(revisione))).toBe(true);
  expect(revisione.piantaValida.aperture).toEqual([]);
  const corretta = modificaIntervento(revisione, "progetto", contesto, 1,
    { frase: "Finestra cucina sul lato alto da 120 cm", selezionata: true });
  expect(propostaChatApplicabile(anteprimaInterventi(corretta))).toBe(true);
  expect(corretta.piantaValida.aperture[0].larghezza).toBe(120);
  expect(corretta.piantaValida.elementi?.some(e => e.tipo === "presa")).toBe(true);
});
