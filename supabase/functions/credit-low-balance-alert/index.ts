/**
 * credit-low-balance-alert — avviso email "saldo crediti in esaurimento".
 *
 * Cron giornaliero: per ogni azienda controlla i 4 wallet (ai/email/whatsapp
 * in EUR, render a conteggio) e quando un saldo scende sotto soglia manda UNA
 * email al titolare (companies.email) con l'elenco dei wallet bassi, link
 * alla pagina ricariche e invito ad attivare l'auto-ricarica.
 *
 * Regole anti-spam:
 *  - si avvisa solo chi il servizio lo USA davvero (ha ricaricato/consumato);
 *  - se l'auto-ricarica è attiva per quel wallet, nessun avviso (ci pensa lei);
 *  - dedup su credit_low_balance_alerts: re-alert solo dopo 7 giorni; quando
 *    il saldo risale sopra soglia la riga viene eliminata (reset).
 *
 * Auth: service-role bearer oppure x-cron-secret (PROACTIVE_CRON_SECRET),
 * stesso pattern di outreach-dispatch. Body { dry_run: true } per provare
 * senza inviare nulla e senza toccare il dedup.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { loadProviderSettings, sendViaProviderWithFailover } from "../_shared/emailProvider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";

const APP_URL = "https://admin.ediliziaincloud.com";
const CREDITS_PATH = "/azienda/impostazioni/crediti";
const DEFAULT_THRESHOLD_EUR = 5;
const RENDER_THRESHOLD = 3; // stesso warnBelow del RenderCreditGate
const REALERT_DAYS = 7;

type WalletType = "ai" | "email" | "whatsapp" | "render";

interface LowWallet {
  wallet: WalletType;
  label: string;
  balanceText: string;
  thresholdText: string;
  balance: number;
  threshold: number;
}

const WALLET_LABELS: Record<WalletType, string> = {
  ai: "Agenti AI",
  email: "Email marketing",
  whatsapp: "WhatsApp",
  render: "Render AI",
};

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

function buildEmailHtml(companyName: string, lows: LowWallet[]): string {
  const rows = lows
    .map(
      (l) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:600;">${l.label}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#dc2626;font-weight:700;">${l.balanceText}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#6b7280;">soglia ${l.thresholdText}</td>
        </tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="it"><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0d1828;border-radius:14px 14px 0 0;padding:20px 24px;">
      <span style="color:#fff;font-size:17px;font-weight:800;">Edilizia<span style="color:#F97415;">InCloud</span></span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:28px 24px;">
      <h1 style="margin:0 0 6px;font-size:19px;color:#111;">Crediti in esaurimento</h1>
      <p style="margin:0 0 18px;font-size:14px;color:#4b5563;line-height:1.6;">
        Ciao${companyName ? ` <strong>${companyName}</strong>` : ""}, il saldo di uno o più wallet della tua azienda
        è sceso sotto la soglia: quando arriva a zero le funzioni collegate si fermano
        (invii, generazioni, risposte AI).
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 22px;">
        ${rows}
      </table>
      <a href="${APP_URL}${CREDITS_PATH}"
         style="display:inline-block;background:#F97415;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">
        Ricarica ora
      </a>
      <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        Per non pensarci più, dalla stessa pagina puoi attivare l'<strong>auto-ricarica</strong>:
        quando il saldo scende sotto la soglia, ricarichiamo automaticamente con la carta salvata.
      </p>
    </div>
    <p style="margin:14px 4px 0;font-size:11px;color:#9ca3af;text-align:center;">
      Avviso automatico di servizio · Edilizia in Cloud
    </p>
  </div>
</body></html>`;
}

function json(payload: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized =
    (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) return json({ error: "Unauthorized" }, 401, req);

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // ── 1. Config auto-topup (soglie custom + wallet da saltare) ─────────
    const { data: topupCfg } = await supabase
      .from("company_auto_topup")
      .select("company_id, wallet_type, enabled, threshold_eur");
    const cfgKey = (c: string, w: string) => `${c}:${w}`;
    const cfgMap = new Map<string, { enabled: boolean; threshold: number }>();
    for (const c of (topupCfg ?? []) as any[]) {
      cfgMap.set(cfgKey(c.company_id, c.wallet_type), {
        enabled: c.enabled === true,
        threshold: Number(c.threshold_eur ?? DEFAULT_THRESHOLD_EUR),
      });
    }

    // ── 2. Wallet EUR + render: candidati sotto soglia ───────────────────
    const lowByCompany = new Map<string, LowWallet[]>();
    const overThreshold: Array<{ company_id: string; wallet: WalletType }> = [];
    const pushLow = (companyId: string, lw: LowWallet) => {
      const arr = lowByCompany.get(companyId) ?? [];
      arr.push(lw);
      lowByCompany.set(companyId, arr);
    };

    const eurWallets: Array<{ table: string; wallet: WalletType }> = [
      { table: "ai_credits", wallet: "ai" },
      { table: "email_credits", wallet: "email" },
      { table: "whatsapp_credits", wallet: "whatsapp" },
    ];
    for (const { table, wallet } of eurWallets) {
      const { data } = await supabase
        .from(table)
        .select("company_id, balance_eur, total_recharged_eur");
      for (const row of (data ?? []) as any[]) {
        // Solo chi il servizio lo usa: ha ricaricato almeno una volta.
        if (Number(row.total_recharged_eur ?? 0) <= 0) continue;
        const cfg = cfgMap.get(cfgKey(row.company_id, wallet));
        if (cfg?.enabled) continue; // auto-ricarica attiva: ci pensa lei
        const threshold = cfg?.threshold ?? DEFAULT_THRESHOLD_EUR;
        const balance = Number(row.balance_eur ?? 0);
        if (balance < threshold) {
          pushLow(row.company_id, {
            wallet,
            label: WALLET_LABELS[wallet],
            balance,
            threshold,
            balanceText: eur(balance),
            thresholdText: eur(threshold),
          });
        } else {
          overThreshold.push({ company_id: row.company_id, wallet });
        }
      }
    }

    {
      const { data } = await supabase
        .from("render_credits")
        .select("company_id, balance, total_purchased");
      for (const row of (data ?? []) as any[]) {
        if (Number(row.total_purchased ?? 0) <= 0) continue;
        const balance = Number(row.balance ?? 0);
        if (balance < RENDER_THRESHOLD) {
          pushLow(row.company_id, {
            wallet: "render",
            label: WALLET_LABELS.render,
            balance,
            threshold: RENDER_THRESHOLD,
            balanceText: `${balance} render`,
            thresholdText: `${RENDER_THRESHOLD} render`,
          });
        } else {
          overThreshold.push({ company_id: row.company_id, wallet: "render" });
        }
      }
    }

    // ── 3. Reset dedup per i wallet risaliti sopra soglia ────────────────
    if (!dryRun) {
      for (const o of overThreshold) {
        await supabase
          .from("credit_low_balance_alerts")
          .delete()
          .eq("company_id", o.company_id)
          .eq("wallet_type", o.wallet);
      }
    }

    if (lowByCompany.size === 0) {
      return json({ ok: true, alerts_sent: 0, dry_run: dryRun, note: "nessun wallet sotto soglia" }, 200, req);
    }

    // ── 4. Dedup: filtra i wallet già avvisati negli ultimi 7 giorni ─────
    const { data: recentAlerts } = await supabase
      .from("credit_low_balance_alerts")
      .select("company_id, wallet_type, alerted_at");
    const recentKey = new Set(
      ((recentAlerts ?? []) as any[])
        .filter((a) => Date.now() - new Date(a.alerted_at).getTime() < REALERT_DAYS * 86_400_000)
        .map((a) => cfgKey(a.company_id, a.wallet_type)),
    );

    // ── 5. Email aziende ─────────────────────────────────────────────────
    const companyIds = [...lowByCompany.keys()];
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, email")
      .in("id", companyIds);
    const companyById = new Map(((companies ?? []) as any[]).map((c) => [c.id, c]));

    const settings = await loadProviderSettings("transactional");
    let sent = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const [companyId, lowsAll] of lowByCompany) {
      const lows = lowsAll.filter((l) => !recentKey.has(cfgKey(companyId, l.wallet)));
      if (lows.length === 0) continue;

      const company = companyById.get(companyId);
      const recipient = (company?.email || "").trim();
      const detail = {
        company_id: companyId,
        company: company?.name ?? null,
        recipient: recipient || null,
        wallets: lows.map((l) => `${l.wallet}:${l.balanceText}`),
      };

      if (!recipient) {
        details.push({ ...detail, skipped: "nessuna email aziendale" });
        continue;
      }
      if (dryRun) {
        details.push({ ...detail, dry_run: true });
        continue;
      }

      const html = buildEmailHtml(company?.name ?? "", lows);
      const res = await sendViaProviderWithFailover("transactional", settings, {
        from: settings.fromDefault,
        to: [recipient],
        subject: `Crediti in esaurimento — ${lows.map((l) => l.label).join(", ")}`,
        html,
      });

      if (res.ok) {
        sent++;
        for (const l of lows) {
          await supabase.from("credit_low_balance_alerts").upsert(
            {
              company_id: companyId,
              wallet_type: l.wallet,
              alerted_at: new Date().toISOString(),
              balance_at_alert: l.balance,
              threshold_at_alert: l.threshold,
            },
            { onConflict: "company_id,wallet_type" },
          );
        }
        details.push({ ...detail, sent: true, provider: res.providerUsed });
      } else {
        details.push({ ...detail, sent: false, error: `provider ${res.status}` });
      }
    }

    return json({ ok: true, alerts_sent: sent, dry_run: dryRun, details }, 200, req);
  } catch (err) {
    console.error("[credit-low-balance-alert] error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, req);
  }
});
