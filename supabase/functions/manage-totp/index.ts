import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

// Simple TOTP implementation without external deps
function generateSecret(length = 20): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

function base32Decode(encoded: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = encoded.replace(/[=\s]/g, "").toUpperCase();
  let bits = "";
  for (const c of clean) {
    const val = alphabet.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

async function hmacSha1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(sig);
}

async function generateTOTP(secret: string, timeStep = 30, digits = 6): Promise<string> {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBytes = new Uint8Array(8);
  let t = time;
  for (let i = 7; i >= 0; i--) {
    timeBytes[i] = t & 0xff;
    t = Math.floor(t / 256);
  }
  const hmac = await hmacSha1(key, timeBytes);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

async function verifyTOTP(secret: string, token: string, window = 1): Promise<boolean> {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const t = time + i;
    const timeBytes = new Uint8Array(8);
    let tt = t;
    for (let j = 7; j >= 0; j--) {
      timeBytes[j] = tt & 0xff;
      tt = Math.floor(tt / 256);
    }
    const hmac = await hmacSha1(key, timeBytes);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    const otp = String(code % 1000000).padStart(6, "0");
    if (otp === token) return true;
  }
  return false;
}

function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    codes.push(code.slice(0, 4) + "-" + code.slice(4));
  }
  return codes;
}

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.replace("-", "").toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return errorResponse("Unauthorized", 401);

    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) return errorResponse("Unauthorized", 401);

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action, token, code } = await req.json();

    switch (action) {
      // ── SETUP: Generate secret + QR URI ──
      case "setup": {
        // Check if already has verified TOTP
        const { data: existing } = await supabase
          .from("totp_secrets")
          .select("is_verified")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing?.is_verified) {
          return errorResponse("2FA già configurata. Disattivala prima di riconfigurare.");
        }

        const secret = generateSecret();
        const issuer = "EdiliziaInCloud";
        const accountName = user.email || user.id;
        const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

        // Upsert unverified secret
        await supabase.from("totp_secrets").upsert(
          { user_id: user.id, encrypted_secret: secret, is_verified: false },
          { onConflict: "user_id" }
        );

        return jsonResponse({ secret, otpauth_uri: otpauthUri });
      }

      // ── VERIFY: Confirm setup with a valid code ──
      case "verify": {
        if (!token || token.length !== 6) return errorResponse("Codice a 6 cifre richiesto");

        const { data: totpRow } = await supabase
          .from("totp_secrets")
          .select("encrypted_secret")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!totpRow) return errorResponse("Nessun setup 2FA trovato. Esegui prima il setup.");

        const valid = await verifyTOTP(totpRow.encrypted_secret, token);
        if (!valid) return errorResponse("Codice non valido. Riprova.");

        // Mark as verified
        await supabase.from("totp_secrets")
          .update({ is_verified: true, verified_at: new Date().toISOString() })
          .eq("user_id", user.id);

        // Generate backup codes
        const backupCodes = generateBackupCodes();
        
        // Delete old codes
        await supabase.from("totp_backup_codes").delete().eq("user_id", user.id);
        
        // Insert hashed codes
        const hashedCodes = await Promise.all(
          backupCodes.map(async (c) => ({
            user_id: user.id,
            code_hash: await hashCode(c),
          }))
        );
        await supabase.from("totp_backup_codes").insert(hashedCodes);

        // Update profile
        await supabase.from("profiles").update({ require_2fa: true } as any).eq("id", user.id);

        return jsonResponse({ verified: true, backup_codes: backupCodes });
      }

      // ── VALIDATE: Check TOTP code (for login) ──
      case "validate": {
        if (!token || token.length !== 6) return errorResponse("Codice a 6 cifre richiesto");

        const { data: totpRow } = await supabase
          .from("totp_secrets")
          .select("encrypted_secret, is_verified")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!totpRow?.is_verified) return errorResponse("2FA non configurata");

        const valid = await verifyTOTP(totpRow.encrypted_secret, token);
        if (!valid) return errorResponse("Codice non valido");

        return jsonResponse({ valid: true });
      }

      // ── VALIDATE BACKUP: Use a backup code ──
      case "validate_backup": {
        if (!code) return errorResponse("Codice di backup richiesto");

        const codeHash = await hashCode(code);
        const { data: backupRow } = await supabase
          .from("totp_backup_codes")
          .select("id")
          .eq("user_id", user.id)
          .eq("code_hash", codeHash)
          .eq("is_used", false)
          .maybeSingle();

        if (!backupRow) return errorResponse("Codice di backup non valido o già usato");

        await supabase.from("totp_backup_codes")
          .update({ is_used: true, used_at: new Date().toISOString() })
          .eq("id", backupRow.id);

        return jsonResponse({ valid: true });
      }

      // ── STATUS: Check if 2FA is enabled ──
      case "status": {
        const { data: totpRow } = await supabase
          .from("totp_secrets")
          .select("is_verified, verified_at")
          .eq("user_id", user.id)
          .maybeSingle();

        const { data: backupCodes } = await supabase
          .from("totp_backup_codes")
          .select("id, is_used")
          .eq("user_id", user.id);

        return jsonResponse({
          enabled: totpRow?.is_verified || false,
          verified_at: totpRow?.verified_at || null,
          backup_codes_total: backupCodes?.length || 0,
          backup_codes_remaining: backupCodes?.filter((c: any) => !c.is_used).length || 0,
        });
      }

      // ── DISABLE: Remove 2FA ──
      case "disable": {
        if (!token || token.length !== 6) return errorResponse("Codice corrente richiesto per disattivare");

        const { data: totpRow } = await supabase
          .from("totp_secrets")
          .select("encrypted_secret, is_verified")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!totpRow?.is_verified) return errorResponse("2FA non configurata");

        const valid = await verifyTOTP(totpRow.encrypted_secret, token);
        if (!valid) return errorResponse("Codice non valido");

        await supabase.from("totp_secrets").delete().eq("user_id", user.id);
        await supabase.from("totp_backup_codes").delete().eq("user_id", user.id);
        await supabase.from("profiles").update({ require_2fa: false } as any).eq("id", user.id);

        return jsonResponse({ disabled: true });
      }

      default:
        return errorResponse("Azione non supportata");
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("TOTP error:", err);
    return errorResponse((err as Error).message, 500);
  }
});
