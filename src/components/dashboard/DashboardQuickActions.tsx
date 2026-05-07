/**
 * DashboardQuickActions — FAB mobile + shortcut tastiera desktop.
 * Mobile: bottone flottante in basso a destra con menu radiale (Nuovo ordine / cliente / preventivo).
 * Desktop: azioni inline, Cmd+K apre il command palette globale.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, ClipboardList, Users, FileText, X, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  { label: "Nuovo ordine", href: "/azienda/ordini/nuovo", icon: ClipboardList, shortcut: "O" },
  { label: "Nuovo cliente", href: "/azienda/clienti/nuovo", icon: Users, shortcut: "C" },
  { label: "Nuovo preventivo", href: "/azienda/preventivi/nuovo", icon: FileText, shortcut: "P" },
];

export function DashboardQuickActions() {
  const [open, setOpen] = useState(false);

  // Chiudi con Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  return (
    <>
      {/* Desktop: azioni inline */}
      <div className="hidden sm:flex items-center gap-1.5">
        {QUICK_ACTIONS.map((a) => (
          <Button key={a.href} variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link to={a.href} aria-label={a.label}>
              <Plus className="h-4 w-4 mr-1" />
              <span>{a.label.replace("Nuovo ", "")}</span>
            </Link>
          </Button>
        ))}
      </div>

      {/* Mobile: FAB con menu radiale */}
      <div className="sm:hidden">
        {open && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
          {open && QUICK_ACTIONS.map((a, i) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                to={a.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="rounded-full bg-background border px-3 py-1.5 text-xs font-medium shadow-lg">
                  {a.label}
                </span>
                <span className="h-11 w-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                  <Icon className="h-5 w-5" />
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-label={open ? "Chiudi menu rapido" : "Apri menu rapido"}
            className={cn(
              "h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center transition-transform",
              open && "rotate-45"
            )}
          >
            {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * DashboardKeyboardHint — chip con suggerimento Cmd+K, mostrato solo desktop.
 */
export function DashboardKeyboardHint() {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const modifier = isMac ? "⌘" : "Ctrl";

  const openCommand = () => {
    // Il CompanyLayout ha un CommandPalette aperto via Cmd+K — dispatch evento sintetico
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: isMac, ctrlKey: !isMac, bubbles: true });
    window.dispatchEvent(event);
  };

  return (
    <button
      type="button"
      onClick={openCommand}
      className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted px-2 py-1 text-[11px] text-muted-foreground transition-colors"
      title="Apri comandi rapidi"
    >
      <Keyboard className="h-3 w-3" />
      <span>Cerca</span>
      <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">{modifier}</kbd>
      <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">K</kbd>
    </button>
  );
}
