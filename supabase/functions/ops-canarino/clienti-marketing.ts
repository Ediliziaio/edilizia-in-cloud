/**
 * Il rapporto del mattino dei clienti marketing (manuale, Parte 12).
 *
 * I numeri li prepara il database (mkt_rapporto_mattino: metriche del giorno,
 * semafori, allarmi del motore di regole, denaro, silenzi). Qui si decide solo
 * la forma: prima i numeri di ieri cliente per cliente — è quello che il
 * titolare vuole leggere ogni giorno — poi le cose da fare (massimo cinque,
 * ognuna con un verbo e una scadenza), poi da guardare, denaro e silenzi.
 * Testo semplice, una colonna: si legge dal telefono in dieci secondi.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Cliente {
  service_client_id: string;
  cliente_nome: string;
  classe: string | null;
  stato_cliente: string;
  semaforo: string | null;
  semaforo_componenti: Record<string, string> | null;
  lead_grezzi_giorno: number;
  media_lead_7g: number | null;
  lead_grezzi_7g: number;
  lead_validi_7g: number;
  spesa_giorno: number;
  spesa_7g: number;
  spesa_mese: number;
  budget: number | null;
  copertura_budget: number | null;
  cpl_valido_7g: number | null;
  cpl_target: number | null;
  cpl_giallo: number | null;
  cpl_rosso: number | null;
  fattore_stagionale: number | null;
  lead_fermi: number;
  lead_fermo_piu_vecchio_ore: number;
  mediana_primo_contatto_min_7g: number | null;
  appuntamenti_14g: number;
  costo_appuntamento_14g: number | null;
  vendite_mese: number;
  venduto_base: number;
  provvigione_mese: number;
  indice_esecuzione: number | null;
  giorni_dall_ultimo_accesso: number | null;
  dati_freschi: boolean;
  spesa_disponibile: boolean;
  rapporto_zero: number | null;
}

interface Azione {
  id: string;
  service_client_id: string;
  cliente_nome: string;
  regola: string;
  gravita: string;
  titolo: string;
  azione: string;
  proprietario: string;
  scadenza: string | null;
}

interface Rapporto {
  giorno: string;
  stato: { attivi: number; verdi: number; gialli: number; rossi: number; non_leggibili: number; aggiornato_alle: string | null; dati_vecchi: Array<{ cliente: string; fermo_dalle: string | null }> };
  clienti: Cliente[];
  azioni: Azione[];
  da_guardare: Azione[];
  altri_allarmi: number;
  ieri: { lead: number; media_7g: number; spesa: number; vendite_registrate: number; valore_vendite: number };
  denaro: { provvigioni_mese: number; fatture_scadute: Array<{ cliente: string; importo: number; scaduta_da_giorni: number }> };
  silenzi: Array<{ cliente: string; giorni_senza_lead: number | null; giorni_senza_accesso: number | null }>;
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const eur = (v: number | null | undefined, dec = 0) => v == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: dec }).format(v);
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch));
const oraRoma = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
const giornoRoma = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

const PALLINO: Record<string, string> = { R: "🔴", G: "🟡", V: "🟢", N: "⚪" };
const GRAVITA: Record<string, string> = { grave: "🔴", rosso: "🔴", giallo: "🟡", nota: "ℹ️" };

function ore(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 48 * 60) return `${(Math.round(min / 6) / 10).toLocaleString("it-IT")} h`;
  return `${Math.round(min / 60 / 24)} giorni`;
}

/** Primo giorno del mese e data di oggi, ora di Roma. */
export function meseDiOggi(adesso = new Date()): { mese: string; oggi: string } {
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(adesso);
  return { mese: `${oggi.slice(0, 7)}-01`, oggi };
}

/** L'ora di Roma di adesso (0-23): serve a tenere solo il cron delle 06:00. */
export function oraDiRoma(adesso = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(adesso));
}

const td = (s: string, dx = false, stile = "") => `<td style="padding:5px 6px;border-bottom:1px solid #e5e7eb;white-space:nowrap;text-align:${dx ? "right" : "left"};${stile}">${s}</td>`;
const th = (s: string, dx = false) => `<th style="padding:5px 6px;border-bottom:2px solid #d1d5db;text-align:${dx ? "right" : "left"};font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;font-weight:600;">${s}</th>`;

