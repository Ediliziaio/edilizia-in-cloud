import { corsHeaders, getCorsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);

    const body = await req.json();
    const {
      company_id,
      periodo_mesi = 12,
      domanda,
    }: {
      company_id: string;
      periodo_mesi?: number;
      domanda?: string;
    } = body;

    if (!company_id) return errorResponse("company_id obbligatorio", 400);

    // Validate the caller has access to this company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const isSuperAdmin = roleRow?.role === "super_admin";
    if (!isSuperAdmin && profile?.company_id !== company_id) {
      return errorResponse("Accesso negato a questa azienda", 403);
    }

    // Calculate date cutoff using proper month arithmetic
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - periodo_mesi);
    const cutoffDate = cutoff.toISOString();

    // Query preventivi from view
    const { data: preventivi, error: prevErr } = await supabaseAdmin
      .from("v_preventivo_analisi")
      .select("*")
      .eq("company_id", company_id)
      .in("status", ["accettata", "firmato", "vinto"])
      .gte("created_at", cutoffDate);

    if (prevErr) throw new Error(`Preventivi query error: ${prevErr.message}`);

    // Query prodotti top/bottom — two-step to avoid unsupported PostgREST join filters
    const { data: acceptedQuotes } = await supabaseAdmin
      .from("quotes")
      .select("id")
      .eq("company_id", company_id)
      .in("status", ["accettata", "firmato"])
      .gte("created_at", cutoffDate);

    const quoteIds = (acceptedQuotes ?? []).map((q: any) => q.id as string);

    let prodottiStats: any[] | null = null;
    if (quoteIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("quote_items")
        .select("name, item_category, prezzo_acquisto, quantity, unit_price, discount_percent, article_template_id")
        .in("quote_id", quoteIds)
        .not("article_template_id", "is", null)
        .limit(200);
      prodottiStats = data;
    }

    // Compute statistics
    const totalPreventivi = preventivi?.length ?? 0;

    const ricavoTotale = (preventivi ?? []).reduce(
      (sum: number, p: any) => sum + (p.ricavo_totale ?? 0),
      0
    );

    const marginiValidi = (preventivi ?? [])
      .map((p: any) => p.margine_pct)
      .filter((m: any) => m !== null && m !== undefined && !isNaN(m));

    // Compute actual median (not mean) to avoid outlier distortion
    const margineMediano = (() => {
      if (marginiValidi.length === 0) return 0;
      const sorted = [...marginiValidi].sort((a: number, b: number) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    })();

    const valoreMediano = totalPreventivi > 0 ? ricavoTotale / totalPreventivi : 0;

    // Format preventivi for Claude
    const preventiviFormatted = (preventivi ?? [])
      .slice(0, 20)
      .map(
        (p: any) =>
          `- ${p.quote_number ?? "N/A"} | ${p.cliente_nome ?? "Cliente"} | €${(p.ricavo_totale ?? 0).toFixed(0)} | Margine:${p.margine_pct != null ? Number(p.margine_pct).toFixed(1) + "%" : "N/D"} | ${p.status} | ${p.created_at?.slice(0, 10) ?? "—"}`
      )
      .join("\n");

    // Group prodottiStats by name and compute rough margin
    const prodottiMap = new Map<
      string,
      { revenue: number; cost: number; qty: number }
    >();

    for (const item of prodottiStats ?? []) {
      const key = (item as any).name ?? "Sconosciuto";
      const existing = prodottiMap.get(key) ?? { revenue: 0, cost: 0, qty: 0 };
      const qty = (item as any).quantity ?? 0;
      const up = (item as any).unit_price ?? 0;
      const disc = (item as any).discount_percent ?? 0;
      const pa = (item as any).prezzo_acquisto ?? 0;
      existing.revenue += qty * up * (1 - disc / 100);
      existing.cost += qty * pa;
      existing.qty += qty;
      prodottiMap.set(key, existing);
    }

    const prodottiFormatted = Array.from(prodottiMap.entries())
      .map(([name, stats]) => {
        const margin =
          stats.revenue > 0
            ? (((stats.revenue - stats.cost) / stats.revenue) * 100).toFixed(1)
            : "N/D";
        return `- ${name}: ricavo €${stats.revenue.toFixed(0)}, margine ${margin}%, qty ${stats.qty.toFixed(0)}`;
      })
      .join("\n");

    // Call Claude API
    const userMessage = domanda
      ? `${domanda}\n\nDATA PREVENTIVI (ultimi ${periodo_mesi} mesi):\n${preventiviFormatted}\n\nSTATISTICHE:\nPreventivi analizzati: ${totalPreventivi}\nRicavo totale: €${ricavoTotale.toFixed(0)}\nMargine medio: ${margineMediano.toFixed(1)}%\nValore medio preventivo: €${valoreMediano.toFixed(0)}`
      : `Analizza questi dati preventivi degli ultimi ${periodo_mesi} mesi e rispondi a: 1) Quali prodotti mi fanno guadagnare di più? 2) Dove sto perdendo margine? 3) Cosa dovrei smettere di vendere? 4) Cosa dovrei spingere di più? 5) C'è qualcosa di anomalo?\n\nDATA PREVENTIVI:\n${preventiviFormatted}\n\nSTATISTICHE:\nPreventivi analizzati: ${totalPreventivi}\nRicavo totale: €${ricavoTotale.toFixed(0)}\nMargine medio: ${margineMediano.toFixed(1)}%\nValore medio: €${valoreMediano.toFixed(0)}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1500,
        system:
          "Sei un CFO esperto di imprese edili italiane. Analizza i dati forniti e dai insights actionable concreti. Rispondi in italiano, sii diretto e specifico. Evita generalità. Usa paragrafi brevi con titoli in grassetto.",
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const claudeText: string | undefined = claudeData?.content?.[0]?.text;
    if (!claudeText) {
      throw new Error("Claude ha restituito una risposta vuota o malformata");
    }

    return jsonResponse({
      analisi: claudeText as string,
      dati: {
        totalPreventivi,
        ricavoTotale,
        margineMediano,
        valoreMediano,
        preventivi: preventivi?.slice(0, 30),
      },
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err));
  }
});
