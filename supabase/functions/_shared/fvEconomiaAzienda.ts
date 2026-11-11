import {calcolaLeasing,type OffertaLeasing} from "./fvLeasing.ts";
import { calcolaCanone, dataValida, euro, type TabellaNoleggio } from "./noleggioOperativo.ts";
export type ParametriEconomiaAzienda = {
    versione: 1;
    dataPreventivo: string;
    dataInizio: string;
    orizzonteAnni: number;
    consumiMensili: number[];
    produzionePesiMensili: number[];
    quotaAutoconsumo: number;
    costoEnergia: number;
    costiFissiAnnui: number;
    prezzoCessione: number;
    degrado: number;
    inflazioneEnergia: number;
    manutenzioneAnnua: number;
    assicurazioneAnnua: number;
    sostituzioneInverter: number;
    annoInverter: number;
    ivaRecuperabilePct: number;
    ritardoIvaMesi: number;
    fiscale: {
        attivo: boolean;
        aliquota: number;
        quotaDeducibile: number;
        anniAmmortamento: number;
        quotaTassabileBenefici: number;
        capienzaAnnua: number;
    };
    anticipoFinanziamentoPct: number;
    durataFinanziamentoMesi: number;
    rataFinanziamento: number | null;
    capitaleOffertaFinanziamento: number | null;
    speseFinanziamento: number;
    fonteFinanziamento: string;
    tanFinanziamento: number | null;
    tabellaNoleggio: TabellaNoleggio | null;
    durataNoleggioMesi: number;
    periodoNoleggioMesi: 1 | 3;
    leasing?:OffertaLeasing;
    modo: "cash" | "rate" | "noleggio" | "leasing";
};
export type InputEconomiaAzienda = {
    companyId: string;
    clienteRiferimento?:string;
    imponibile: number;
    iva: number;
    produzioneAnnua: number;
    parametri: ParametriEconomiaAzienda;
};
export type MeseEconomia = {
    mese: number;
    data: string;
    produzione: number;
    autoconsumo: number;
    immissione: number;
    bollettaPrima: number;
    bollettaDopo: number;
    risparmio: number;
    ricavi: number;
    pagamenti: number;
    gestione: number;
    beneficioFiscale: number;
    ivaPagata: number;
    ivaRecuperata: number;
    flusso: number;
    cumulato: number;
};
export type AnnoEconomia = {
    anno: number;
    produzione: number;
    risparmio: number;
    ricavi: number;
    pagamenti: number;
    gestione: number;
    beneficioFiscale: number;
    ivaNetta: number;
    flusso: number;
    cumulato: number;
    quotaAmmortamento: number;
};
export type RisultatoEconomiaAzienda = {
    versione: 1;
    modo: ParametriEconomiaAzienda["modo"];
    mesi: MeseEconomia[];
    anni: AnnoEconomia[];
    saldoFinale: number;
    saldoPrimoAnno: number;
    risparmioPrimoAnno: number;
    canonePeriodo: number | null;
    canoneMensileEquivalente: number | null;
    recuperoMesi: number | null;
    totalePagamenti: number;
    fineDefinita: boolean;
    costiDaQuotare:boolean;
    avvisi: string[];
};
export type SnapshotEconomiaAzienda = {
    versione: 1;
    creato: string;
    firma: string;
    input: InputEconomiaAzienda;
    risultato: RisultatoEconomiaAzienda;
};
const n = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
function intero(v: unknown, min: number, max: number) { return n(v, min, max) && Number.isInteger(v); }
export function validaInputEconomiaAzienda(i: InputEconomiaAzienda) {
    const p = i.parametri;
    if (!i.companyId || !n(i.imponibile, .01, 1e8) || !n(i.iva, 0, 1) || !n(i.produzioneAnnua, .01, 1e9) || p?.versione !== 1 || !dataValida(p.dataInizio) || !dataValida(p.dataPreventivo) || !intero(p.orizzonteAnni, 1, 30) || !Array.isArray(p.consumiMensili) || p.consumiMensili.length !== 12 || !p.consumiMensili.every(v => n(v, 0, 1e8)) || p.consumiMensili.reduce((a, b) => a + b, 0) <= 0 || !Array.isArray(p.produzionePesiMensili) || p.produzionePesiMensili.length !== 12 || !p.produzionePesiMensili.every(v => n(v, 0, 1)) || Math.abs(p.produzionePesiMensili.reduce((a, b) => a + b, 0) - 1) > .000001)
        throw new Error("Completa località/produzione, prezzo, data e dodici consumi mensili. I pesi di produzione devono sommare al 100%.");
    for (const [k, min, max] of [["quotaAutoconsumo", 0, 1], ["costoEnergia", .001, 5], ["costiFissiAnnui", 0, 1e7], ["prezzoCessione", 0, 2], ["degrado", 0, .1], ["inflazioneEnergia", -.1, .2], ["manutenzioneAnnua", 0, 1e7], ["assicurazioneAnnua", 0, 1e7], ["sostituzioneInverter", 0, 1e7], ["ivaRecuperabilePct", 0, 100], ["anticipoFinanziamentoPct", 0, 99], ["speseFinanziamento", 0, 1e7]] as const)
        if (!n(p[k], min, max))
            throw new Error(`Valore non valido: ${k}.`);
    if (!intero(p.annoInverter, 1, 30) || !intero(p.ritardoIvaMesi, 0, 36) || !p.fiscale || typeof p.fiscale.attivo !== "boolean" || !n(p.fiscale.aliquota, 0, .6) || !n(p.fiscale.quotaDeducibile, 0, 1) || !intero(p.fiscale.anniAmmortamento, 1, 40) || !n(p.fiscale.quotaTassabileBenefici, 0, 1) || !n(p.fiscale.capienzaAnnua, 0, 1e8) || !["cash", "rate", "noleggio", "leasing"].includes(p.modo))
        throw new Error("Verifica gestione, recupero IVA e ipotesi fiscali.");
    if (p.modo === "rate" && (!intero(p.durataFinanziamentoMesi, 1, 240) || !n(p.rataFinanziamento, .01, 1e7) || !p.fonteFinanziamento.trim() || (p.tanFinanziamento !== null && !n(p.tanFinanziamento, 0, 100))))
        throw new Error("Seleziona una rata da tabella o inserisci un’offerta verificata con durata e fonte.");
    if (p.modo === "rate" && (!n(p.capitaleOffertaFinanziamento, .01, 1e8) || Math.abs(p.capitaleOffertaFinanziamento! - euro(i.imponibile * (1 - p.anticipoFinanziamentoPct / 100))) > .01))
        throw new Error("Il capitale dell’offerta non corrisponde al preventivo corrente: aggiorna l’offerta di finanziamento.");
    if (p.modo === "rate" && euro(p.rataFinanziamento! * p.durataFinanziamentoMesi) < euro(i.imponibile * (1 - p.anticipoFinanziamentoPct / 100)))
        throw new Error("Il totale delle rate è inferiore al capitale netto finanziato. Verifica l’offerta.");
}
export function dataMese(inizio: string, mese: number) { const [y, m, d] = inizio.split("-").map(Number), ultimo = new Date(Date.UTC(y, m - 1 + mese + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m - 1 + mese, Math.min(d, ultimo))).toISOString().slice(0, 10); }
export function calcolaEconomiaAzienda(i: InputEconomiaAzienda): RisultatoEconomiaAzienda {
    validaInputEconomiaAzienda(i);
    if (i.parametri.modo === "noleggio" && !i.parametri.tabellaNoleggio)
        throw new Error("Seleziona una tabella di noleggio da Impostazioni → Finanziamenti.");
    const p = i.parametri, rental = p.modo === "noleggio" ? calcolaCanone(p.tabellaNoleggio!, i.imponibile, p.durataNoleggioMesi, p.periodoNoleggioMesi, i.companyId, p.dataPreventivo) : p.modo==="leasing"?calcolaLeasing(p.leasing,i.imponibile,i.companyId,p.dataPreventivo):null, c = rental?.tabella.condizioni;
    const durataCanoni=rental?.riga.durataMesi??0;
    const fineDefinita = !rental || c?.fine !== "da_definire", orizzonte = p.orizzonteAnni * 12, ultimo = rental && c?.fine !== "acquisto" ? Math.min(orizzonte, durataCanoni) : orizzonte, avvisi: string[] = [];
    if(p.modo==="leasing")avvisi.push("Leasing: maxicanone e canoni seguono l’offerta inserita, comprese numero e prima scadenza. La fiscalità è una stima per competenza senza verifiche normative sul contratto. Il riscatto si include solo se scelto esplicitamente; non è un finanziamento all’acquisto.");
    if(rental?.tabella.soloSimulazione&&!rental.tabella.prova)avvisi.push("Coefficienti dal documento fornito: simulazione non impegnativa, validità commerciale non confermata.");
    if(rental?.tabella.assicurazioneDaQuotare)avvisi.push("Assicurazione obbligatoria non inclusa nei coefficienti e non quantificata: i saldi sono prima del premio. Anche spese accessorie e prelocazione sono da confermare.");
    if (rental?.tabella.prova)
        avvisi.push("Tabella sintetica di prova: non usare questo prospetto come offerta commerciale.");
    if (!fineDefinita)
        avvisi.push((p.modo==="leasing"?"Fine leasing da definire:":"Fine noleggio da definire:")+" il prospetto si ferma alla durata contrattuale. Nessuna proprietà o prosecuzione del risparmio è presunta.");
    if (c?.fine === "restituzione")
        avvisi.push("Restituzione prevista: i benefici dell’impianto si fermano al termine del noleggio.");
    avvisi.push("Autoconsumo stimato su bilanci mensili e quota dichiarata, senza curva oraria. Costi fissi della bolletta conservati.");
    if (p.produzionePesiMensili.every(v => Math.abs(v - 1 / 12) < .000001))
        avvisi.push("Produzione distribuita uniformemente nei mesi: carica un profilo mensile verificato per una simulazione stagionale.");
    if (p.fiscale.attivo)
        avvisi.push("Benefici fiscali basati su aliquota, deducibilità e ammortamento inseriti: ipotesi da verificare per il cliente. La variazione di imposte è rappresentata a fine anno, con tassabilità dei benefici e capienza inserite; interessi finanziari e acconti tributari non sono simulati.");
    const mesi: MeseEconomia[] = [], ivaDaRecuperare = new Map<number, number>();
    let cumulato = 0, negativo = false, recuperoMesi: number | null = null;
    const manutenzioneNoleggio = c?.manutenzioneInclusa ? 0 : c?.manutenzioneAnnua ?? 0;
    for (let mese = 0; mese <= ultimo; mese++) {
        const data = dataMese(p.dataInizio, mese), anno = mese === 0 ? 0 : Math.ceil(mese / 12), calendario = (Number(data.slice(5, 7)) + 10) % 12;
        const nelNoleggio = !!rental && mese <= durataCanoni, proprietario = !rental || mese > durataCanoni && c?.fine === "acquisto";
        let pagamenti = 0, gestione = 0, beneficioFiscale = 0, ivaPagata = 0, ivaRecuperata = 0;
        if (mese === 0) {
            pagamenti = p.modo === "cash" ? i.imponibile : p.modo === "rate" ? euro(i.imponibile * p.anticipoFinanziamentoPct / 100) + p.speseFinanziamento : rental!.anticipo + c!.speseIniziali + c!.prelocazione;
            // L’IVA del bene di proprietà è pagata all’avvio; nel noleggio segue i singoli canoni.
            ivaPagata = rental ? euro(pagamenti * i.iva) : euro(i.imponibile * i.iva);
        }
        if (p.modo === "rate" && mese > 0 && mese <= p.durataFinanziamentoMesi)
            pagamenti += p.rataFinanziamento!;
        if (rental) {
            const scadenza = p.modo==="leasing"?mese>=p.leasing!.primoCanoneMese&&(mese-p.leasing!.primoCanoneMese)%p.leasing!.periodoMesi===0&&(mese-p.leasing!.primoCanoneMese)/p.leasing!.periodoMesi<p.leasing!.numeroCanoni:c!.canoniAnticipati ? mese % rental.riga.periodoMesi === 0 && mese < durataCanoni : mese > 0 && mese % rental.riga.periodoMesi === 0 && mese <= durataCanoni;
            if (scadenza) {
                pagamenti += rental.canonePeriodo;
                ivaPagata += euro(rental.canonePeriodo * i.iva);
            }
            if (mese === durataCanoni && c!.fine === "acquisto") {
                pagamenti += c!.acquistoFinale ?? 0;
                ivaPagata += euro((c!.acquistoFinale ?? 0) * i.iva);
            }
        }
        if (mese > 0) {
            gestione = (nelNoleggio ? manutenzioneNoleggio + c!.assicurazioneAnnua : p.manutenzioneAnnua + p.assicurazioneAnnua) / 12;
            if (proprietario && mese === p.annoInverter * 12)
                gestione += p.sostituzioneInverter;
            ivaPagata += euro((gestione - (mese > 0 ? (nelNoleggio ? c!.assicurazioneAnnua : p.assicurazioneAnnua) / 12 : 0)) * i.iva);
        }
        if (p.ivaRecuperabilePct > 0 && ivaPagata > 0) {
            const scad = mese + p.ritardoIvaMesi;
            ivaDaRecuperare.set(scad, (ivaDaRecuperare.get(scad) ?? 0) + euro(ivaPagata * p.ivaRecuperabilePct / 100));
        }
        ivaRecuperata = ivaDaRecuperare.get(mese) ?? 0;
        const produzione = mese === 0 ? 0 : i.produzioneAnnua * p.produzionePesiMensili[calendario] * Math.pow(1 - p.degrado, anno - 1), consumo = mese === 0 ? 0 : p.consumiMensili[calendario], autoconsumo = Math.min(consumo, produzione * p.quotaAutoconsumo), immissione = Math.max(0, produzione - autoconsumo), prezzo = p.costoEnergia * Math.pow(1 + p.inflazioneEnergia, Math.max(0, anno - 1)), risparmio = autoconsumo * prezzo, ricavi = immissione * p.prezzoCessione, bollettaPrima = mese === 0 ? 0 : consumo * prezzo + p.costiFissiAnnui / 12, bollettaDopo = mese === 0 ? 0 : (consumo - autoconsumo) * prezzo + p.costiFissiAnnui / 12;
        if (p.fiscale.attivo && mese > 0 && mese % 12 === 0) {
            const prec = mesi.filter(m => m.mese > mese - 12), gestioneAnno = prec.reduce((n, m) => n + m.gestione, 0) + gestione, beneficiAnno = prec.reduce((n, m) => n + m.risparmio + m.ricavi, 0) + risparmio + ricavi;
            const inizioAnno = mese - 12, mesiNoleggio = rental ? Math.max(0, Math.min(mese, durataCanoni) - inizioAnno) : 0;
            let deduzioni = gestioneAnno;
            if (rental) {
                deduzioni += ((rental.totaleCanoni + rental.anticipo) / durataCanoni) * mesiNoleggio;
                if (mese === 12)
                    deduzioni += c!.speseIniziali + c!.prelocazione;
            }
            else if (anno <= p.fiscale.anniAmmortamento)
                deduzioni += i.imponibile / p.fiscale.anniAmmortamento;
            if (rental && c!.fine === "acquisto" && mese > durataCanoni && mese - durataCanoni <= p.fiscale.anniAmmortamento * 12) {
                const mesiDiProprieta = Math.min(12, mese - durataCanoni);
                deduzioni += (c!.acquistoFinale ?? 0) / p.fiscale.anniAmmortamento * mesiDiProprieta / 12;
            }
            const delta = (deduzioni * p.fiscale.quotaDeducibile - beneficiAnno * p.fiscale.quotaTassabileBenefici) * p.fiscale.aliquota;
            beneficioFiscale = euro(delta > 0 ? Math.min(delta, p.fiscale.capienzaAnnua) : delta);
        }
        const flusso = euro(risparmio + ricavi + beneficioFiscale - pagamenti - gestione - ivaPagata + ivaRecuperata);
        cumulato = euro(cumulato + flusso);
        if (cumulato < 0)
            negativo = true;
        if (negativo && cumulato >= 0 && recuperoMesi === null)
            recuperoMesi = mese;
        mesi.push({ mese, data, produzione: euro(produzione), autoconsumo: euro(autoconsumo), immissione: euro(immissione), bollettaPrima: euro(bollettaPrima), bollettaDopo: euro(bollettaDopo), risparmio: euro(risparmio), ricavi: euro(ricavi), pagamenti: euro(pagamenti), gestione: euro(gestione), beneficioFiscale, ivaPagata: euro(ivaPagata), ivaRecuperata: euro(ivaRecuperata), flusso, cumulato });
    }
    // Un incrocio provvisorio prima di un canone trimestrale non è un recupero stabile.
    recuperoMesi=negativo?(mesi.find((m,index)=>m.cumulato>=0&&mesi.slice(index).every(f=>f.cumulato>=0))?.mese??null):null;
    const anni: AnnoEconomia[] = [];
    for (let anno = 0; anno <= Math.ceil(ultimo / 12); anno++) {
        const rows = mesi.filter(m => anno === 0 ? m.mese === 0 : m.mese > (anno - 1) * 12 && m.mese <= anno * 12), somma = (k: keyof MeseEconomia) => euro(rows.reduce((n, r) => n + Number(r[k]), 0));
        anni.push({ anno, produzione: somma("produzione"), risparmio: somma("risparmio"), ricavi: somma("ricavi"), pagamenti: somma("pagamenti"), gestione: somma("gestione"), beneficioFiscale: somma("beneficioFiscale"), ivaNetta: euro(somma("ivaPagata") - somma("ivaRecuperata")), flusso: somma("flusso"), cumulato: rows.at(-1)?.cumulato ?? 0, quotaAmmortamento: anno === 0 ? 0 : !rental && anno <= p.fiscale.anniAmmortamento ? euro(i.imponibile / p.fiscale.anniAmmortamento) : rental && c?.fine === "acquisto" ? euro((c.acquistoFinale ?? 0) / p.fiscale.anniAmmortamento * Math.max(0, Math.min(12, anno * 12 - durataCanoni, p.fiscale.anniAmmortamento * 12 - Math.max(0, (anno - 1) * 12 - durataCanoni))) / 12) : 0 });
    }
    if (p.fiscale.attivo && ultimo % 12)
        avvisi.push("L’ultimo anno è parziale: il conguaglio fiscale successivo non è incluso.");
    const ivaOltre = Array.from(ivaDaRecuperare.entries()).filter(([mese]) => mese > ultimo).reduce((s, [, v]) => s + v, 0);
    if (ivaOltre > 0)
        avvisi.push(`Recuperi IVA per ${euro(ivaOltre)} € cadono oltre l’orizzonte rappresentato e non sono inclusi nel saldo finale.`);
    return { versione: 1, modo: p.modo, mesi, anni, saldoFinale: mesi.at(-1)!.cumulato, saldoPrimoAnno: mesi[Math.min(12, ultimo)].cumulato, risparmioPrimoAnno: euro(mesi.filter(m => m.mese <= 12).reduce((n, m) => n + m.risparmio, 0)), canonePeriodo: rental?.canonePeriodo ?? null, canoneMensileEquivalente: rental?.equivalenteMensile ?? null, recuperoMesi, totalePagamenti: euro(mesi.reduce((n, m) => n + m.pagamenti, 0)), fineDefinita, costiDaQuotare:!!rental?.tabella.assicurazioneDaQuotare,avvisi };
}
export function firmaEconomia(input: InputEconomiaAzienda) { const ordina = (v: unknown): unknown => Array.isArray(v) ? v.map(ordina) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, ordina(x)])) : v; return JSON.stringify(ordina(input)); }
export function creaSnapshotEconomia(input: InputEconomiaAzienda, ora = new Date().toISOString()): SnapshotEconomiaAzienda { return { versione: 1, creato: ora, firma: firmaEconomia(input), input: JSON.parse(JSON.stringify(input)), risultato: calcolaEconomiaAzienda(input) }; }
export function snapshotEconomiaValido(raw: unknown, input: InputEconomiaAzienda): raw is SnapshotEconomiaAzienda { if (!raw || typeof raw !== "object")
    return false; const r = raw as SnapshotEconomiaAzienda; return r.versione === 1 && r.input?.companyId === input.companyId && r.firma === firmaEconomia(input) && r.firma === firmaEconomia(r.input); }
