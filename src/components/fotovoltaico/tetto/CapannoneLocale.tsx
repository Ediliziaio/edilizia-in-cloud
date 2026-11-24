import { UniformSelect } from "@/components/ui/uniform-select";
import { useEffect, useRef, useState } from "react";
import { CAPANNONE_BASE, POSA_BASE, fonteCapannone, configuraCapannone, gruppiProduzione, type ParametriCapannone } from "./capannone";
import { useArchivioRilievi } from "./archivioRilievi";
import { limitiDisegno, aggiornaOstacoloConPosa, disponiModuliIndustriali, type DisegnoCommercialeFv, type OstacoloFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import type { RilievoRuntime } from "./rilievoLocale";
import { supabase } from "@/integrations/supabase/client";
import { stimaProduzioneFv } from "@/lib/fotovoltaico/anteprima";
import type { FvDisegnoPreventivoProps } from "../FvDisegnoPreventivo";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
type Props = {
    potenzaModuloW: number;
    localita: FvDisegnoPreventivoProps["localita"];
    riepilogoProposta: FvDisegnoPreventivoProps["riepilogoProposta"];
    piano: DisegnoCommercialeFv;
    runtime: RilievoRuntime | null;
    modificabile: boolean;
    onChange: (p: DisegnoCommercialeFv) => void;
};
export function CapannoneLocale({ piano, runtime, modificabile, onChange, potenzaModuloW, localita, riepilogoProposta }: Props) {
  const t = useT();
    const { salva: salvaRilievoLocale } = useArchivioRilievi();
    const [p, setP] = useState<ParametriCapannone>(() => (runtime?.edificio.attributi.schemaIndustriale as ParametriCapannone) ?? CAPANNONE_BASE), [cfg, setCfg] = useState(piano.industriale ?? POSA_BASE), [quantita, setQuantita] = useState(piano.industriale ? piano.pannelli.length : 600), [nota, setNota] = useState(""), [busy, setBusy] = useState(false), [confronto, setConfronto] = useState<{
        chiave: string;
        righe: Array<{
            nome: string;
            moduli: number;
            kwp: number;
            totale: number | null;
            produzione: number | null;
        }>;
    } | null>(null), [fid, setFid] = useState(piano.falde[0]?.id ?? ""), [o, setO] = useState({ tipo: "lucernario" as NonNullable<OstacoloFv["tipo"]>, x: 1, y: 1, w: 2, h: 2 }), [gruppo, setGruppo] = useState(0);
    useEffect(() => { const cfg = runtime?.edificio.attributi.schemaIndustriale as ParametriCapannone | undefined; if (cfg)
        setP(cfg); }, [runtime?.fonte?.id]);
    const vivo = useRef(true);
    useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
    const chiave = JSON.stringify([p, cfg, piano.modulo, localita]);
    const compara = async () => {
        setBusy(true);
        try {
            const source = fonteCapannone({ ...p, copertura: "piano" });
            const proposte = (["aderente", "sud", "est_ovest"] as const).map(posa => { const piano = configuraCapannone(source, pianoAttuale.modulo, { ...cfg, posa }, 2000, p.corridoio), r = riepilogoProposta?.(piano); return { nome: posa === "aderente" ? t("Aderente") : posa === "sud" ? t("File sud") : t("Est–ovest"), piano, moduli: piano.pannelli.length, kwp: piano.pannelli.length * potenzaModuloW / 1000, totale: r?.totale ?? null, produzione: null as number | null }; });
            setConfronto({ chiave, righe: proposte });
            for (const [i, proposta] of proposte.entries()) {
                if (!localita || !proposta.moduli)
                    continue;
                try {
                    const { data, error } = await supabase.functions.invoke("fv-pvgis-fetch", { body: { ...localita, kwp: proposta.kwp, gruppi: gruppiProduzione(proposta.piano, source.edificioBase, potenzaModuloW) } });
                    if (error)
                        throw error;
                    if (vivo.current)
                        setConfronto(v => v?.chiave === chiave ? { ...v, righe: v.righe.map((r, j) => j === i ? { ...r, produzione: stimaProduzioneFv({ potenza_kwp: r.kwp, ore_sole_annue: data.ore_sole_annue_equivalenti }) } : r) } : v);
                }
                catch { /* Le righe restano confrontabili senza inventare una produzione. */ }
            }
            if (vivo.current)
                setNota(t("Confronto sul medesimo tetto piano, fino a 2.000 moduli, con il corridoio indicato. Totali con prezzi, sconto e IVA del preventivo; produzione indicativa senza ombre vicine. Nessuna proposta applicata automaticamente."));
        }
        catch (e) {
            if (vivo.current)
                setNota(msg(e));
        }
        finally {
            if (vivo.current)
                setBusy(false);
        }
    };
    const pianoAttuale = piano;
    const msg = (e: unknown) => e instanceof Error ? e.message : t("Impossibile creare la configurazione.");
    const applica = async (esistente = false) => {
        setBusy(true);
        try {
            if (esistente) {
                if (!runtime?.fonte)
                    throw new Error(t("Importa prima il rilievo del cliente."));
                const source = runtime.fonte, nuovo = configuraCapannone(source, piano.modulo, cfg, quantita, 0);
                nuovo.ostacoli = [...piano.ostacoli];
                onChange(disponiModuliIndustriali(nuovo, quantita));
            }
            else {
                const source = fonteCapannone(p), posa = p.copertura === "piano" ? cfg : { ...cfg, posa: "aderente" as const }, next = configuraCapannone(source, piano.modulo, posa, quantita, p.corridoio);
                await salvaRilievoLocale(source);
                onChange(next);
                setCfg(posa);
            }
            setNota(t("Configurazione applicata alla bozza. Controlla il 3D e il totale, poi conferma il preventivo."));
        }
        catch (e) {
            setNota(msg(e));
        }
        finally {
            setBusy(false);
        }
    };
    const gruppi = [...new Set(piano.pannelli.filter(m => m.supporto).map(m => m.supporto!.gruppo))].sort((a, b) => a - b);
    return <div className="fv-import-panel fv-industriale-panel"><h3>{t("Capannone e posa industriale")}</h3><p className="fv-roof-photo-note">{t("Puoi creare uno schema con misure note oppure applicare la posa al rilievo importato. Il confronto propone quantità commerciali: distanze e corridoi sono valori scelti da verificare nel progetto tecnico.")}</p>
 <h4>{t("Copertura dello schema")}</h4><div className="fv-import-fields"><label>{t("Tipo di copertura")}<UniformSelect aria-label={t("Copertura capannone")} value={p.copertura} disabled={!modificabile} onChange={e => setP(v => ({ ...v, copertura: e.target.value as ParametriCapannone["copertura"] }))}><option value="piano">{t("Tetto piano")}</option><option value="due_falde">{t("Doppia falda")}</option><option value="shed">{t("Shed ripetuti")}</option></UniformSelect></label>{([['larghezza', 'Larghezza capannone (m)'], ['profondita', 'Profondità capannone (m)'], ['altezza', 'Altezza gronda (m)'], ['pendenza', 'Pendenza falde (°)'], ['shed', 'Numero shed'], ['corridoio', 'Corridoio centrale libero (m)']] as const).map(([k, label]) => <label key={k}>{label}<input aria-label={label} type="number" step={k === "shed" ? 1 : .1} value={p[k]} disabled={!modificabile || ((k === "pendenza" || k === "shed") && p.copertura === "piano") || (k === "shed" && p.copertura !== "shed")} onChange={e => setP(v => ({ ...v, [k]: Number(e.target.value) }))}/></label>)}</div>
 <h4>{t("Disposizione e componenti")}</h4><div className="fv-import-fields"><label>{t("Posa pannelli")}<UniformSelect aria-label={t("Posa industriale")} value={cfg.posa} disabled={!modificabile} onChange={e => setCfg(v => ({ ...v, posa: e.target.value as typeof cfg.posa }))}><option value="aderente">{t("Aderente alla copertura")}</option><option value="sud">{t("File inclinate verso sud · tetto piano")}</option><option value="est_ovest">{t("Coppie est–ovest · tetto piano")}</option></UniformSelect></label><label>{t("Inclinazione supporti (°)")}<input aria-label={t("Inclinazione supporti")} type="number" min={0} max={35} value={cfg.inclinazione} disabled={!modificabile || cfg.posa === "aderente"} onChange={e => setCfg(v => ({ ...v, inclinazione: Number(e.target.value) }))}/></label><label>{t("Spazio libero tra file o coppie (m)")}<input aria-label={t("Interfila industriale")} type="number" min={.02} max={5} step={.1} value={cfg.interfila} disabled={!modificabile || cfg.posa === "aderente"} onChange={e => setCfg(v => ({ ...v, interfila: Number(e.target.value) }))}/></label><label>{t("Moduli richiesti · massimo 2.000")}<input aria-label={t("Moduli capannone")} type="number" min={1} max={2000} value={quantita} disabled={!modificabile} onChange={e => setQuantita(Number(e.target.value))}/></label>{([['strutturaModulo', 'Strutture e fissaggi · €/modulo'], ['inverterAggiuntivi', 'Inverter aggiuntivi · quantità'], ['prezzoInverter', 'Inverter aggiuntivo · €/pz']] as const).map(([k, label]) => <label key={k}>{label}<input type="number" aria-label={label} step={k === "inverterAggiuntivi" ? 1 : .01} min={0} value={cfg.costi?.[k] ?? 0} disabled={!modificabile} onChange={e => setCfg(v => ({ ...v, costi: { strutturaModulo: 0, inverterAggiuntivi: 0, prezzoInverter: 0, ...v.costi, [k]: Number(e.target.value) } }))}/></label>)}</div>
 <p className="fv-roof-photo-note">{t("Gli inverter aggiuntivi si sommano a quello scelto nella configurazione. Prezzi e quantità delle strutture diventano righe del preventivo; i costi di acquisto restano da completare. La distanza fra file non è un calcolo di ombreggiamento.")}</p>
 <div className="fv-roof-photo-tools"><button type="button" disabled={!modificabile || busy || !Number.isInteger(quantita) || quantita < 1 || quantita > 2000} onClick={() => applica()}>{t("Crea schema e applica posa alla bozza")}</button><button type="button" disabled={!modificabile || busy || !runtime?.fonte || !Number.isInteger(quantita) || quantita < 1 || quantita > 2000} onClick={() => applica(true)}>{t("Applica posa al rilievo attuale")}</button><button type="button" disabled={busy} onClick={compara}>{t("Confronta capacità su tetto piano")}</button></div>
 {confronto?.chiave === chiave && <table className="fv-industriale-confronto"><thead><tr><th>{t("Configurazione")}</th><th>{t("Moduli")}</th><th>kWp</th><th>{t("kWh/anno stimati")}</th><th>{t("Totale IVA inclusa")}</th></tr></thead><tbody>{confronto.righe.map(c => <tr key={c.nome}><td>{c.nome}</td><td>{c.moduli}</td><td>{c.kwp.toLocaleString(intlCampo())}</td><td>{c.produzione === null ? "—" : Math.round(c.produzione).toLocaleString(intlCampo())}</td><td>{c.totale === null ? "—" : c.totale.toLocaleString(intlCampo(), { style: "currency", currency: "EUR" })}</td></tr>)}</tbody></table>}
 {confronto?.chiave === chiave && <p className="fv-roof-photo-note">{busy ? t("Calcolo PVGIS delle esposizioni in corso…") : t("— indica una stima o un prezzo non disponibile. Il confronto usa i fattori standard del preventivatore; ottimizzatori e ombre del singolo impianto da verificare.")}</p>}
 <h4>{t("Zone da lasciare libere")}</h4><div className="fv-import-fields"><label>{t("Falda")}<UniformSelect aria-label={t("Falda zona esclusa")} value={fid} onChange={e => setFid(e.target.value)}>{piano.falde.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</UniformSelect></label><label>{t("Tipo zona")}<UniformSelect aria-label={t("Tipo zona esclusa")} value={o.tipo} onChange={e => setO(v => ({ ...v, tipo: e.target.value as typeof o.tipo }))}><option value="lucernario">{t("Lucernario")}</option><option value="evacuatore">{t("Evacuatore")}</option><option value="impianto">{t("Impianto sul tetto")}</option><option value="corridoio">{t("Passaggio / corridoio")}</option></UniformSelect></label>{([['x', 'Distanza X dal bordo della falda (m)'], ['y', 'Distanza Y dal bordo della falda (m)'], ['w', 'Larghezza zona (m)'], ['h', 'Profondità zona (m)']] as const).map(([k, label]) => <label key={k}>{label}<input aria-label={label} type="number" step={.1} value={o[k]} disabled={!modificabile} onChange={e => setO(v => ({ ...v, [k]: Number(e.target.value) }))}/></label>)}</div><button type="button" disabled={!modificabile} onClick={() => {
            const f = piano.falde.find(f => f.id === fid) ?? piano.falde[0], b = limitiDisegno({ falde: [f] }), next = aggiornaOstacoloConPosa(piano, { ...o, id: `zona-${crypto.randomUUID()}`, x: b.x + o.x, y: b.y + o.y });
            if (next) {
                onChange(next);
                setNota(t("Zona esclusa inserita; restano {n} moduli. Controlla il totale prima di confermare.", { n: next.pannelli.length }));
            }
            else
                setNota(t("La zona deve stare nella falda senza sovrapporsi alle altre esclusioni."));
        }}>{t("Inserisci zona e ridisponi")}</button>
 {gruppi.length > 0 && <><h4>{t("Modifica per file o coppie")}</h4><div className="fv-roof-photo-tools"><UniformSelect aria-label={t("Fila o coppia industriale")} value={gruppi.includes(gruppo) ? gruppo : gruppi[0]} onChange={e => setGruppo(Number(e.target.value))}>{gruppi.map(n => <option key={n} value={n}>{cfg.posa === "sud" ? t("Fila") : t("Coppia")} {n + 1}</option>)}</UniformSelect><button type="button" disabled={!modificabile} onClick={() => { const g = gruppi.includes(gruppo) ? gruppo : gruppi[0]; onChange({ ...piano, pannelli: piano.pannelli.filter(m => m.supporto?.gruppo !== g) }); setNota(t("Gruppo rimosso da tutte le falde: quantità e prezzo aggiornati nella bozza.")); }}>{t("Rimuovi gruppo dalla disposizione")}</button></div></>}
 {nota && <p role="status" className="fv-roof-photo-note">{nota}</p>}
 </div>;
}
