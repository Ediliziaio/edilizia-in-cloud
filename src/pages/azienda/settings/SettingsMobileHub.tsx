/**
 * SettingsMobileHub — v8.6.70
 *
 * Hub mobile delle Impostazioni: griglia di card cliccabili con icone, una
 * per ogni sezione, raggruppate per categoria. Sostituisce il vecchio
 * dropdown "Vai a una sezione…" e il redirect automatico a "mio-profilo"
 * quando l'utente entra in /azienda/impostazioni da mobile.
 *
 * UX:
 *   - Tap sull'icona della rotellina nell'header → naviga qui
 *   - Mostra subito tutte le sezioni con icona+label
 *   - Tap su una card → naviga alla pagina specifica
 *   - Su tablet/desktop presenta la stessa navigazione in una griglia più ampia
 */
import { Link } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStatoPiano } from "@/hooks/useStatoPiano";
import { buildSettingsGroups } from "@/lib/impostazioni/navigazioneImpostazioni";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogOut, ChevronRight, Loader2 } from "lucide-react";


// Sezioni NASCOSTE nell'hub mobile: configurazioni avanzate/desktop che sul
// telefono sono solo rumore (si gestiscono da desktop). Le rotte restano
// raggiungibili da desktop e via ricerca/URL diretto — qui le togliamo solo
// dalla griglia mobile.
const HIDDEN_ON_MOBILE = new Set<string>([
  "/azienda/impostazioni/abbonamento",        // Piano abbonamento
  "/azienda/impostazioni/branding",           // White-Label
  "/azienda/impostazioni/stati-ordine",       // Stati ordine
  "/azienda/impostazioni/cartelle-documenti", // Cartelle documenti
  "/azienda/impostazioni/categorie-costi",    // Categorie costi
  "/azienda/impostazioni/fornitori",          // Fornitori
  "/azienda/impostazioni/listino",            // Listino prodotti
  "/azienda/impostazioni/margini",            // Margini e sconti
  "/azienda/impostazioni/template-preventivi",// Modelli di preventivo
  "/azienda/impostazioni/catalogo-render",    // Catalogo render
  "/azienda/impostazioni/condizioni-firma",   // Firma e condizioni
  "/azienda/impostazioni/finanziamenti",      // Finanziamenti
  "/azienda/impostazioni/integrazioni",       // Integrazioni
  "/azienda/impostazioni/lead-forms",         // Lead Facebook
  "/azienda/impostazioni/ai-memoria",         // AI Personas
  "/azienda/impostazioni/ai-automazioni",     // AI Automazioni
  // Configurazioni da fare una volta, al computer (25/09/2026).
  "/azienda/impostazioni/sedi",               // Sedi
  "/azienda/impostazioni/fatturazione",       // Fatturazione (sistema e provider)
  "/azienda/impostazioni/sopralluoghi",       // Modelli dei sopralluoghi
  // I calendari su telefono si consultano, non si configurano (25/09/2026).
  "/azienda/impostazioni/calendari-lavori",   // Calendari lavori
  "/azienda/impostazioni/rapportini-cantiere",// Rapportini e presenze (si sceglie una volta, al computer)
  "/azienda/impostazioni/modelli-fasi",       // Modelli di fasi (si preparano una volta, al computer)
  "/azienda/impostazioni/modelli-pagamento",  // Modelli di pagamento (si preparano una volta, al computer)
  "/azienda/impostazioni/calendari",          // Calendari marketing
]);

export default function SettingsMobileHub() {
  const { signOut, user, profile } = useAuth();
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  const [logoutOpen, setLogoutOpen] = useState(false);
  // Filtro rapido: ~23 card senza ricerca obbligavano a scorrere tutto l'hub
  // (su desktop esiste SettingsSearch, su mobile non c'era nulla).
  const [filtro, setFiltro] = useState("");
  const q = filtro.trim().toLowerCase();
  // Le impostazioni fuori dal piano dell'azienda non compaiono (21/09/2026).
  const { stato: piano } = useStatoPiano();
  const sezioniFiltrate = buildSettingsGroups(permissions.isAdmin, permissions, piano, isMobile).map((section) => ({
    ...section,
    items: section.items
      .filter((i) => i.visible && !(isMobile && HIDDEN_ON_MOBILE.has(i.to)))
      .filter((i) => (q ? i.label.toLowerCase().includes(q) : true)),
  })).filter((s) => s.items.length > 0);

  if (permissions.isLoading) {
    return <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Caricamento impostazioni…</div>;
  }

  // A righe, come le Impostazioni del telefono: icona piccola, nome, freccia.
  // Prima erano riquadri da 100px con l'icona grande, due per riga, e sopra un
  // secondo titolo «Tutte le impostazioni» con la spiegazione.
  return (
    <div className="space-y-4 pb-4">
      {/* Da 768 non serve: c'erano tre ricerche nella stessa schermata (qui,
          nel menu a sinistra e «Cerca… ⌘K» in testata). */}
      <input
        type="text"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Cerca un'impostazione…"
        aria-label="Cerca un'impostazione"
        className="w-full h-9 rounded-lg border border-border/60 bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary md:hidden"
      />

      {q && sezioniFiltrate.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">Nessuna impostazione trovata per «{filtro}».</p>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {sezioniFiltrate.map((section) => (
        <section key={section.label} className="space-y-1.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            {section.label}
          </h3>
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {section.items.map((item) => {
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="tap-compact flex min-h-[44px] items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-muted"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      </div>

      {/* v8.6.76 — Account + logout in fondo all'hub. Su mobile è l'unico
          punto di accesso al logout (la sidebar con il menu utente è md+). */}
      <section className="space-y-1.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Account corrente
        </h3>
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
              {(profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "") || user?.email?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {profile?.first_name ? `${profile.first_name} ${profile.last_name ?? ""}`.trim() : "Utente"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className="tap-compact flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium text-destructive active:bg-muted"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Esci dall'account
          </button>
        </div>
      </section>

      {/* Dialog conferma logout */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uscire dall'account?</AlertDialogTitle>
            <AlertDialogDescription>
              Verrai disconnesso e dovrai inserire di nuovo le credenziali per tornare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void signOut(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Esci
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
