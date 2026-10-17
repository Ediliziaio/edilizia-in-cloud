import { getCorsHeaders } from "../_shared/headers.ts";
import { conMetriche } from "../_shared/withMetrics.ts";

Deno.serve(conMetriche("check-login-security", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Chiamabile senza auth (controllo pre-login) o autenticata per la
    // gestione dell'allowlist IP.
    //
    // `action`:
    //   check          (default) → decide se il tentativo può procedere
    //   record_failure           → credenziali errate: registra il tentativo
    //   record_success           → accesso riuscito: azzera contatore e blocco
    //
    // SICUREZZA (audit run-2). Il conteggio dei tentativi falliti NON vive più
    // in un contatore globale su `profiles`: record_failure è un'azione che il
    // client dichiara da sé, senza sessione, e si fida dell'email dal body.
    // Finché incrementava `profiles.failed_login_count`, un anonimo poteva
    // pompare il contatore di un'email qualunque fino alla soglia e far
    // scattare il blocco globale (`locked_until`) della vittima: un DoS di
    // login. Ora il blocco anti-forza-bruta si calcola per (email, IP di
    // provenienza) dai fallimenti VERI già registrati in `login_attempts`, e
    // l'IP lo deduciamo dagli header — non dal client. Chi attacca da fuori
    // riempie solo la casella del PROPRIO IP: la vittima, che entra dal suo,
    // vede un conteggio a zero e non può essere bloccata da terzi. Nessuna
    // scrittura automatica su `profiles`: era quella persistenza globale la
    // leva del DoS.
    const body = await req.json();
    const { email, user_agent } = body;
    const action: string = body.action ?? "check";

    // L'IP lo prendiamo dagli header della richiesta e preferiamo quello che
    // mette l'infrastruttura (cf-connecting-ip): il client non può sceglierlo.
    // Su questo IP si regge la difesa per-origine, quindi niente `body.ip_address`
    // (falsificabile) e niente leftmost di x-forwarded-for come prima scelta.
    const ip_address =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Find user by email
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, first_name")
      .eq("email", email)
      .maybeSingle();

    // ── Registrazione dell'esito di un tentativo ──────────────────────────
    if (action === "record_failure" || action === "record_success") {
      if (!profile) {
        // Email sconosciuta: registriamo il tentativo ma non riveliamo nulla.
        await supabaseAdmin.from("login_attempts").insert([{
          email, ip_address, user_agent: user_agent || null,
          success: false, failure_reason: "unknown_email",
        }]);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      if (action === "record_success") {
        // SECURITY (audit run-1): azzerare failed_login_count e locked_until e'
        // una scrittura sensibile (sblocca l'anti-forza-bruta). Il client chiama
        // record_success SUBITO dopo un login riuscito, quindi porta il JWT della
        // nuova sessione: pretendiamo che sia proprio quell'utente. Senza, un
        // anonimo poteva sbloccare / azzerare il contatore di email arbitrarie.
        const authHeader = req.headers.get("Authorization");
        const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
        const { data: authData } = jwt
          ? await supabaseAdmin.auth.getUser(jwt)
          : { data: { user: null } };
        if (!authData?.user || authData.user.id !== profile.id) {
          return new Response(
            JSON.stringify({ ok: false, error: "unauthorized" }),
            { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
          );
        }
        // Ripuliamo gli eventuali residui del vecchio blocco globale: una volta
        // che l'utente vero è rientrato non deve restargli addosso un
        // `locked_until` lasciato dalla versione precedente.
        await supabaseAdmin
          .from("profiles")
          .update({ failed_login_count: 0, locked_until: null } as any)
          .eq("id", profile.id);
        await supabaseAdmin.from("login_attempts").insert([{
          email, user_id: profile.id, ip_address, user_agent: user_agent || null,
          success: true,
        }]);
      } else {
        // record_failure: NON tocca `profiles`. Lascia solo la traccia del
        // tentativo fallito, con l'IP dedotto dagli header: è questa riga che
        // alimenta il conteggio per-origine del ramo `check`.
        await supabaseAdmin.from("login_attempts").insert([{
          email, user_id: profile.id, ip_address, user_agent: user_agent || null,
          success: false, failure_reason: "invalid_credentials",
        }]);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (!profile) {
      // Log failed attempt for unknown email
      await supabaseAdmin.from("login_attempts").insert([{
        email,
        ip_address,
        user_agent: user_agent || null,
        success: false,
        failure_reason: "unknown_email",
      }]);

      return new Response(
        JSON.stringify({ allowed: false, reason: "unknown_email" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Check IP allowlist if company has one configured
    let company: { allowed_ips: string[] | null; max_failed_attempts: number | null; lockout_duration_minutes: number | null } | null = null;
    if (profile.company_id && ip_address) {
      const { data: companyRow } = await supabaseAdmin
        .from("companies")
        .select("allowed_ips, max_failed_attempts, lockout_duration_minutes")
        .eq("id", profile.company_id)
        .single();
      company = companyRow as typeof company;

      if (company?.allowed_ips && company.allowed_ips.length > 0) {
        const isAllowed = company.allowed_ips.some((allowedIp: string) => {
          // Simple exact match or CIDR prefix match
          if (allowedIp === ip_address) return true;
          // Basic CIDR support: check if IP starts with the network part
          if (allowedIp.includes("/")) {
            const [network] = allowedIp.split("/");
            return ip_address.startsWith(network.split(".").slice(0, 3).join("."));
          }
          return false;
        });

        if (!isAllowed) {
          await supabaseAdmin.from("login_attempts").insert([{
            email,
            user_id: profile.id,
            ip_address,
            user_agent: user_agent || null,
            success: false,
            failure_reason: "ip_not_allowed",
          }]);

          return new Response(
            JSON.stringify({ allowed: false, reason: "ip_not_allowed" }),
            { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );
        }
      }
    }

    // ── Anti-forza-bruta per origine ──────────────────────────────────────
    // Il blocco scatta solo se UNA stessa origine (email + IP di provenienza)
    // ha superato la soglia di fallimenti VERI nella finestra di blocco. Così
    // chi entra dal proprio IP non può essere bloccato dai tentativi di un
    // altro: il DoS di login residuo del run-1.
    if (profile.company_id && ip_address) {
      const maxAttempts = company?.max_failed_attempts || 5;
      // lockout_duration_minutes è «quanto resta bloccato» e qui vale anche da
      // finestra di conteggio. 0 = «sblocca solo un amministratore»: per
      // origine lo trattiamo come una finestra lunga (24h), non come un blocco
      // globale perenne che un estraneo potrebbe innescare.
      const lockoutMinutes = company?.lockout_duration_minutes ?? 30;
      const windowMs = (lockoutMinutes > 0 ? lockoutMinutes : 24 * 60) * 60 * 1000;
      let windowStart = new Date(Date.now() - windowMs).toISOString();

      // Un accesso riuscito da questa stessa origine azzera gli strike: contiamo
      // i fallimenti solo da lì in poi.
      const { data: ultimoOk } = await supabaseAdmin
        .from("login_attempts")
        .select("created_at")
        .eq("email", email)
        .eq("ip_address", ip_address)
        .eq("success", true)
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultimoOk?.created_at && ultimoOk.created_at > windowStart) {
        windowStart = ultimoOk.created_at;
      }

      const { count: fallimenti } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("email", email)
        .eq("ip_address", ip_address)
        .eq("success", false)
        .eq("failure_reason", "invalid_credentials")
        .gt("created_at", windowStart);

      if ((fallimenti || 0) >= maxAttempts) {
        // locked_until è il momento in cui questa origine potrà riprovare, solo
        // per il messaggio all'utente: NON lo persistiamo su `profiles`.
        const lockUntil = new Date(Date.now() + windowMs).toISOString();

        // Log audit event
        await supabaseAdmin.from("user_audit_log").insert([{
          actor_id: profile.id,
          company_id: profile.company_id,
          action: "account_locked",
          target_user_id: profile.id,
          details: { reason: "max_failed_attempts", failed_count: fallimenti, ip_address },
        }]);

        await supabaseAdmin.from("login_attempts").insert([{
          email,
          user_id: profile.id,
          ip_address,
          user_agent: user_agent || null,
          success: false,
          failure_reason: "account_auto_locked",
        }]);

        // Email "account bloccato" al titolare (best-effort). Dedup per
        // (utente, origine): niente raffica se la stessa origine insiste.
        try {
          const { sendSystemEmail } = await import("../_shared/systemEmail.ts");
          await sendSystemEmail(supabaseAdmin, {
            templateName: "account_locked",
            companyId: profile.company_id ?? null,
            to: email,
            userId: profile.id,
            dedupeKey: `lock:${profile.id}:${ip_address}`,
            props: {
              recipientName: (profile as { first_name?: string }).first_name || email.split("@")[0],
              ctaUrl: "https://app.ediliziaincloud.com/login",
            },
          });
        } catch (mailErr) {
          console.warn("[check-login-security] email account_locked fallita:", (mailErr as Error)?.message);
        }

        return new Response(
          JSON.stringify({ allowed: false, reason: "account_locked", locked_until: lockUntil }),
          { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    // All checks passed
    return new Response(
      JSON.stringify({ allowed: true }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-login-security error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
}));
