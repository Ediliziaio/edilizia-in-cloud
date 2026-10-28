import { describe, it, expect } from "vitest";
import {
  datiItpPerRegistrazione,
  type DatiVerificaItp,
} from "@/lib/sicurezza/itp";
import {
  cercaProfili,
  avvisiProfili,
  criteriDaProfilo,
  erroreCaricamentoProfilo,
  erroreProfilo,
  type ProfiloRequisiti,
  type DatiProfiloRequisiti,
} from "@/lib/sicurezza/profiliRequisiti";
const modello = (): ProfiloRequisiti => ({
  id: "profilo1",
  company_id: "azienda",
  famiglia_id: "famiglia",
  versione: 2,
  precedente_id: "v1",
  nome: "Posa serramenti",
  attivita: "Posa e regolazione",
  ruoli: "Impresa e preposto",
  limiti: "Esclusi ponteggi",
  creato_da: "utente",
  creato_il: "2026-10-27",
  archiviato: false,
  criteri: [
    {
      id: "r1",
      titolo: "Visura camerale",
      catalogo_id: "visura",
      catalogo_versione: 1,
      riferimento: "Riferimento da valutare",
      indicazioni: "Indicazione generale, non motivazione del caso",
    },
  ],
});
const dati = (): DatiProfiloRequisiti => {
  const p = modello();
  return {
    nome: p.nome,
    attivita: p.attivita,
    ruoli: p.ruoli,
    limiti: p.limiti,
    criteri: p.criteri,
    testi_generici: true,
  };
};
describe("Profili di requisiti aziendali", () => {
  it("il payload invia solo i riferimenti del profilo; lo snapshot visualizzato resta separato", () => {
    const criteri = criteriDaProfilo(modello());
    const d = { criteri } as DatiVerificaItp;
    const pronto = datiItpPerRegistrazione(d);
    expect(pronto.criteri[0].profilo_id).toBe("profilo1");
    expect(pronto.criteri[0].profilo_snapshot).toBeUndefined();
    expect(criteri[0].profilo_snapshot).toBeTruthy();
  });
  it("gli aggiornamenti dei profili sono avvisi, non modifiche degli esiti registrati", () => {
    const p = modello();
    const c = criteriDaProfilo(p);
    const messaggi = avvisiProfili(c, [
      { ...p, archiviato: true },
      { ...p, id: "v3", versione: 3 },
    ]);
    expect(messaggi.join(" ")).toMatch(/archiviata.*successiva/);
    expect(c[0].profilo_versione).toBe(2);
    expect(avvisiProfili(c, [])[0]).toContain("non disponibile");
  });

  it("importa una versione mantenendo tutti i criteri da valutare e nessuna evidenza o motivazione ereditata", () => {
    const p = modello();
    const c = criteriDaProfilo(p)[0];
    expect(c).toMatchObject({
      profilo_id: "profilo1",
      profilo_versione: 2,
      requisito_id: "r1",
      applicabilita: "da_chiarire",
      esito: "da_verificare",
      note: "",
      evidenze: [],
    });
    expect(c.profilo_snapshot?.requisito.indicazioni).toBe(
      p.criteri[0].indicazioni,
    );
    expect(c.id).not.toBe(p.criteri[0].id);
    p.criteri[0].indicazioni = "modificata";
    expect(c.profilo_snapshot?.requisito.indicazioni).not.toBe("modificata");
  });
  it("richiede attività, ruoli, limiti e conferma dei testi", () => {
    const d = dati();
    d.limiti = "";
    expect(erroreProfilo(d)).toContain("limiti");
    d.limiti = "Limite";
    d.testi_generici = false;
    expect(erroreProfilo(d)).toContain("Conferma");
  });
  it("non permette voci riservate o non chiarite né criteri duplicati", () => {
    const d = dati();
    d.criteri[0].catalogo_id = "doma";
    expect(erroreProfilo(d)).toContain("non disponibile");
    const altro = dati();
    altro.criteri.push({ ...altro.criteri[0] });
    expect(erroreProfilo(altro)).toContain("Controlla");
  });
  it("impedisce riuso di versioni archiviate, doppia inclusione e superamento del limite", () => {
    const p = modello();
    expect(erroreCaricamentoProfilo({ ...p, archiviato: true }, [])).toContain(
      "archiviata",
    );
    expect(erroreCaricamentoProfilo(p, criteriDaProfilo(p))).toContain(
      "già inclusa",
    );
    expect(erroreCaricamentoProfilo(p, Array(500).fill({}))).toContain("500");
  });
  it("la ricerca richiede tutte le parole fra attività, ruolo e limiti", () => {
    const p = modello();
    expect(cercaProfili([p], "POSA PREPOSTO")).toEqual([p]);
    expect(cercaProfili([p], "posa gru")).toEqual([]);
  });
});
