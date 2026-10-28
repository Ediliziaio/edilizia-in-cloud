import { describe, expect, it, vi } from "vitest";
import { BUILTIN_FIELDS } from "@/components/settings/CustomFieldsConfig";
import { CUSTOM_FIELD_OBJECTS, GROUP_OPTIONS, OBJECT_NAME_MAP, customFieldKey, fieldObjectType } from "@/lib/custom-fields/objects";
import { catalogueFields, catalogueScopes, readDefinitionPages } from "@/lib/custom-fields/federatedCatalogue";
import { multipleFieldValues, serializeFieldValue, validateFieldValue } from "@/lib/custom-fields/values";

describe("registro canonico dei campi", () => {
  it("tutte le 905 voci sono trovabili esattamente sotto un gruppo, senza filtrare per traduzioni", () => {
    const groups = new Set(GROUP_OPTIONS.map(g => g.value));
    expect(BUILTIN_FIELDS).toHaveLength(905);
    expect(new Set(BUILTIN_FIELDS.map(f => f.uniqueKey)).size).toBe(905);
    for (const field of BUILTIN_FIELDS) {
      expect(groups.has(fieldObjectType(field)), field.uniqueKey).toBe(true);
      expect(field.object).toBe(OBJECT_NAME_MAP[fieldObjectType(field)]);
    }
  });
  it.each(CUSTOM_FIELD_OBJECTS)("%s ha etichetta e identità coerenti (%s)", (type, label) => {
    expect(GROUP_OPTIONS.find(g => g.value === type)?.label).toBe(label);
    for (const field of BUILTIN_FIELDS.filter(f => fieldObjectType(f) === type)) expect(field.objectType).toBe(type);
  });
  it.each([["intervento", 45], ["rapportino", 18], ["impianto", 12], ["ordine_acquisto", 25], ["ddt_ricezione", 20], ["company", 37], ["product", 24], ["family", 23], ["tariffa", 17]] as const)("il filtro %s recupera tutte le %i voci anche con etichette storiche diverse", (type, count) => {
    expect(BUILTIN_FIELDS.filter(f => fieldObjectType(f) === type)).toHaveLength(count);
  });
  it("le variabili contatto per ID non cambiano quando cambia l'etichetta", () => {
    const f = { id: "11111111-1111-4111-8111-111111111111", object_type: "contact", name: "Fonte" };
    expect(customFieldKey(f)).toBe("{{ contact.custom_11111111111141118111111111111111 }}");
    expect(customFieldKey({ ...f, name: "Fonte nuova" })).toBe(customFieldKey(f));
    expect(customFieldKey({ ...f, object_type: "invoice" })).toBe("{{ invoice.fonte }}");
  });
});

