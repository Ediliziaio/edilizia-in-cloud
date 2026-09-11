/**
 * Il rapporto del mattino sui clienti marketing: per ogni cliente attivo i
 * lead di ieri e del mese, i fermi, la spesa e il CPL, la provvigione che
 * matura, e in cima la lista di cosa fare oggi (lead fermi, Meta scaduto,
 * niente lead da giorni, costi mancanti, promemoria scaduti).
 *
 * I numeri sono gli stessi della console (admin_clienti_marketing_riepilogo,
 * chiamata col ruolo di servizio); le regole degli avvisi sono la copia di
 * leggiMese in src/components/admin/clienti-marketing/provvigioni.ts — se
 * cambiano lì, cambiano anche qui.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Riga {
  service_client_id: string;
  cliente_nome: string;
  stato: string;
  provvigione_scaglioni: unknown;
  lead_mese: number;
  lead_prec: number;
  lead_meta: number;
  lead_non_gestiti: number;
  appuntamenti_mese: number;
  vinte_mese: number;
  valore_vinto_mese: number;
  fatturato_mese: number | null;
  fatture_collegate: boolean;
  spesa_meta: number;
  lead_meta_dichiarati: number;
  spesa_google: number;
  spesa_manuale: number;
  meta_stato: string | null;
  meta_account_id: string | null;
  utenti: number;
  ultimo_accesso: string | null;
  lead_giorni: number[];
  giorni_senza_lead: number | null;
  promemoria_scaduti: number;
  prossimo_promemoria: { titolo: string; scadenza: string | null } | null;
}

interface Scaglione { da: number; a: number | null; pct: number }

const n = (v: unknown) => Number(v ?? 0) || 0;
const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(v || 0));
const eur2 = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v);
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch));

function scaglioni(raw: unknown): Scaglione[] {
  if (!Array.isArray(raw)) return [];
  const out: Scaglione[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    const da = Number(r?.da), pct = Number(r?.pct);
    const a = r?.a == null || r?.a === "" ? null : Number(r.a);
    if (!Number.isFinite(da) || da < 0 || !Number.isFinite(pct) || pct < 0) continue;
    if (a != null && (!Number.isFinite(a) || a <= da)) continue;
    out.push({ da, a, pct });
  }
  return out.sort((x, y) => x.da - y.da);
}

function provvigione(base: number, s: Scaglione[]): number {
  const b = Math.max(0, base);
  let tot = 0;
  for (const x of s) tot += (Math.max(0, Math.min(b, x.a ?? Infinity) - x.da) * x.pct) / 100;
  return Math.round(tot * 100) / 100;
}

/** Primo giorno del mese e data di oggi, ora di Roma. */
export function meseDiOggi(adesso = new Date()): { mese: string; oggi: string } {
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(adesso);
  return { mese: `${oggi.slice(0, 7)}-01`, oggi };
}

interface Voce { cliente: string; grave: boolean; testo: string }

function avvisi(c: Riga, oggi: string): Voce[] {
  const out: Voce[] = [];
  const spesa = n(c.spesa_meta) + n(c.spesa_google) + n(c.spesa_manuale);
  const push = (grave: boolean, testo: string) => out.push({ cliente: c.cliente_nome, grave, testo });
  if (n(c.lead_non_gestiti) > 0) push(n(c.lead_non_gestiti) >= 5, `${n(c.lead_non_gestiti)} lead del mese fermi da più di 2 giorni senza nessuna azione`);
  if (c.meta_stato === "token_expired") push(true, "Collegamento Meta scaduto: va ricollegato");
  else if (!c.meta_stato) push(false, "Meta non collegato: niente costi né lead dalle inserzioni");
  else if (!c.meta_account_id) push(false, "Nessun account pubblicitario scelto su Meta");
  if (c.giorni_senza_lead != null && c.giorni_senza_lead >= 3) push(c.giorni_senza_lead >= 5, `Nessun lead da ${c.giorni_senza_lead} giorni`);
  else if (n(c.lead_mese) === 0) push(true, "Nessun lead questo mese");
  if (n(c.lead_mese) > 0 && spesa === 0) push(false, "Costi del mese non ancora caricati: CPL e CPA restano vuoti");
  if (n(c.lead_meta_dichiarati) > 0 && n(c.lead_meta) < n(c.lead_meta_dichiarati) * 0.8) {
    push(true, `Meta conta ${n(c.lead_meta_dichiarati)} lead, nel CRM ne sono arrivati ${n(c.lead_meta)}: controlla il collegamento dei moduli`);
  }
  if (n(c.utenti) > 0 && !c.ultimo_accesso) push(false, "Nessun utente del cliente è mai entrato nel gestionale");
  if (!c.fatture_collegate && n(c.valore_vinto_mese) === 0) push(false, "Fatture non collegate: il venduto va inserito a mano alla chiusura del mese");
  if (n(c.promemoria_scaduti) > 0) push(false, n(c.promemoria_scaduti) === 1 ? "1 promemoria scaduto" : `${n(c.promemoria_scaduti)} promemoria scaduti`);
  if (c.prossimo_promemoria?.scadenza === oggi) push(false, `Promemoria di oggi: ${c.prossimo_promemoria.titolo}`);
  return out;
}