export function parametriEconomiaIniziali(consumoAnnuale: number, costoEnergia: number): ParametriEconomiaAzienda { return { versione: 1, dataPreventivo: new Date().toLocaleDateString("sv-SE"), dataInizio: new Date().toLocaleDateString("sv-SE"), orizzonteAnni: 25, consumiMensili: Array.from({ length: 12 }, () => Math.max(0, consumoAnnuale) / 12), produzionePesiMensili: Array.from({ length: 12 }, () => 1 / 12), quotaAutoconsumo: .7, costoEnergia: costoEnergia || .25, costiFissiAnnui: 0, prezzoCessione: 0, degrado: .005, inflazioneEnergia: 0, manutenzioneAnnua: 0, assicurazioneAnnua: 0, sostituzioneInverter: 0, annoInverter: 12, ivaRecuperabilePct: 0, ritardoIvaMesi: 3, fiscale: { attivo: false, aliquota: 0, quotaDeducibile: 1, anniAmmortamento: 10, quotaTassabileBenefici: 1, capienzaAnnua: 0 }, anticipoFinanziamentoPct: 0, durataFinanziamentoMesi: 60, rataFinanziamento: null, capitaleOffertaFinanziamento: null, speseFinanziamento: 0, fonteFinanziamento: "", tanFinanziamento: null, tabellaNoleggio: null, durataNoleggioMesi: 60, periodoNoleggioMesi: 3, modo: "cash" }; }

/** Il cambio del committente richiede la riconferma delle ipotesi economiche. */
export function riferimentoClienteEconomia(d:{cliente_id?:string|null;cliente_ragione_sociale?:string|null;cliente_partita_iva?:string|null;cliente_codice_fiscale?:string|null;cliente_nome?:string|null;cliente_cognome?:string|null}){return JSON.stringify([d.cliente_id,d.cliente_ragione_sociale,d.cliente_partita_iva,d.cliente_codice_fiscale,d.cliente_nome,d.cliente_cognome].map(v=>(v??"").trim().toUpperCase()));}
