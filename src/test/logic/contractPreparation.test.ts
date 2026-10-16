import { describe, expect, it } from "vitest";
import { parseContractExtract, contractImponibile, contractToInstallments, contractCoherenceWarnings } from "@/lib/orders/contractExtract";
import { prepareContract as prepareConfiguredContract, contractConfirmations, contractPreparationNotes, storedContractFromDraft } from "@/lib/orders/contractPreparation";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const prepareContract = (ex: Parameters<typeof prepareConfiguredContract>[0], models: readonly ModelloFasi[]) => prepareConfiguredContract(ex, models, "manutenzione_stradale_su_ordine");

const model = (id: string, nome: string): ModelloFasi => ({ id, nome, origine: "azienda", descrizione: "", fasi: [{ nome: "Fresatura", sottofasi: [{ nome: "Controllo quote", peso: 1 }] }] });
const modelli = [model("generale", "Lavori stradali e manutenzione viabilità"), model("anas", "Impresa - Manutenzione ricorrente ANAS"), model("asfalto", "Impresa - Fresatura e bitumatura")];
const recurring = () => parseContractExtract({ descrizione_lavori: "Manutenzione ricorrente del corpo stradale ANAS", appalto_pubblico: { presente: true, ruolo_azienda_importatrice: "mandante", importo_totale_appalto_eur: 123456, cig: "123", quota_azienda_eur: null, informazioni_da_confermare: ["quota_azienda_eur"] }, iva_pct: null, fasi_pagamento: [] });

describe("preparazione da contratto e separazione ufficio/cantiere", () => {
  it("non applica le regole Pistilli ad aziende senza opt-in, anche con lo stesso contratto e standard", () => {
    for (const profile of [undefined, "standard"] as const) {
      const p = prepareConfiguredContract(recurring(), modelli, profile);
      expect(p.organizzazione).toBe("da_confermare");
      expect(p.standardId).toBeNull(); expect(p.ufficio).toEqual([]); expect(p.cantiere).toEqual([]);
    }
  });
  it("sceglie lo standard ricorrente senza trasformare gli adempimenti in lavori eseguiti", () => {
    const p = prepareContract(recurring(), modelli);
    expect(p.standardId).toBe("anas"); expect(p.organizzazione).toBe("interventi_su_ordine");
    expect(p.ufficio).toHaveLength(6); expect(p.cantiere).toEqual([]);
    expect(contractPreparationNotes(p)).toContain("123456".replace(/(\d{3})$/, ".$1"));
    expect(contractPreparationNotes(p)).toContain("non attribuito automaticamente");
  });
  it("un singolo intervento di bitumatura usa solo lo standard pertinente", () => {
    const p = prepareContract(parseContractExtract({ descrizione_lavori: "Fresatura e bitumatura strada comunale" }), modelli);
    expect(p.standardId).toBe("asfalto"); expect(p.cantiere).toHaveLength(1); expect(p.ufficio).toEqual([]);
  });
  it("non sceglie uno standard ambiguo né usa uno standard stradale per un'offerta fornitore", () => {
    expect(prepareContract(recurring(), [...modelli, model("copia", modelli[1].nome)]).standardId).toBeNull();
    const ex = parseContractExtract({ descrizione_lavori: "Fresatura e bitumatura", natura_documento: "offerta_fornitore" });
    expect(prepareContract(ex,modelli).standardId).toBeNull();
  });
  it("un richiamo a un accordo quadro non basta per trasformare un intervento singolo in manutenzione ricorrente", () => {
    expect(prepareContract(parseContractExtract({descrizione_lavori:"Singolo intervento di fresatura previsto dall’accordo quadro"}),modelli).organizzazione).toBe("lavoro_singolo");
  });
  it("recupera il riferimento privato solo per la stessa azienda e rifiuta bozze corrotte", () => {
    const source={bucket:"order-attachments",path:"azienda-a/ai-contratti/file.pdf",name:"file.pdf",mime:"application/pdf"};
    expect(storedContractFromDraft(source,"azienda-a")).toEqual(source);
    expect(storedContractFromDraft(source,"azienda-b")).toBeNull();
    expect(storedContractFromDraft({...source,path:"azienda-a/../azienda-b/file.pdf"},"azienda-a")).toBeNull();
    expect(storedContractFromDraft({...source,path:{}},"azienda-a")).toBeNull();
  });
  it("la mandante non eredita ricavi e rate dell'RTI, anche da un estratto vecchio non protetto", () => {
    const ex = recurring(); ex.importo_totale_eur = 123456; ex.fasi_pagamento = [{ descrizione:"Saldo", percentuale:100, importo_eur:123456 }];
    expect(contractImponibile(ex)).toBeNull(); expect(contractToInstallments(ex,123456)).toEqual([]);
  });
  it("non genera pagamenti da soli nomi o percentuali senza importo totale", () => {
    const ex = parseContractExtract({ fasi_pagamento: [{ descrizione:"SAL" }, { descrizione:"Saldo", percentuale:50 }] });
    expect(contractToInstallments(ex,0)).toEqual([]);
  });
  it("mantiene IVA nulla o zero e non inventa scadenze per rate dichiarate", () => {
    const ex = parseContractExtract({ iva_pct:0, fasi_pagamento:[{ descrizione:"Acconto", importo_eur:100 }] });
    expect(ex.iva_pct).toBe(0); expect(contractToInstallments(ex,100)[0]).not.toHaveProperty("expected_date");
    expect(contractConfirmations(prepareContract(ex,[])).some(x=>x.key === "iva")).toBe(false);
    expect(recurring().iva_pct).toBeNull();
  });
  it("le conferme esplicite si riflettono nel riepilogo senza cancellare i controlli sugli interventi", () => {
    const p=prepareContract(recurring(),modelli);
    expect(contractConfirmations(p).map(x=>x.key)).toContain("iva");
    const conferme=contractConfirmations(p,{cliente:true,importo:true,iva:true,rate:true});
    expect(conferme.map(x=>x.key)).not.toContain("iva"); expect(conferme.map(x=>x.key)).toContain("interventi");
    expect(conferme.map(x=>x.testo).join(" ")).not.toContain("quota_azienda_eur");
    expect(contractCoherenceWarnings(recurring()).join(" ")).not.toContain("estrazione incompleta");
  });
});
