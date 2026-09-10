import { cancellaSessioniSalvate } from "@/integrations/supabase/authStorage";

function stringifyError(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isInvalidRefreshToken(error: unknown): boolean {
  const text = stringifyError(error).toLowerCase();
  return (
    text.includes("invalid refresh token") ||
    text.includes("refresh token not found") ||
    text.includes("refresh_token_not_found")
  );
}

function clearSupabaseAuthStorage() {
  try {
    // Cookie compresi: dal 10/09/2026 la sessione sta li', e una pulizia a
    // meta' la farebbe tornare identica al ricaricamento successivo.
    cancellaSessioniSalvate();
  } catch {
    // Storage non disponibile: il listener evita comunque il rumore console.
  }

  try {
    sessionStorage.removeItem("auth_profile_v1");
    sessionStorage.removeItem("user_session_id");
  } catch {
    // sessionStorage non disponibile: nessuna azione necessaria.
  }
}

/**
 * Registered before the app imports the Supabase-heavy tree.
 * After local DB resets or auth table restores, the browser can still hold a
 * refresh token that no longer exists server-side. Supabase may reject it during
 * early auto-refresh before AuthProvider is mounted; intercepting it here avoids
 * a red unhandled error and leaves the app in a clean logged-out/retryable state.
 */
export function installInvalidAuthSessionRecovery() {
  if (typeof window === "undefined") return;

  const flag = "__eicInvalidAuthSessionRecoveryInstalled";
  if ((window as any)[flag]) return;
  (window as any)[flag] = true;

  window.addEventListener("unhandledrejection", (event) => {
    if (!isInvalidRefreshToken(event.reason)) return;
    event.preventDefault();
    clearSupabaseAuthStorage();
  });
}

installInvalidAuthSessionRecovery();