function rigaCliente(c: Cliente): string {
  const attivo = c.stato_cliente === "attivo";
  const cplStile = c.cpl_valido_7g == null || c.cpl_target == null ? ""
    : c.cpl_rosso != null && c.cpl_valido_7g > c.cpl_rosso ? "color:#b91c1c;font-weight:600;"
    : c.cpl_valido_7g > c.cpl_target ? "color:#b45309;font-weight:600;" : "color:#047857;";
  const media = c.media_lead_7g == null ? "" : `<span style="color:#6b7280;"> (media ${c.media_lead_7g.toLocaleString("it-IT")})</span>`;
  const cpl = c.cpl_valido_7g == null
    ? (c.spesa_disponibile ? "—" : `<span style="color:#9ca3af;">senza spesa</span>`)
    : `${eur(c.cpl_valido_7g, 2)}<span style="color:#6b7280;"> / ${eur(c.cpl_target, 0)}</span>`;
  const fermi = c.lead_fermi > 0 ? `<span style="color:#b91c1c;font-weight:600;">${c.lead_fermi}</span><span style="color:#6b7280;"> (${Math.round(c.lead_fermo_piu_vecchio_ore)} h)</span>` : "0";
  return `<tr style="${attivo ? "" : "color:#9ca3af;"}">
    ${td(`${PALLINO[c.semaforo ?? "N"] ?? "⚪"} <strong>${esc(c.cliente_nome)}</strong>${attivo ? "" : " <span style=\"font-size:10px;\">(in pausa)</span>"}`)}
    ${td(`${n(c.lead_grezzi_giorno)}${media}`, true)}
    ${td(c.spesa_disponibile ? eur(c.spesa_giorno) : `<span style="color:#9ca3af;">—</span>`, true)}
    ${td(cpl, true, cplStile)}
    ${td(fermi, true)}
    ${td(String(n(c.appuntamenti_14g)), true)}
    ${td(`${n(c.vendite_mese)}<span style="color:#6b7280;"> · ${eur(c.venduto_base)}</span>`, true)}
    ${td(eur(c.provvigione_mese), true)}
    ${td(c.indice_esecuzione == null ? "—" : String(c.indice_esecuzione), true, c.indice_esecuzione != null && c.indice_esecuzione < 50 ? "color:#b91c1c;" : "")}
  </tr>`;
}

function rigaAzione(a: Azione, urlConsole: string): string {
  const scad = a.scadenza ? `entro ${giornoRoma(a.scadenza)}` : "senza scadenza";
  return `<div style="margin:0 0 12px;padding:10px 12px;border-left:4px solid ${a.gravita === "giallo" ? "#f59e0b" : a.gravita === "nota" ? "#9ca3af" : "#dc2626"};background:#f9fafb;border-radius:0 6px 6px 0;">
    <div style="font-size:13px;"><strong>${GRAVITA[a.gravita] ?? ""} ${esc(a.cliente_nome)}</strong> — ${esc(a.titolo)}</div>
    <div style="font-size:13px;margin-top:4px;">→ ${esc(a.azione)}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:4px;">${a.regola} · ${scad} · chi: ${a.proprietario === "noi" ? "tu" : a.proprietario} · <a href="${esc(urlConsole)}" style="color:#2563eb;">apri la scheda</a></div>
  </div>`;
}

