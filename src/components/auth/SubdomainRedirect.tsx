/**
 * SubdomainRedirect — enforces subdomain-based routing.
 *
 * Mounted at the root "/" route. Decides what to render based on:
 *  1. is auth still bootstrapping?  → FullScreenSpinner (z-50, copre tutto)
 *  2. utente loggato?               → RoleBasedRedirect (manda alla sezione corretta)
 *  3. subdomain è www/bare/localhost? → landing pubblica (Home)
 *  4. qualsiasi altro subdomain (app, admin, clienti, lavori, ecc.) → RoleBasedRedirect
 *
 * 🛠️ BUG FIX v3 (2026-05-10): "vedo la home page del sito prima dell'app"
 *
 *   Cause storiche:
 *   (a) Quando AuthContext segnala isLoading=false ma l'utente è ancora null
 *       (race window post-INITIAL_SESSION), il vecchio guard skippava lo spinner
 *       e il branch "user ? RoleBasedRedirect : Home" mostrava Home per ~100-300ms
 *       prima che l'auth context ricaricasse user dal token persisted.
 *   (b) Lo spinner usava `min-h-screen` ma era dentro un Suspense con fallback
 *       `min-h-[200px]` → sull'app.* il browser vedeva il fallback piccolo +
 *       eventuale Home in fade-in, percepito come "flash della landing".
 *   (c) La condizione di rendering Home era "OR-list inclusiva" (`subdomain ===
 *       "www" || subdomain === "" || subdomain === "localhost"`). Se per qualche
 *       motivo la detection del subdomain ritornava un valore inatteso, default
 *       silente era… NON Home, ma rischio futuro: meglio invertire e rendere Home
 *       solo SE subdomain è esplicitamente www.
 *
 *   Fix v3:
 *   - `FullScreenSpinner` con `fixed inset-0 z-50 bg-background` → copre l'intera
 *     viewport indipendentemente dal fallback Suspense parent. Niente flash possibile.
 *   - `authBootstrapPending` usa una grace window breve per i token persisted:
 *     evita il flash della landing, ma non può bloccare per sempre un utente con
 *     refresh token scaduto/stale.
 *   - Branch Home invertito: `if (subdomain !== "www") return <RoleBasedRedirect />`
 *     → default safer su tutti i subdomain non-www. Home si renderizza SOLO su
 *     www.ediliziaincloud.com / ediliziaincloud.com / localhost.
 *
 * 🛠️ BUG FIX v4 (2026-05-14): localhost non deve mai mostrare la home se
 *   esiste un indizio di sessione. In sviluppo `localhost` è trattato come
 *   `www` per poter vedere il sito pubblico, ma quando l'utente sta lavorando
 *   in piattaforma questo causava un flash della home al refresh/root redirect.
 *   Se troviamo token Supabase/cache profilo/session id, la root locale viene
 *   trattata come app bootstrap e passa sempre da RoleBasedRedirect/Login.
 */

import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSubdomainRoute } from "@/hooks/useSubdomainRoute";
import { useAuth } from "@/contexts/AuthContext";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";
import { isMobileAppRuntime } from "@/lib/mobile/platform";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { sessioneSalvataPresente } from "@/integrations/supabase/authStorage";

// La home è il chunk più richiesto del sito: retry con cache-bust se un
// deploy invalida gli asset (stessa protezione delle route in App.tsx).
const Home = lazyWithRetry(() => import("@/pages/Home"));

/**
 * 🆕 Spinner full-screen "definitivo" — `fixed inset-0 z-50` lo mette sopra
 * qualsiasi contenuto sottostante (incluso il fallback Suspense parent),
 * eliminando ogni flash di Home/landing durante il bootstrap auth.
 */
function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
      </div>
    </div>
  );
}

/**
 * Skeleton visivo dell'above-fold della home page (nav + hero).
 * Mostrato come fallback Suspense mentre il chunk Home scarica (~300-800ms),
 * e replicato nell'HTML inline (index.html #eic-initial-spinner) per copertura
 * pre-React. Il design segue i colori reali della HeroSection: sfondo dark
 * navy con glow arancione, così la transizione skeleton→reale è fluida.
 */
function HomeSkeleton() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#0a0f1a 0%,#0d1828 55%,#080d16 100%)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      {/* Nav placeholder */}
      <div style={{ height: 68, flexShrink: 0 }} />
      {/* Hero content skeleton */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 24,
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        {/* Orange badge ghost */}
        <div
          style={{
            width: 200,
            height: 30,
            borderRadius: 999,
            background: "rgba(249,116,21,0.13)",
            border: "1px solid rgba(249,116,21,0.28)",
            marginBottom: 28,
          }}
        />
        {/* Heading skeleton — 3 lines */}
        <div style={{ width: "min(82%,600px)", height: 20, background: "rgba(255,255,255,0.09)", borderRadius: 8, marginBottom: 14 }} />
        <div style={{ width: "min(65%,470px)", height: 20, background: "rgba(255,255,255,0.07)", borderRadius: 8, marginBottom: 14 }} />
        <div style={{ width: "min(52%,370px)", height: 20, background: "rgba(255,255,255,0.05)", borderRadius: 8, marginBottom: 36 }} />
        {/* CTA buttons ghost */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ width: 180, height: 48, borderRadius: 999, background: "rgba(249,116,21,0.28)" }} />
          <div style={{ width: 140, height: 48, borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }} />
        </div>
      </div>
      {/* Ambient orange glow — matches real hero */}
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "15%",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "rgba(249,116,21,0.07)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "25%",
          right: "10%",
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: "rgba(249,116,21,0.05)",
          filter: "blur(70px)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/**
 * Sync check: c'è un Supabase session token persisted in localStorage?
 *
 * Usato per decidere se vale la pena attendere il check auth (mostrando spinner)
 * o se possiamo skippare al rendering immediato (visitor anonimo).
 *
 * Non valida il token (potrebbe essere scaduto/revocato): è solo un'euristica
 * per evitare:
 *   - flash della landing su utente loggato (bug fix principale)
 *   - spinner inutile su visitor anonimo che vuole vedere la landing subito
 */