export async function rapportoClientiMarketing(supabase: SupabaseClient, urlConsole: string): Promise<{ subject: string; html: string; cose: number; clienti: number }> {
  const { mese, oggi } = meseDiOggi();
  const { data, error } = await supabase.rpc("admin_clienti_marketing_riepilogo", { p_mese: mese });
  if (error) throw new Error(`riepilogo clienti marketing: ${error.message}`);
  const righe = ((data ?? []) as Riga[]).filter((r) => r.stato === "attivo");
  const meseLeggibile = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${mese}T12:00:00`));

  const voci: Voce[] = [];
  const tabella = righe.map((c) => {
    const ieri = Array.isArray(c.lead_giorni) && c.lead_giorni.length >= 2 ? n(c.lead_giorni[c.lead_giorni.length - 2]) : 0;
    const spesa = n(c.spesa_meta) + n(c.spesa_google) + n(c.spesa_manuale);
    const cpl = n(c.lead_mese) > 0 && spesa > 0 ? spesa / n(c.lead_mese) : null;
    const fatt = c.fatturato_mese == null ? null : n(c.fatturato_mese);
    const venduto = c.fatture_collegate && fatt != null ? Math.max(0, fatt) : n(c.valore_vinto_mese);
    const prov = provvigione(venduto, scaglioni(c.provvigione_scaglioni));
    const proprie = avvisi(c, oggi);
    voci.push(...proprie);
    const gravi = proprie.filter((v) => v.grave).length;
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;"><strong>${esc(c.cliente_nome)}</strong>${gravi ? ` <span style="color:#b91c1c;">●${gravi}</span>` : ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${ieri}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${n(c.lead_mese)}<span style="color:#6b7280;"> / ${n(c.lead_prec)}</span></td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;${n(c.lead_non_gestiti) > 0 ? "color:#b91c1c;font-weight:600;" : ""}">${n(c.lead_non_gestiti)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${n(c.appuntamenti_mese)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${n(c.vinte_mese)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${eur(spesa)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${cpl == null ? "—" : eur2(Math.round(cpl * 100) / 100)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${prov > 0 ? eur(prov) : "—"}</td>
    </tr>`;
  });

  voci.sort((x, y) => Number(y.grave) - Number(x.grave) || x.cliente.localeCompare(y.cliente));
  const gravi = voci.filter((v) => v.grave).length;
  const subject = voci.length === 0
    ? "Clienti marketing — niente da fare oggi"
    : `Clienti marketing — ${voci.length} ${voci.length === 1 ? "cosa" : "cose"} da fare oggi${gravi ? ` (${gravi} ${gravi === 1 ? "grave" : "gravi"})` : ""}`;

  const th = (t: string, dx = true) => `<th style="padding:6px 8px;border-bottom:2px solid #d1d5db;text-align:${dx ? "right" : "left"};font-size:11px;text-transform:uppercase;color:#6b7280;">${t}</th>`;
  const html = `<div style="max-width:720px;margin:0 auto;padding:24px;font-family:sans-serif;color:#374151;font-size:13px;">
    <h2 style="font-size:18px;color:#111827;margin:0 0 4px;">${esc(subject)}</h2>
    <p style="margin:0 0 16px;color:#6b7280;">${righe.length} clienti attivi · ${esc(meseLeggibile)} · <a href="${esc(urlConsole)}" style="color:#2563eb;">apri la console</a></p>
    ${voci.length === 0 ? `<p style="color:#047857;">Nessun avviso sui clienti attivi.</p>` : `<ul style="margin:0 0 20px;padding-left:18px;">${
      voci.map((v) => `<li style="margin:4px 0;${v.grave ? "color:#b91c1c;" : ""}"><strong>${esc(v.cliente)}</strong> — ${esc(v.testo)}</li>`).join("")
    }</ul>`}
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>${th("Cliente", false)}${th("Lead ieri")}${th("Lead mese / prima")}${th("Fermi")}${th("App.")}${th("Vendite")}${th("Spesa")}${th("CPL")}${th("Provvigione")}</tr></thead>
      <tbody>${tabella.join("")}</tbody>
    </table>
    <p style="font-size:11px;color:#9ca3af;margin-top:24px;">Ogni mattina alle 08:00. La spesa Meta è quella scaricata di notte; CPL = spesa / lead del mese; la provvigione è stimata sul venduto del mese a oggi.</p>
  </div>`;

  return { subject, html, cose: voci.length, clienti: righe.length };
}
