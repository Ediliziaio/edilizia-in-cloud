/**
 * Installare un modello di listino senza fare danni in silenzio (06/10/2026).
 *
 * Il caso: Renova Solution, 05/10. «Infissi con disegno automatico» installato con due chiamate nella stessa
 * transazione e ogni variante arrivata a maggiorazione «none» — il modello è la fotografia di Demo Azienda 2 e non
 * porta le regole di prezzo dell'azienda che lo installa. Qui si fissa quello che deve restare vero:
 *  - una richiesta identica appena fatta, o in corso, non si rifà (e dice perché);
 *  - se l'azienda ha già maggiorazioni sulle stesse varianti, si sceglie PRIMA: copiarle o no;
 *  - l'anteprima non scrive e usa lo stesso codice dell'installazione;
 *  - le finestre che installano avvisano, e non si fanno scavalcare dal doppio click.
 *
 * Il comportamento vero del database (lock, rifiuto, copia, anteprima = risultato) è stato provato sul database
 * di produzione dentro una transazione annullata; qui restano i contratti che non devono rompersi in silenzio.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  elencoItaliano,
  haMaggiorazioniDaCopiare,
  messaggioErroreInstallazione,
  testoEsito,
  testoMaggiorazioni,
  tipoErroreInstallazione,
  type AnteprimaInstallazione,
  type EsitoInstallazione,
} from "@/lib/listino/modelliArea";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIGRAZIONE = "supabase/migrations/20281006170000_modelli_listino_installazione_protetta.sql";

const anteprima = (extra: Partial<AnteprimaInstallazione> = {}): AnteprimaInstallazione => ({
  modello: "Infissi con disegno automatico",
  prodotti_nuovi: 40,
  prodotti_gia_presenti: 62,
  maggiorazioni_copiabili: 0,
  assi: [],
  installazione_recente: null,
  ...extra,
});

describe("l'avviso prima di installare: maggiorazioni che l'azienda ha già", () => {
  it("scrive l'elenco degli assi in italiano", () => {
    expect(elencoItaliano([])).toBe("");
    expect(elencoItaliano(["Colore"])).toBe("Colore");
    expect(elencoItaliano(["Colore", "Telaio"])).toBe("Colore e Telaio");
    expect(elencoItaliano(["Colore", "Telaio", "Tipologia Vetro"])).toBe("Colore, Telaio e Tipologia Vetro");
  });

  it("si avvisa solo se c'è davvero qualcosa da copiare", () => {
    expect(haMaggiorazioniDaCopiare(undefined)).toBe(false);
    expect(haMaggiorazioniDaCopiare(null)).toBe(false);
    expect(haMaggiorazioniDaCopiare(anteprima())).toBe(false);
    expect(haMaggiorazioniDaCopiare(anteprima({ maggiorazioni_copiabili: 160 }))).toBe(true);
  });

  it("dice su quali assi e quante varianti, senza parole da tecnici", () => {
    const r = testoMaggiorazioni(
      anteprima({
        maggiorazioni_copiabili: 160,
        assi: [
          { asse: "Colore", varianti: 80 },
          { asse: "Telaio", varianti: 40 },
          { asse: "Tipologia Vetro", varianti: 40 },
        ],
      }),
    );
    expect(r.dettaglio).toBe(
      "Nei tuoi prodotti ci sono già maggiorazioni su Colore, Telaio e Tipologia Vetro. 160 varianti dei prodotti nuovi arrivano senza la tua.",
    );
    // Cosa succede se non le copi, detto in termini di preventivo.
    expect(r.sePiuttosto).toMatch(/in un preventivo non aggiunge nulla al prezzo/);
    expect(`${r.titolo} ${r.dettaglio} ${r.sePiuttosto}`).not.toMatch(/\b(none|token|RPC|sync|errore|null)\b/i);
  });

  it("al singolare con una variante sola", () => {
    const r = testoMaggiorazioni(anteprima({ maggiorazioni_copiabili: 1, assi: [{ asse: "Colore", varianti: 1 }] }));
    expect(r.dettaglio).toContain("1 variante dei prodotti nuovi arriva senza la tua");
  });
});

describe("gli errori dell'installazione, riconosciuti dall'hint che manda il database", () => {
  it("i tre casi previsti", () => {
    expect(tipoErroreInstallazione({ hint: "installazione_recente", message: "x" })).toBe("recente");
    expect(tipoErroreInstallazione({ hint: "installazione_in_corso" })).toBe("in_corso");
    expect(tipoErroreInstallazione({ hint: "maggiorazioni_da_scegliere" })).toBe("scelta_maggiorazioni");
  });

  it("tutto il resto resta un errore vero, anche con input strani", () => {
    expect(tipoErroreInstallazione(new Error("boom"))).toBe("altro");
    expect(tipoErroreInstallazione({ hint: "constructor" })).toBe("altro");
    expect(tipoErroreInstallazione({ hint: 42 })).toBe("altro");
    expect(tipoErroreInstallazione(null)).toBe("altro");
    expect(tipoErroreInstallazione(undefined)).toBe("altro");
    expect(tipoErroreInstallazione("installazione_recente")).toBe("altro");
  });

  it("il messaggio è quello del database, già in italiano; se manca, una frase generica", () => {
    expect(messaggioErroreInstallazione({ message: "Questo modello è già stato aggiunto alle 10:35." })).toBe(
      "Questo modello è già stato aggiunto alle 10:35.",
    );
    expect(messaggioErroreInstallazione(new Error("Accesso non autorizzato"))).toBe("Accesso non autorizzato");
    expect(messaggioErroreInstallazione({ message: "   " })).toMatch(/Riprova/);
    expect(messaggioErroreInstallazione(null)).toMatch(/Riprova/);
  });
});

describe("il resoconto dopo l'installazione racconta anche le maggiorazioni copiate", () => {
  const esito = (extra: Partial<EsitoInstallazione>): EsitoInstallazione => ({
    modello: "Infissi con disegno automatico",
    area: "serramenti",
    tipologie_nuove: 0,
    tipologie_gia_presenti: 2,
    linee_nuove: 1,
    schede_linea: 0,
    prodotti_nuovi: 40,
    prodotti_gia_presenti: 62,
    varianti: 1829,
    celle_griglia: 0,
    documenti: 0,
    con_prezzi: true,
    ...extra,
  });

  it("con la copia: una frase a sé, prima dei prezzi", () => {
    const r = testoEsito(esito({ maggiorazioni_copiate: 160, copia_maggiorazioni: true }));
    expect(r.dettaglio).toBe(
      "2 tipologie che c'erano già, 62 prodotti già presenti, lasciati com'erano. 160 maggiorazioni copiate dal tuo listino. Arrivano con i prezzi di vendita del modello: puoi cambiarli quando vuoi.",
    );
  });

  it("senza la copia (o con un vecchio esito che non ne parla) il testo non cambia", () => {
    const prima = testoEsito(esito({}));
    expect(testoEsito(esito({ maggiorazioni_copiate: 0, copia_maggiorazioni: false }))).toEqual(prima);
    expect(prima.dettaglio).not.toMatch(/copiat/);
  });
});

describe("migrazione: una installazione identica non si rifà", () => {
  const sql = leggi(MIGRAZIONE);
  const core = sql.slice(sql.indexOf("create or replace function public.listino_modello_installa_core"));

  it("un solo file con questa versione (la versione è la chiave del registro)", () => {
    const stessi = readdirSync(join(process.cwd(), "supabase/migrations")).filter((f) => f.startsWith("20281006170000_"));
    expect(stessi).toHaveLength(1);
  });

  it("lock per (modello, azienda), preso DOPO i controlli sui permessi e solo se si scrive", () => {
    expect(core).toMatch(/not p_anteprima\s+and not pg_try_advisory_xact_lock\(hashtextextended\(\s*'listino_modello_installa:' \|\| p_modello_id::text \|\| ':' \|\| p_company_id::text, 0\)\)/);
    expect(core.indexOf("pg_try_advisory_xact_lock")).toBeGreaterThan(core.indexOf("Solo l''amministratore dell''azienda"));
    // Chi arriva mentre l'altra lavora non aspetta: si ferma con un messaggio che l'app sa riconoscere.
    expect(core).toContain("hint = 'installazione_in_corso'");
  });

  it("stessa richiesta (modello, azienda, stessi nomi di linea) nell'ultimo minuto: rifiutata con l'ora", () => {
    expect(core).toContain("i.installato_il > now() - interval '60 seconds'");
    expect(core).toContain("coalesce(i.esito -> 'modelli_richiesti', '[]'::jsonb) = v_nomi");
    expect(core).toMatch(/v_recente is not null and not p_anteprima/);
    expect(core).toContain("hint = 'installazione_recente'");
    expect(core).toContain("to_char(v_recente at time zone 'Europe/Rome', 'HH24:MI')");
  });

  it("i nomi richiesti si ripuliscono (minuscole, senza spazi ai bordi, senza doppi) e finiscono nell'esito", () => {
    expect(core).toMatch(/select distinct lower\(btrim\(n\.nome\)\) as nome/);
    expect(core).toContain("'modelli_richiesti', v_nomi");
  });

  it("l'esito dice anche quante maggiorazioni sono state copiate", () => {
    expect(core).toContain("'maggiorazioni_copiate', v_copiate");
    expect(core).toContain("'copia_maggiorazioni', coalesce(p_copia, false)");
  });
});

describe("migrazione: se l'azienda ha già maggiorazioni, prima si sceglie", () => {
  const sql = leggi(MIGRAZIONE);
  const regole = sql.slice(
    sql.indexOf("create or replace function public.listino_modello_regole_maggiorazione"),
    sql.indexOf("create or replace function public.listino_modello_installa_core"),
  );
  const wrapper = sql.slice(sql.indexOf("create or replace function public.listino_modello_installa(\n"));

  it("le regole dell'azienda: stessa tipologia, solo prodotti e varianti attivi, solo maggiorazioni vere", () => {
    expect(regole).toContain("f.company_id = p_company_id");
    expect(regole).toContain("f.macrocategoria_id = p_macro");
    expect(regole).toContain("f.attivo");
    expect(regole).toContain("f.deleted_at is null");
    expect(regole).toContain("coalesce(v.attivo, true)");
    expect(regole).toContain("v.maggiorazione_tipo <> 'none'");
  });

  it("la variante si riconosce da asse + valore (codice dell'asse, senza maiuscole né spazi ai bordi)", () => {
    expect(regole).toContain("lower(btrim(a.codice)) || '|' || lower(btrim(v.valore))");
  });

  it("se i prodotti non concordano vince la regola più usata, e a parità sempre la stessa", () => {
    expect(regole).toMatch(/distinct on \(r\.chiave\)/);
    expect(regole).toContain("order by r.chiave, r.n desc, r.tipo, r.numero");
  });

  it("si copia solo il lato vendita: l'acquisto non entra nei modelli, come prima", () => {
    expect(regole).not.toContain("maggiorazione_acquisto");
    const core = sql.slice(sql.indexOf("create or replace function public.listino_modello_installa_core"));
    // Nell'inserimento delle varianti l'acquisto resta a zero.
    expect(core).toMatch(/else coalesce\(\(v ->> 'maggiorazione_valore'\)::numeric, 0\) end,\s+0,\s+coalesce\(\(v ->> 'sort_order'\)::int, 0\)/);
  });

  it("la regola dell'azienda vale solo se si è scelto di copiare, e solo dove ce n'è una", () => {
    const core = sql.slice(sql.indexOf("create or replace function public.listino_modello_installa_core"));
    expect(core).toContain("case when coalesce(p_copia, false) and v_regole <> '{}'::jsonb");
    expect(core).toContain("case when x.r is not null then x.r ->> 'tipo' else coalesce(v ->> 'maggiorazione_tipo', 'none') end");
    // Le regole si leggono PRIMA di aggiungere prodotti: i nuovi non devono contare come «esistenti».
    expect(core.indexOf("listino_modello_regole_maggiorazione(p_company_id, v_macro)")).toBeLessThan(
      core.indexOf("insert into public.article_families"),
    );
  });

  it("senza scelta (null) e con maggiorazioni da copiare ci si ferma PRIMA di scrivere", () => {
    expect(wrapper).toContain("p_copia_maggiorazioni boolean default null");
    expect(wrapper).toMatch(/if p_copia_maggiorazioni is null then\s+v_prima := public\.listino_modello_installa_core\(p_modello_id, p_company_id, p_modelli, false, true\);/);
    expect(wrapper).toContain("hint = 'maggiorazioni_da_scegliere'");
    // Solo dopo l'anteprima si chiama l'installazione vera.
    expect(wrapper.indexOf("maggiorazioni_da_scegliere")).toBeLessThan(wrapper.lastIndexOf("listino_modello_installa_core"));
    expect(wrapper).toMatch(/coalesce\(p_copia_maggiorazioni, false\), false\)/);
  });

  it("senza maggiorazioni da copiare l'installazione va avanti come sempre", () => {
    expect(wrapper).toContain("coalesce((v_prima ->> 'maggiorazioni_copiabili')::int, 0) > 0");
  });
});

describe("migrazione: l'anteprima non scrive e usa lo stesso codice dell'installazione", () => {
  const sql = leggi(MIGRAZIONE);
  const core = sql.slice(sql.indexOf("create or replace function public.listino_modello_installa_core"));

  it("l'anteprima è l'installazione con p_anteprima: stessa funzione, non una copia che può divergere", () => {
    expect(sql).toMatch(/create or replace function public\.listino_modello_anteprima\([\s\S]*?return public\.listino_modello_installa_core\(p_modello_id, p_company_id, p_modelli, false, true\);/);
  });

  it("ogni scrittura prima dei prodotti è dietro p_anteprima", () => {
    expect(core).toMatch(/if not p_anteprima then\s+insert into public\.listino_macrocategorie/);
    expect(core).toMatch(/if not p_anteprima then\s+(--[^\n]*\n\s*)*update public\.listino_macrocategorie/);
    expect(core).toMatch(/if not p_anteprima then\s+insert into public\.listino_macrocategoria_fields/);
    expect(core).toMatch(/if p_anteprima then\s+(--[^\n]*\n\s*)*v_linee_da_creare := v_linee_da_creare \|\| [\s\S]*?else\s+insert into public\.listino_categorie/);
    expect(core).toMatch(/if not p_anteprima then\s+insert into public\.listino_schede_linea/);
  });

  it("per i prodotti: conta e passa oltre PRIMA di qualsiasi inserimento, e ritorna prima di registrare l'installazione", () => {
    const ramoAnteprima = core.search(/if p_anteprima then\s+v_prod_nuovi := v_prod_nuovi \+ 1;/);
    expect(ramoAnteprima).toBeGreaterThan(-1);
    expect(ramoAnteprima).toBeLessThan(core.indexOf("insert into public.article_families"));
    expect(core.indexOf("return jsonb_build_object(")).toBeLessThan(core.indexOf("insert into public.listino_modelli_installazioni"));
    // Una linea che non c'è: tutti i suoi prodotti sarebbero nuovi (senza questo il controllo «già presente» li confonderebbe con quelli senza linea).
    expect(core).toContain("not coalesce(v_linee_da_creare ? (v_p ->> 'linea'), false)");
  });

  it("i controlli sui permessi valgono anche per l'anteprima, e prima di ogni altra cosa", () => {
    expect(core.indexOf("Accesso non autorizzato")).toBeLessThan(core.indexOf("v_nomi := to_jsonb"));
    expect(core).toContain("Modello non disponibile");
    expect(core).toContain("Solo l''amministratore dell''azienda può aggiungere un''area da un modello");
  });

  it("la patch visibile_se (20281005120000) non si perde riscrivendo la funzione", () => {
    expect(core).toContain("(family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order, visibile_se)");
    expect(core).toContain("case when jsonb_typeof(v_a -> 'visibile_se') = 'object' then v_a -> 'visibile_se' else null end");
  });

  it("i nomi dei modelli → linee vivono in una funzione sola, usata da tutti", () => {
    expect(sql).toContain("create or replace function public.listino_modello_contenuto_con_nomi(p_contenuto jsonb, p_modelli text[])");
    expect(core).toContain("v_contenuto := public.listino_modello_contenuto_con_nomi(v_mod.contenuto, p_modelli);");
  });
});

describe("migrazione: chi può chiamare cosa", () => {
  const sql = leggi(MIGRAZIONE);

  it("la vecchia firma a 3 argomenti sparisce prima di creare quella nuova (due firme = chiamata ambigua)", () => {
    const drop = sql.indexOf("drop function if exists public.listino_modello_installa(uuid, uuid, text[]);");
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(sql.indexOf("create or replace function public.listino_modello_installa(\n"));
  });

  it("installa e anteprima: agli utenti collegati, non ad anon", () => {
    for (const firma of ["listino_modello_installa(uuid, uuid, text[], boolean)", "listino_modello_anteprima(uuid, uuid, text[])"]) {
      expect(sql).toContain(`revoke all on function public.${firma} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${firma} to authenticated;`);
    }
  });

  it("le funzioni interne non le chiama nessun client", () => {
    for (const firma of [
      "listino_modello_contenuto_con_nomi(jsonb, text[])",
      "listino_modello_regole_maggiorazione(uuid, uuid)",
      "listino_modello_installa_core(uuid, uuid, text[], boolean, boolean)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${firma} from public, anon, authenticated;`);
    }
  });

  it("solo funzioni, con un tetto ai lock: fuori dai corpi delle funzioni nessuna scrittura sui dati", () => {
    expect(sql).toContain("set local lock_timeout = '3s';");
    // Tolti i corpi delle funzioni ($$ … $$), restano solo create/drop/revoke/grant e il lock_timeout.
    const fuori = sql.replace(/\$\$[\s\S]*?\$\$/g, "$$$$").replace(/^\s*--.*$/gm, "");
    expect(fuori).not.toMatch(/^\s*(insert\s+into|update|delete\s+from|truncate|alter\s+table)\b/im);
    expect(fuori).toMatch(/create or replace function/);
  });
});

describe("le finestre che installano avvisano e non si fanno scavalcare dal doppio click", () => {
  const hook = leggi("src/hooks/useModelliArea.ts");
  const nuovaArea = leggi("src/components/listino/NuovaAreaDialog.tsx");
  const infissi = leggi("src/components/listino/ModelliInfissiDialog.tsx");
  const admin = leggi("src/components/admin/listino/InstallaModelloDialog.tsx");

  it("l'hook: anteprima dal database, scelta passata all'installazione, anteprima rifatta dopo ogni installazione", () => {
    expect(hook).toContain('supabase.rpc("listino_modello_anteprima" as never');
    expect(hook).toContain("p_copia_maggiorazioni: m.copiaMaggiorazioni");
    // La scelta si passa solo se c'è: «non ho scelto» arriva al database come null e lì si ferma.
    expect(hook).toContain('typeof m.copiaMaggiorazioni === "boolean"');
    expect(hook).toContain("void qc.invalidateQueries({ queryKey: CHIAVE_ANTEPRIMA });");
  });

  it.each([
    ["Aggiungi un'area", nuovaArea],
    ["installazione dal super admin", admin],
  ])("%s: anteprima, avviso, scelta, guardia contro il doppio invio", (_nome, src) => {
    expect(src).toContain("useAnteprimaInstallazione(");
    expect(src).toContain("<AvvisoInstallazioneModello");
    expect(src).toContain("haMaggiorazioniDaCopiare(anteprima.data)");
    // Se c'è da scegliere si passa la scelta; altrimenti niente, e il database resta la rete di sicurezza.
    expect(src).toContain("copiaMaggiorazioni: daScegliere ? copia : undefined");
    expect(src).toContain("const invioInCorso = useRef(false);");
    // Il secondo click esce subito: la guardia deve stare nel «return» anticipato, non solo esistere.
    expect(src).toMatch(/\|\| invioInCorso\.current\) return;/);
    expect(src).toContain("invioInCorso.current = true;");
    expect(src).toContain("invioInCorso.current = false;");
    expect(src).toContain("tipoErroreInstallazione(e)");
    // L'errore del database è già in italiano: si mostra quello, non un testo inventato dal client.
    expect(src).toContain("messaggioErroreInstallazione(e)");
  });

  it("il pulsante resta spento finché l'anteprima non è arrivata", () => {
    expect(nuovaArea).toMatch(/disabled=\{occupato \|\| !companyId \|\| anteprima\.isLoading \|\| recente\}/);
    expect(admin).toMatch(/disabled=\{!aziendaId \|\| inCorso \|\| anteprima\.isLoading \|\| recente\}/);
  });

  it("Linee di infissi: un catalogo geometrico atomico senza copiare prezzi o maggiorazioni Demo", () => {
    expect(infissi).toContain("preparaModelliInfissi.mutateAsync(elenco)");
    expect(infissi).not.toContain("useModelliArea");
    expect(infissi).not.toContain("copiaMaggiorazioni");
    expect(infissi).toContain("invioInCorso.current) return;");
    expect(infissi).toContain("invioInCorso.current = false;");
    expect(infissi).toContain("elenco.length > 20");
    expect(infissi).toContain("Prezzi già impostati invariati");
    expect(infissi).toContain("I prezzi mancanti seguono la base della stessa linea");
    expect(infissi).toContain("non certifica la gamma del produttore");
  });

  it("Aggiungi un'area: un modello già aggiunto un attimo fa non è un errore, il listino ce l'ha", () => {
    expect(nuovaArea).toMatch(/tipo === "recente"[\s\S]*?toast\.info\([\s\S]*?onAreaDaModello\?\.\(modello\.area\);[\s\S]*?onChiudi\(\);/);
  });

  it("l'avviso: checkbox con la scelta, testo senza parole da tecnici", () => {
    const avviso = leggi("src/components/listino/AvvisoInstallazioneModello.tsx");
    expect(avviso).toContain("Copia le mie maggiorazioni sui prodotti nuovi");
    expect(avviso).toContain("onCheckedChange={(v) => onCopia(v === true)}");
    expect(avviso).toContain("anteprima.installazione_recente");
    expect(avviso).not.toMatch(/\b(RPC|token|sync|polling|errore grezzo|hint)\b/i);
  });
});