export async function rapportoClientiMarketing(supabase: SupabaseClient, urlConsole: string): Promise<{ subject: string; html: string; cose: number; clienti: number }> {
  let { data, error } = await supabase.rpc("mkt_rapporto_mattino");
  if (error) throw new Error(`mkt_rapporto_mattino: ${error.message}`);
  let r = data as Rapporto;
  // Il primo giorno, o se il cron delle 05:30 non è passato: si calcola adesso.
  if (!r || !Array.isArray(r.clienti) || r.clienti.length === 0) {
    const agg = await supabase.rpc("mkt_aggiorna");
    if (agg.error) throw new Error(`mkt_aggiorna: ${agg.error.message}`);
    ({ data, error } = await supabase.rpc("mkt_rapporto_mattino"));
    if (error) throw new Error(`mkt_rapporto_mattino: ${error.message}`);
    r = data as Rapporto;
  }

  const attivi = r.clienti.filter((c) => c.stato_cliente === "attivo");
  const azioni = r.azioni ?? [];
  const daGuardare = r.da_guardare ?? [];
  const subject = azioni.length === 0
    ? `Clienti marketing · ${r.stato.rossi} rossi, ${r.stato.gialli} gialli · niente da fare oggi`
    : `Clienti marketing · ${r.stato.rossi} rossi, ${r.stato.gialli} gialli · ${azioni.length} ${azioni.length === 1 ? "cosa" : "cose"} da fare`;

  const datiVecchi = r.stato.dati_vecchi?.length
    ? `<p style="margin:0 0 12px;padding:8px 10px;background:#fef3c7;color:#92400e;border-radius:6px;font-size:13px;">Attenzione: la spesa di ${r.stato.dati_vecchi.map((d) => esc(d.cliente)).join(", ")} è ferma dalle ${r.stato.dati_vecchi.map((d) => oraRoma(d.fermo_dalle)).join(", ")}. Per questi clienti gli allarmi su costo e richieste sono sospesi.</p>`
    : "";
  const senzaSpesa = attivi.filter((c) => !c.spesa_disponibile).length;

  const html = `<div style="max-width:760px;margin:0 auto;padding:20px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#374151;font-size:13px;">
    <h2 style="font-size:17px;color:#111827;margin:0 0 4px;">${esc(subject)}</h2>
    <p style="margin:0 0 14px;color:#6b7280;">${r.stato.attivi} clienti attivi · ${r.stato.verdi} verdi · ${r.stato.gialli} gialli · ${r.stato.rossi} rossi${r.stato.non_leggibili ? ` · ${r.stato.non_leggibili} senza dati` : ""} · dati aggiornati alle ${oraRoma(r.stato.aggiornato_alle)} · <a href="${esc(urlConsole)}" style="color:#2563eb;">apri la console</a></p>
    ${datiVecchi}

    <h3 style="font-size:13px;color:#111827;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;">I numeri di ieri, cliente per cliente</h3>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>${th("Cliente")}${th("Richieste ieri", true)}${th("Spesa ieri", true)}${th("Costo richiesta 7g / target", true)}${th("Ferme", true)}${th("Sopralluoghi 14g", true)}${th("Contratti mese", true)}${th("Provvigione", true)}${th("Indice", true)}</tr></thead>
      <tbody>${r.clienti.map(rigaCliente).join("")}</tbody>
    </table>
    </div>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">Costo per richiesta sui 7 giorni (finestra chiusa ieri) contro il target del mese, già adattato alla stagione. Ferme = richieste senza nessuna azione da più di 24 ore di servizio (fra parentesi la più vecchia). Indice = Indice di Esecuzione del cliente, 0-100.${senzaSpesa ? ` ${senzaSpesa} client${senzaSpesa === 1 ? "e" : "i"} senza spesa registrata: il costo per richiesta arriva dal sync Meta.` : ""}</p>

    <h3 style="font-size:13px;color:#111827;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;">Ieri in tre numeri</h3>
    <p style="margin:0;"><strong>${n(r.ieri.lead)}</strong> richieste (media 7 giorni: ${n(r.ieri.media_7g).toLocaleString("it-IT")}) · <strong>${eur(n(r.ieri.spesa))}</strong> di spesa · <strong>${n(r.ieri.vendite_registrate)}</strong> contratti registrati${n(r.ieri.valore_vendite) > 0 ? ` per ${eur(n(r.ieri.valore_vendite))}` : ""}</p>

    <h3 style="font-size:13px;color:#111827;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.04em;">Cosa fare oggi${azioni.length ? ` (${azioni.length})` : ""}</h3>
    ${azioni.length === 0 ? `<p style="margin:0;color:#047857;">Niente: nessun allarme aperto sui clienti attivi.</p>` : azioni.map((a) => rigaAzione(a, urlConsole)).join("")}

    ${daGuardare.length ? `<h3 style="font-size:13px;color:#111827;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;">Da guardare (${daGuardare.length})</h3>
    <ul style="margin:0;padding-left:18px;">${daGuardare.map((a) => `<li style="margin:3px 0;"><strong>${esc(a.cliente_nome)}</strong> — ${esc(a.titolo)} <span style="color:#6b7280;">(${a.regola})</span></li>`).join("")}</ul>` : ""}
    ${r.altri_allarmi ? `<p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">Altri ${r.altri_allarmi} allarmi registrati e non mostrati (campione insufficiente, tetto di cinque, rimandati).</p>` : ""}

    <h3 style="font-size:13px;color:#111827;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;">Denaro</h3>
    <p style="margin:0;">Provvigioni maturate questo mese: <strong>${eur(n(r.denaro.provvigioni_mese))}</strong>${r.denaro.fatture_scadute?.length
      ? `<br>Fatture scadute: ${r.denaro.fatture_scadute.map((f) => `<strong>${esc(f.cliente)}</strong> ${eur(n(f.importo))}, scaduta da ${f.scaduta_da_giorni} giorni`).join(" · ")}`
      : "<br>Nessuna fattura scaduta."}</p>

    ${r.silenzi?.length ? `<h3 style="font-size:13px;color:#111827;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;">Silenzi</h3>
    <ul style="margin:0;padding-left:18px;">${r.silenzi.map((s) => `<li style="margin:3px 0;"><strong>${esc(s.cliente)}</strong> — ${s.giorni_senza_lead != null ? `nessuna richiesta da ${s.giorni_senza_lead} giorni` : "mai una richiesta"}${s.giorni_senza_accesso != null ? `, nessun accesso da ${s.giorni_senza_accesso} giorni` : ", mai un accesso"}</li>`).join("")}</ul>` : ""}

    <p style="font-size:11px;color:#9ca3af;margin-top:22px;">Ogni mattina alle 06:00. Le soglie (costo per richiesta, zero richieste, velocità) sono quelle della scheda di ogni cliente: si cambiano dalla console, e dal giorno 91 il sistema le propone dallo storico.</p>
  </div>`;

  return { subject, html, cose: azioni.length, clienti: attivi.length };
}
