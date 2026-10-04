import { describe, expect, it } from "vitest";
import { tipologiaDaNome } from "@/lib/serramenti/tipologiaDaNome";
import { configurazionePersiana } from "@/lib/serramenti/assiDisegno";
import { TIPOLOGIE_DISEGNO } from "@/lib/serramenti/disegnoSerramento";

// I nomi veri dei listini serramenti (Infissi e Living, Renova, Ser Style, Best Infissi, Demo 2).
const SERRAMENTI = [
  "Alzante Scorrevole a Scomparsa", "Alzante Scorrevole AS + FA", "Alzante Scorrevole FA + AS + AS + FA", "Finestra 1 Anta", "Finestra 2 Ante", "Finestra 3 Ante",
  "Finestra Wasistas", "Fisso nel Telaio", "Fisso nell'Anta", "Porta Finestra 1 Anta", "Porta Finestra 1 Anta con Serratura Passante", "Porta Finestra 2 Ante",
  "Porta Finestra 2 Ante con Serratura Passante", "Porta Finestra 3 Ante", "Porta Finestra Traslante Scorrevole 4 Ante", "Porta Finestra Traslante Scorrevole con Fisso nel Telaio",
  "Porta Finestra Traslante Scorrevole con Fisso nell'Anta", "Porta Finestra Traslante Scorrevole su Parete", "Portoncino 1 Anta", "Portoncino 2 Ante", "Slide", "Slide Plus", "Smart Slide",
  "COSTRUZIONE 17 IT-C1 — Porta d'ingresso a 2 ante (anta da 116 mm) — conf. 1", "Finestra 1 Anta con Sopraluce", "Finestra 1 Anta con Sottoluce", "Finestra 2 Ante con Sopraluce",
  "Finestra 2 Ante con Sopraluce a Due Sezioni", "Finestra 2 Ante con Sottoluce", "Finestra 3 Ante con Sopraluce", "Finestra ad Arco", "Finestra Trapezoidale", "Finestra Tonda",
  "Finestra Triangolare", "Finestra Scorrevole 2 Ante", "Porta Finestra 2 Ante con Sopraluce", "Porta Finestra a Libro 3 Ante", "Porta Finestra a Libro 4 Ante", "Scorri-Ribalta PATIO",
  "Finestra a Wasistas", "Finestra PVC 2 ante — bianco (al mq)", "Portafinestra PVC 2 ante — bianco (al mq)", "COSTRUZIONE 3 IT — PORTA BALCONE 1 ANTA",
];
const PERSIANE = [
  "Persiana a Libro 2 Ante", "Persiana a Libro 3 Ante", "Persiana a Libro 4 Ante", "Persiana a Pacchetto 3 Ante DX", "Persiana a Pacchetto 3 Ante SX", "Persiana a Pacchetto 4 Ante DX",
  "Persiana a Pacchetto 4 Ante SX", "Persiana ad Angolo 2 Ante", "Persiana ad Angolo 3 Ante", "Persiana con Pannello Fisso Laterale", "Persiana con Pannello Fisso Superiore", "Persiana con Sopraluce",
  "Persiana Finestra 1 Anta DX", "Persiana Finestra 1 Anta SX", "Persiana Finestra 2 Ante", "Persiana Finestra 2 Ante Asimmetriche (principale DX)", "Persiana Finestra 2 Ante Asimmetriche (principale SX)",
  "Persiana Finestra 3 Ante", "Persiana Finestra 3 Ante (1+2 DX)", "Persiana Finestra 3 Ante (2+1 SX)", "Persiana Finestra 4 Ante", "Persiana Finestra 4 Ante (2+2)",
  "Persiana Porta Finestra 1 Anta DX", "Persiana Porta Finestra 1 Anta SX", "Persiana Porta Finestra 2 Ante", "Persiana Porta Finestra 2 Ante Asimmetriche (principale DX)",
  "Persiana Porta Finestra 2 Ante Asimmetriche (principale SX)", "Persiana Porta Finestra 3 Ante", "Persiana Porta Finestra 3 Ante (1+2 DX)", "Persiana Porta Finestra 3 Ante (2+1 SX)",
  "Persiana Porta Finestra 4 Ante", "Persiana Porta Finestra 4 Ante (2+2)", "Persiana Scorrevole 1 Anta DX", "Persiana Scorrevole 1 Anta SX", "Persiana Scorrevole 2 Ante",
  "Persiana Scorrevole 2 Ante Sovrapposte", "Persiana Finestra 1 Anta", "Persiana 1 Anta", "Persiana 2 Ante", "Scuro 2 Ante",
];
const A_FOTO = [
  "Cassonetto Effetto Legno", "Cassonetto Termoisolato PVC", "Tapparella Alluminio Coibentata", "Tapparella PVC", "Zanzariera a Molla Classica", "Zanzariera Laterale Avvolgibile", "Zanzariera Plissé",
  "COPRIFILI", "RILIEVI E TRASPORTI", "SMALTIMENTO", "Porta blindata 2 ante 120×210", "Porta blindata classe 3 · 1 anta 90×210", "Porta a soffietto 80×210", "Porta battente laccata bianca 80×210",
  "Porta scorrevole a scomparsa 80×210", "Porta scorrevole esterno muro 80×210",
];

describe("tipologiaDaNome sui nomi veri dei listini", () => {
  it("ogni articolo serramento è riconosciuto e il tipo esiste", () => {
    for (const nome of SERRAMENTI) {
      const t = tipologiaDaNome(nome);
      expect(t, nome).not.toBeNull();
      expect(TIPOLOGIE_DISEGNO.some((x) => x.id === t), `${nome} → ${t}`).toBe(true);
    }
  });
  it("ogni persiana è riconosciuta e la configurazione esiste", () => {
    for (const nome of PERSIANE) {
      const t = tipologiaDaNome(nome);
      expect(t, nome).not.toBeNull();
      const [, codice] = t!.split(":");
      expect(configurazionePersiana(codice), `${nome} → ${t}`).toBeDefined();
    }
  });
  it("cassonetti, tapparelle, zanzariere, accessori e porte interne/blindate restano a foto", () => {
    for (const nome of A_FOTO) expect(tipologiaDaNome(nome), nome).toBeNull();
  });
  it("alcune corrispondenze esatte", () => {
    expect(tipologiaDaNome("Persiana a Pacchetto 3 Ante SX")).toBe("persiana:pacchetto_3_ante_sx");
    expect(tipologiaDaNome("Persiana Porta Finestra 3 Ante (2+1 SX)")).toBe("persiana:3_ante_2_1_sx");
    expect(tipologiaDaNome("Persiana Finestra 2 Ante Asimmetriche (principale SX)")).toBe("persiana:2_ante_asimm_principale_sx");
    expect(tipologiaDaNome("Scuro 2 Ante")).toBe("persiana:2_ante:scuro");
    expect(tipologiaDaNome("Porta Finestra 2 Ante con Serratura Passante")).toBe("porta_finestra_2_ante");
    expect(tipologiaDaNome("Finestra 2 Ante con Sopraluce a Due Sezioni")).toBe("finestra_2_ante_sopraluce_2_sezioni");
    expect(tipologiaDaNome("Slide")).toBe("slide");
    expect(tipologiaDaNome("Slide Plus")).toBe("slide_plus");
    expect(tipologiaDaNome("Qualcosa di strano")).toBeNull();
    expect(tipologiaDaNome("")).toBeNull();
  });
});