describe("catalogo federato: origine e ambito, non nuove definizioni", () => {
  it("candidature: censisce le configurazioni native, non le risposte o il CV", () => {
    const rows = catalogueFields("recruitment", [{ id: "hr", titolo: "Lavora con noi", campi: { nome: "nascosto", citta: "obbligatorio", email: "nascosto", non_nativo: "SEGRETO" }, cv_url: "PRIVATO" }]);
    expect(rows).toHaveLength(8);
    expect(rows.find(f => f.key === "nome")?.required).toBe(true);
    expect(rows.find(f => f.key === "citta")?.required).toBe(true);
    expect(rows.find(f => f.key === "email")?.visibility).toBe("nascosto");
    expect(JSON.stringify(rows)).not.toMatch(/SEGRETO|PRIVATO/);
  });
  it("mantiene i modelli vuoti come ambiti senza trasformarli in campi", () => {
    expect(catalogueScopes("surveys", [{ id: "x", name: "Vuoto" }], [])).toEqual([{ id: "x", name: "Vuoto", count: 0 }]);
  });
  it("le chiavi uguali di due schede tecniche non si fondono", () => {
    const f = { field_key: "potenza_wp", field_label: "Potenza", field_type: "number", field_unit: "Wp", required: true, show_in_pdf: true };
    const rows = catalogueFields("catalogue", [{ ...f, id: "a", macrocategoria_id: "m1", listino_macrocategorie: { nome: "Pannello A" } }, { ...f, id: "b", macrocategoria_id: "m2", listino_macrocategorie: { nome: "Pannello B" } }]);
    expect(rows).toHaveLength(2); expect(new Set(rows.map(r => r.id)).size).toBe(2);
    expect(rows[0]).toMatchObject({ key: "potenza_wp", scopeId: "m1", unit: "Wp", pdf: true, required: true });
  });
  it("documenti: preserva segnaposto e ambito template, senza importare valori o PDF", () => {
    const [f] = catalogueFields("documents", [{ id: "f", template_id: "t", nome: "data", etichetta: "Data accordo", tipo: "data", segnaposto: "{{data}}", obbligatorio: true, documento_templates: [{ nome: "Contratto" }], valore_default: "SEGRETO", file_url: "privato" }]);
    expect(f).toMatchObject({ scope: "Contratto", key: "{{data}}", required: true });
    expect(JSON.stringify(f)).not.toMatch(/SEGRETO|privato/);
  });
  it("contratti: estrae le variabili senza produrre contenuti contrattuali o cambiarne la versione", () => {
    const out = catalogueFields("contracts", [{ id: "t", name: "Accordo", contractual_terms_text: "{{ contratto.data_inizio }} {{ contratto.durata_giorni }}", legal_terms_text: "{{ contratto.data_inizio }}" }]);
    expect(out.map(f => [f.key, f.type])).toEqual([["{{ contratto.data_inizio }}", "data"], ["{{ contratto.durata_giorni }}", "numero"]]);
  });
  it("sopralluoghi: stessa chiave in testata, area, elementi e sottocampi ha identità diversa", () => {
    const f = { key: "materiale", label: "Materiale", type: "text" };
    const schema = { header_schema: [{ fields: [f] }], area_definition: { fields: [f] }, element_types: [{ sections: [{ fields: [{ ...f, type: "compound_boolean", nested_fields: [f] }] }] }] };
    const out = catalogueFields("surveys", [{ id: "t", name: "Rilievo", schema }]);
    expect(out).toHaveLength(4); expect(new Set(out.map(f => f.id)).size).toBe(4);
    expect(out.every(f => f.path?.includes("fields"))).toBe(true);
  });
  it("non legge finti campi nascosti dentro default, opzioni, risposte o mapping", () => {
    const fake = { key: "segreto", type: "text", label: "Dato" };
    expect(catalogueFields("surveys", [{ id: "t", schema: { default_value: fake, options: [fake], answers: fake } }])).toEqual([]);
  });
  it("form: esclude pulsanti e intestazioni, distingue mapping dichiarato da risposta", () => {
    const fields = [{ id: "title", type: "heading" }, { id: "send", type: "submit" }, { id: "email", type: "email", label: "Email", mapping: "email", value: "privato" }, { id: "extra", type: "text" }];
    const out = catalogueFields("forms", [{ id: "f", name: "Contatti", fields }]);
    expect(out).toHaveLength(2); expect(out[0].mapping).toBe("email"); expect(out[1].mapping).toBe("");
    expect(JSON.stringify(out)).not.toContain("privato");
  });
  it("paginazione inclusiva da 200: oltre 1.000 definizioni senza perdere righe", async () => {
    const rows = Array.from({ length: 1101 }, (_, i) => ({ id: String(i) }));
    const read = vi.fn(async (from: number, to: number) => rows.slice(from, to + 1));
    expect(await readDefinitionPages(read)).toHaveLength(1101);
    expect(read).toHaveBeenNthCalledWith(1, 0, 199); expect(read).toHaveBeenNthCalledWith(6, 1000, 1199);
  });
  it("un errore alla seconda pagina non restituisce un catalogo incompleto", async () => {
    const read = vi.fn().mockResolvedValueOnce(Array.from({ length: 200 }, () => ({ id: "x" }))).mockRejectedValueOnce(new Error("rete"));
    await expect(readDefinitionPages(read)).rejects.toThrow("rete");
  });
  it("rispetta l'annullamento anche se una pagina arriva dopo il cambio azienda", async () => {
    const c = new AbortController();
    const read = vi.fn(async () => { c.abort(); return [{ id: "vecchia azienda" }]; });
    await expect(readDefinitionPages(read, c.signal)).rejects.toThrow(); expect(read).toHaveBeenCalledTimes(1);
  });
  it("il tetto non viene nascosto dietro un successo parziale", async () => {
    await expect(readDefinitionPages(async () => Array.from({ length: 200 }, () => ({ id: "x" })))).rejects.toThrow("10.000");
  });
});

describe("valori tipizzati compatibili con storage testuale", () => {
  it.each([[["A", "B"], ["A", "B"]], ['["A","B"]', ["A", "B"]], ["A", ["A"]], ["", []], [null, []]])("multiselezione %j", (value, expected) => expect(multipleFieldValues(value)).toEqual(expected));
  it("zero, false e array non diventano valori vuoti o liste separate da virgole", () => {
    expect(serializeFieldValue(0)).toBe("0"); expect(serializeFieldValue(false)).toBe("false");
    expect(serializeFieldValue(["A,B", "C"])).toBe('["A,B","C"]');
  });
  it.each([["percent", 101], ["number", "NaN"], ["date", "2026-02-30"], ["email", "no"], ["url", "javascript:alert(1)"]])("rifiuta %s = %s", (type, value) => expect(validateFieldValue(type, value)).toBeTruthy());
});
