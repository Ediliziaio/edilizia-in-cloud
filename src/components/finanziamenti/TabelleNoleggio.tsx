import { useMemo, useState } from "react";
import { useArchivioNoleggio } from "@/lib/finanziamenti/noleggio/repository";
import { leggiFileNoleggio, csvNoleggio, mappaSuggerita, righeDaGriglia, tabellaDaImport, MODELLO_CSV, ESEMPIO_CSV, CAMPI_NOLEGGIO, type GrigliaImport, type MappaNoleggio } from "@/lib/finanziamenti/noleggio/importazione";
import { CONDIZIONI_VUOTE, calcolaCanone, validaTabellaNoleggio, type CondizioniNoleggio, type TabellaNoleggio, type UnitaCoefficiente } from "../../../supabase/functions/_shared/noleggioOperativo";
import { ETICHETTE_UNITA, scaricaTesto } from "@/lib/finanziamenti/noleggio/presentazione";
const oggi = () => new Date().toLocaleDateString("sv-SE"), msg = (e: unknown) => e instanceof Error ? e.message : "Operazione non riuscita.";
export function TabelleNoleggio({ modificabile }: {
    modificabile: boolean;
}) {
    const archivio = useArchivioNoleggio(), [aperto, setAperto] = useState(false), [griglia, setGriglia] = useState<GrigliaImport | null>(null), [mappa, setMappa] = useState<MappaNoleggio>(mappaSuggerita([])), [unita, setUnita] = useState<UnitaCoefficiente | "">(""), [periodo, setPeriodo] = useState<1 | 3>(3), [originale, setOriginale] = useState<File | null>(null), [allegato, setAllegato] = useState<File | null>(null), [fogli, setFogli] = useState<string[]>([]), [foglio, setFoglio] = useState(0), [condizioni, setCondizioni] = useState(CONDIZIONI_VUOTE), [meta, setMeta] = useState({ fornitore: "", nome: "", revisione: "", dal: oggi(), al: "", prova: false }), [conferma, setConferma] = useState(false), [errore, setErrore] = useState(""), [nota, setNota] = useState(""), [busy, setBusy] = useState(false), [filtro, setFiltro] = useState(""), [stato, setStato] = useState("tutte"), [dettaglio, setDettaglio] = useState<TabellaNoleggio | null>(null), [capitale, setCapitale] = useState(30000), [indice, setIndice] = useState(0);
    const parse = useMemo(() => griglia ? righeDaGriglia(griglia, mappa, unita, periodo) : { righe: [], errori: [] }, [griglia, mappa, unita, periodo]);
    const bozza = () => tabellaDaImport({ versione: 1, id: crypto.randomUUID(), companyId: archivio.companyId ?? "", ...meta, attiva: true, condizioni }, parse.righe, null);
    let errori = parse.errori;
    if (griglia && !errori.length) {
        try {
            bozza();
        }
        catch (e) {
            errori = [msg(e)];
        }
    }
    const carica = async (file: File, index = 0) => { setBusy(true); setErrore(""); setConferma(false); try {
        const r = await leggiFileNoleggio(file, index);
        setOriginale(file);
        setGriglia(r.griglia);
        setFogli(r.fogli);
        setFoglio(index);
        setMappa(mappaSuggerita(r.griglia.colonne));
    }
    catch (e) {
        setErrore(msg(e));
        setGriglia(null);
    }
    finally {
        setBusy(false);
    } };
    const selezionaFile = async (file: File | undefined) => { if (!file)
        return; if (/\.pdf$/i.test(file.name)) {
        if (file.size > 12 * 1024 * 1024) {
            setErrore("PDF troppo grande: massimo 12 MB.");
            return;
        }
        setConferma(false);
        setAllegato(file);
        setErrore(""); setNota("PDF conservato come riferimento. Importa il CSV/XLSX verificato oppure compila il modello CSV: i coefficienti non vengono ricavati automaticamente da un PDF.");
        return;
    } await carica(file); };
    const salva = async () => { if (!modificabile || !conferma || errori.length)
        return; setBusy(true); setErrore(""); try {
        const t = bozza(), files = [originale, allegato].filter((f): f is File => !!f);
        t.allegati = await Promise.all(files.map(async (f) => { const hash = await crypto.subtle.digest("SHA-256", await f.arrayBuffer()); return { nome: f.name, sha256: Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, "0")).join("") }; }));
        t.fonte = t.allegati[0] ?? null;
        await archivio.salva.mutateAsync({ tabella: t, originali: files });
        setOriginale(null);
        setAllegato(null);
        setAperto(false);
        setGriglia(null);
        setConferma(false);
        setNota("Nuova versione salvata. Le condizioni sono disponibili nei preventivi aziendali.");
    }
    catch (e) {
        setErrore(msg(e));
    }
    finally {
        setBusy(false);
    } };
    const tabelle = (archivio.data ?? []).filter(t => `${t.fornitore} ${t.nome} ${t.revisione}`.toLowerCase().includes(filtro.toLowerCase()) && (stato === "tutte" || stato === "attive" && t.attiva && (t.validitaNonIndicata||t.dal <= oggi() && t.al >= oggi()) || stato === "scadute" && !t.validitaNonIndicata && t.al < oggi() || stato === "disattivate" && !t.attiva));
    const indiceAdatto=dettaglio?(dettaglio.righe[indice]&&capitale>=dettaglio.righe[indice].importoDa&&capitale<=dettaglio.righe[indice].importoA?indice:dettaglio.righe.findIndex(r=>capitale>=r.importoDa&&capitale<=r.importoA)):-1;
    let simulazione = "";
    if (dettaglio) {
        try {
            const r = dettaglio.righe[indiceAdatto];if(!r)throw new Error("Importo fuori dalle fasce della tabella.");const c = calcolaCanone((archivio.data ?? []).find(t => t.id === dettaglio.id) ?? dettaglio, capitale, r.durataMesi, r.periodoMesi, archivio.companyId ?? "", oggi());
            simulazione = `${c.canonePeriodo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} + IVA ogni ${r.periodoMesi} mesi · equivalente mensile ${c.equivalenteMensile.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} + IVA`;
        }
        catch (e) {
            simulazione = msg(e);
        }
    }
    return <section className="eic-economia" aria-label="Tabelle noleggio operativo"><h2>Noleggio operativo</h2><p>Carica qui le condizioni GRENKE o di altri fornitori. Ogni versione mantiene fasce, unità dei coefficienti e scadenza; i preventivi conservano le condizioni applicate.</p>
 <div className="eic-economia-tools"><button type="button" disabled={!modificabile} onClick={() => { setAperto(v => !v); setErrore(""); }}>Nuova tabella noleggio</button><button type="button" onClick={() => scaricaTesto("modello-noleggio.csv", MODELLO_CSV)}>Scarica modello CSV</button></div>
 {!modificabile && <p>La modifica richiede il permesso Finanziamenti in modifica.</p>}{archivio.error && <p role="alert">{msg(archivio.error)}</p>}{nota && <p role="status">{nota}</p>}
 {aperto && <div className="eic-economia-card"><h3>Importa una nuova versione</h3><div className="eic-economia-grid">{([['fornitore', 'Fornitore'], ['nome', 'Nome prodotto noleggio'], ['revisione', 'Codice o versione tabella'], ['dal', 'Valida dal'], ['al', 'Valida fino al']] as const).map(([k, l]) => <label key={k}>{l}<input aria-label={l} type={k === "dal" || k === "al" ? "date" : "text"} maxLength={160} value={meta[k]} onChange={e => { setMeta(v => ({ ...v, [k]: e.target.value })); setConferma(false); }}/></label>)}<label>File CSV, XLSX o PDF di riferimento<input aria-label="File tabella noleggio" type="file" accept=".csv,.xlsx,.pdf" disabled={busy} onChange={e => selezionaFile(e.target.files?.[0])}/></label>{fogli.length > 1 && <label>Foglio Excel<select value={foglio} onChange={e => originale && carica(originale, Number(e.target.value))}>{fogli.map((nome, i) => <option key={nome} value={i}>{nome}</option>)}</select></label>}</div>
 <button type="button" disabled={busy} onClick={() => { const g = csvNoleggio(ESEMPIO_CSV); setGriglia(g); setMappa(mappaSuggerita(g.colonne)); setAllegato(null); setOriginale(new File([ESEMPIO_CSV], "tabella-sintetica-di-prova.csv", { type: "text/csv" })); setMeta({ fornitore: "Fornitore dimostrativo", nome: "Esempio tecnico — condizioni sintetiche", revisione: "TEST-1", dal: oggi(), al: `${Number(oggi().slice(0, 4)) + 1}${oggi().slice(4)}`, prova: true }); setConferma(false); setErrore(""); }}>Carica esempio tecnico di prova</button><p>L’esempio non rappresenta condizioni commerciali GRENKE. Per offerte reali carica la tabella ricevuta dal fornitore.</p>
 {griglia && <><h3>Associazione delle colonne</h3><div className="eic-economia-grid">{CAMPI_NOLEGGIO.map(k => <label key={k}>{({ importoDa: "Importo minimo", importoA: "Importo massimo", durataMesi: "Durata in mesi", periodoMesi: "Periodicità in mesi", coefficiente: "Coefficiente o canone", unita: "Unità del coefficiente" })[k]}<select aria-label={`Colonna ${k}`} value={mappa[k]} onChange={e => { setMappa(v => ({ ...v, [k]: e.target.value })); setConferma(false); }}><option value="">{k === "periodoMesi" || k === "unita" ? "Usa scelta sotto" : "Scegli colonna"}</option>{griglia.colonne.map(c => <option key={c} value={c}>{c}</option>)}</select></label>)}<label>Periodicità se non presente<select value={periodo} onChange={e => { setPeriodo(Number(e.target.value) as 1 | 3); setConferma(false); }}><option value={1}>Mensile</option><option value={3}>Trimestrale</option></select></label><label>Unità se non presente<select aria-label="Unità coefficiente predefinita" value={unita} onChange={e => { setUnita(e.target.value as UnitaCoefficiente); setConferma(false); }}><option value="">Scegli esplicitamente</option>{Object.entries(ETICHETTE_UNITA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div></>}
 <h3>Condizioni accessorie</h3><div className="eic-economia-grid">{([['anticipoPct', 'Anticipo sul capitale (%)'], ['speseIniziali', 'Spese iniziali (€ netti)'], ['prelocazione', 'Prelocazione concordata (€ netti)'], ['assicurazioneAnnua', 'Premio assicurativo extra annuo totale (€)'], ['manutenzioneAnnua', 'Manutenzione extra annua (€ netti)']] as const).map(([k, l]) => <label key={k}>{l}<input aria-label={l} type="number" min={0} step={.01} value={condizioni[k]} onChange={e => { setCondizioni(v => ({ ...v, [k]: Number(e.target.value) })); setConferma(false); }}/></label>)}<label>Scadenza dei canoni<select aria-label="Scadenza canoni" value={condizioni.canoniAnticipati ? "anticipati" : "posticipati"} onChange={e => { setCondizioni(v => ({ ...v, canoniAnticipati: e.target.value === "anticipati" })); setConferma(false); }}><option value="anticipati">Anticipati</option><option value="posticipati">Posticipati</option></select></label><label>Fine contratto<select aria-label="Fine contratto noleggio" value={condizioni.fine} onChange={e => { setCondizioni(v => ({ ...v, fine: e.target.value as CondizioniNoleggio["fine"], acquistoFinale: e.target.value === "acquisto" ? v.acquistoFinale ?? 0 : null })); setConferma(false); }}><option value="da_definire">Da definire · nessuna proprietà presunta</option><option value="restituzione">Restituzione del bene</option><option value="acquisto">Acquisto finale concordato</option></select></label>{condizioni.fine === "acquisto" && <label>Prezzo finale concordato (€ netti)<input aria-label="Prezzo acquisto finale" type="number" value={condizioni.acquistoFinale ?? ""} min={0} onChange={e => { setCondizioni(v => ({ ...v, acquistoFinale: e.target.value ? Number(e.target.value) : null })); setConferma(false); }}/></label>}</div><label className="eic-check"><input type="checkbox" checked={condizioni.manutenzioneInclusa} onChange={e => { setCondizioni(v => ({ ...v, manutenzioneInclusa: e.target.checked })); setConferma(false); }}/>Manutenzione inclusa nel canone: non aggiungerla di nuovo nel periodo di noleggio.</label><p>Il coefficiente percentuale si applica al capitale netto dopo l’anticipo indicato. Le fasce si riferiscono al valore netto del bene. Inserisci 0 solo per costi effettivamente assenti o già inclusi.</p>
 {griglia && <><p>{parse.righe.length} righe lette · {[originale?.name, allegato?.name].filter(Boolean).join(" · ")}</p>{errori.length > 0 && <ul role="alert">{errori.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>}<div className="eic-economia-scroll"><table><thead><tr><th>Da €</th><th>A €</th><th>Mesi</th><th>Periodo</th><th>Valore</th><th>Unità</th></tr></thead><tbody>{parse.righe.slice(0, 20).map((r, i) => <tr key={i}><td>{r.importoDa}</td><td>{r.importoA}</td><td>{r.durataMesi}</td><td>{r.periodoMesi}</td><td>{r.coefficiente}</td><td>{ETICHETTE_UNITA[r.unita] ?? r.unita}</td></tr>)}</tbody></table></div><label className="eic-check"><input aria-label="Conferma dati tabella noleggio" type="checkbox" checked={conferma} onChange={e => setConferma(e.target.checked)}/>Ho verificato le righe, le unità, la validità e tutte le condizioni accessorie sul documento del fornitore.</label><button type="button" disabled={!modificabile || !conferma || busy || !!errori.length} onClick={salva}>Salva nuova versione noleggio</button></>}
 </div>}
 {errore && <p role="alert">{errore}</p>}
 <div className="eic-economia-tools"><input aria-label="Cerca tabelle noleggio" placeholder="Fornitore, prodotto o versione…" value={filtro} onChange={e => setFiltro(e.target.value)}/><select aria-label="Filtra tabelle noleggio" value={stato} onChange={e => setStato(e.target.value)}><option value="tutte">Tutte</option><option value="attive">Attive e valide</option><option value="scadute">Scadute</option><option value="disattivate">Disattivate</option></select></div>
 {!archivio.isLoading && !tabelle.length && <p>Nessuna tabella di noleggio disponibile. Carica le condizioni ricevute dal fornitore.</p>}
 <div className="eic-economia-scroll"><table><thead><tr><th>Fornitore e prodotto</th><th>Versione</th><th>Validità</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>{tabelle.map(t => <tr key={t.id}><td>{t.fornitore} · {t.nome}{t.prova && <strong> · PROVA</strong>}</td><td>{t.revisione}</td><td>{t.validitaNonIndicata?"Non indicata nel documento":`${t.dal} → ${t.al}`}</td><td>{t.soloSimulazione?"Solo simulazione":!t.attiva ? "Disattiva" : t.al < oggi() ? "Scaduta" : t.dal > oggi() ? "Futura" : "Valida"}</td><td><button type="button" onClick={() => { setDettaglio(t); setIndice(0); }}>Apri e simula</button><button type="button" disabled={!modificabile || archivio.stato.isPending} onClick={async () => { try {
        await archivio.stato.mutateAsync({ id: t.id, attiva: !t.attiva });
        setNota("Stato aggiornato. Le condizioni già congelate nei preventivi restano conservate.");
    }
    catch (e) {
        setErrore(msg(e));
    } }}>{t.attiva ? "Disattiva" : "Riattiva"}</button></td></tr>)}</tbody></table></div>
 {dettaglio && <div className="eic-economia-card"><h3>{dettaglio.nome} · {dettaglio.revisione}</h3><p>{dettaglio.righe.length} righe · {dettaglio.note??""}</p>{dettaglio.assicurazioneDaQuotare&&<p role="alert">Assicurazione obbligatoria esclusa dai coefficienti: premio da quotare.</p>}<p>Fonti: {dettaglio.allegati?.map(f => f.nome).join(" · ") || dettaglio.fonte?.nome || "Inserimento verificato"}. {dettaglio.prova ? "Condizioni sintetiche di prova." : ""}</p><div className="eic-economia-grid"><label>Capitale netto da simulare<input aria-label="Capitale simulazione noleggio" type="number" value={capitale} onChange={e => setCapitale(Number(e.target.value))}/></label><label>Durata e periodicità<select aria-label="Durata simulazione noleggio" value={indiceAdatto} onChange={e => setIndice(Number(e.target.value))}>{indiceAdatto<0&&<option value={-1}>Nessuna fascia per questo importo</option>}{dettaglio.righe.map((r, i) => capitale>=r.importoDa&&capitale<=r.importoA?<option key={i} value={i}>{r.durataMesi} mesi · canone ogni {r.periodoMesi} mesi · fascia {r.importoDa}–{r.importoA} €</option>:null)}</select></label></div><output aria-label="Canone simulato">{simulazione}</output><button type="button" onClick={() => scaricaTesto("versione-tabella-noleggio.json", JSON.stringify(validaTabellaNoleggio(dettaglio), null, 2), "application/json")}>Scarica versione verificata</button></div>}
 </section>;
}