const AUTH_PROFILE_CACHE_KEY = "auth_profile_v1";
const SESSION_ID_KEY = "user_session_id";

function hasPersistedSupabaseSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Guarda anche il cookie di dominio: chi ha fatto login su admin.* e apre
    // app.* ha la sessione li' e non nella memoria locale — cercandola solo
    // nella memoria vedrebbe comparire la landing prima del rimbalzo.
    return sessioneSalvataPresente();
  } catch {
    // Storage bloccato (private mode, quota): assumiamo nessuna sessione
    return false;
  }
}

function hasStoredAuthBootstrapHint(): boolean {
  if (typeof window === "undefined") return false;
  if (hasPersistedSupabaseSession()) return true;
  try {
    return Boolean(
      sessionStorage.getItem(AUTH_PROFILE_CACHE_KEY) ||
      sessionStorage.getItem(SESSION_ID_KEY),
    );
  } catch {
    return false;
  }
}

function isLocalAppHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

const PERSISTED_SESSION_BOOT_GRACE_MS = 4_000;

export function SubdomainRedirect() {
  const { subdomain } = useSubdomainRoute();
  const { user, isLoading } = useAuth();

  // Se al boot troviamo un token Supabase persisted, teniamo uno spinner breve
  // per evitare flash della landing mentre AuthContext risolve INITIAL_SESSION.
  // IMPORTANTE: questa grace window scade sempre. Prima era memorizzata a vita:
  // con refresh token stale/invalidi l'utente restava bloccato sullo spinner e
  // non veniva mai mandato a /login.
  const [hadAuthBootstrapHint] = useState(() => hasStoredAuthBootstrapHint());
  const [sessionTokenGraceActive, setSessionTokenGraceActive] = useState(() => hadAuthBootstrapHint);

  // L'effect gestisce SOLO il timeout della grace window: il caso "utente
  // risolto" è già coperto dal guard sotto (`sessionTokenGraceActive && !user`),
  // quindi non serve azzerare lo stato in modo sincrono dentro l'effect
  // (react-hooks/set-state-in-effect). Se il timer scatta dopo il login,
  // setta false su uno stato ormai irrilevante: nessun cambio visivo.
  useEffect(() => {
    if (!sessionTokenGraceActive) return;

    const id = window.setTimeout(() => {
      setSessionTokenGraceActive(false);
    }, PERSISTED_SESSION_BOOT_GRACE_MS);

    return () => window.clearTimeout(id);
  }, [sessionTokenGraceActive]);

  // Guard tight — copre 2 casi:
  //   (1) AuthContext sta ancora caricando (isLoading=true) E esiste un token
  //       persisted al boot → c'è probabilità reale di trovare un utente loggato.
  //       Se non c'è nessun hint di sessione (visitor anonimo su www), skippare
  //       lo spinner elimina 300-800ms di attesa getSession() visibile come
  //       "Caricamento in corso" bianco — il cambio più impattante per la perf.
  //   (2) esisteva un token persisted al boot, ma solo per una grace window
  //       breve. Se AuthContext risolve "utente non autenticato", lasciamo
  //       proseguire RoleBasedRedirect verso /login invece di bloccare.
  const authBootstrapPending = (isLoading && hadAuthBootstrapHint) || (sessionTokenGraceActive && !user);
  if (authBootstrapPending) {
    return <FullScreenSpinner />;
  }

  // 🆕 Se utente loggato: sempre RoleBasedRedirect (manda alla sezione
  // corretta in base al ruolo: /azienda, /admin, /campo, /cliente, ecc.)
  // Vale ANCHE su www/bare/localhost per evitare flash della landing.
  if (user) {
    return <RoleBasedRedirect />;
  }

  // 🆕 v3: branch invertito — Home renderizzata SOLO se subdomain è
  // esplicitamente "www" (che include anche bare domain e localhost via
  // useSubdomainRoute). Su qualsiasi altro subdomain (app, admin, clienti,
  // lavori, custom white-label, ecc.) deleghiamo a RoleBasedRedirect che
  // sa come gestire il login per il contesto corrente. Difesa robusta:
  // se la detection del subdomain dovesse mai degradarsi, il fallback
  // sicuro è "manda al login giusto" non "mostra la landing pubblica".
  if (subdomain !== "www") {
    return <RoleBasedRedirect />;
  }

  // Localhost è usato sia per preview marketing sia per sviluppo app. Se c'è
  // qualunque traccia di sessione, non renderizziamo mai Home: al massimo si
  // finisce su /login, ma non si vede la landing durante refresh/login.
  if (isLocalAppHost() && hadAuthBootstrapHint) {
    return <RoleBasedRedirect />;
  }

  // App Store Guideline 3.1.1: nell'app mobile NON mostriamo MAI la landing
  // marketing pubblica (contiene prezzi di abbonamento e CTA d'acquisto, che
  // Apple considera accesso a meccanismi di pagamento esterni). Mandiamo sempre
  // al login. Sul web la landing resta visibile per i visitatori non autenticati.
  if (isMobileAppRuntime) {
    return <RoleBasedRedirect />;
  }

  // www.ediliziaincloud.com (o equivalente) senza auth → landing pubblica
  return (
    <ErrorBoundary>
      <Suspense fallback={<HomeSkeleton />}>
        <Home />
      </Suspense>
    </ErrorBoundary>
  );
}
