/**
 * PreviewModeWrapper — v8.6.84
 *
 * Wrapper che attiva la modalità DEMO su una pagina intera quando una
 * feature è in `access_level=preview`. Mostra il banner sticky in cima,
 * e intercetta ogni click su elementi "destructive" (create/edit/save/
 * delete/submit) aprendo `UnlockFeatureDialog`.
 *
 * Whitelisting per gesture lecite in demo:
 *   - link <a> e <NavLink> (navigazione)
 *   - bottoni con `data-allow-in-preview="true"`
 *   - bottoni di tab/filter/sort/paginazione/export (read-only)
 *   - tutto ciò che è dentro <nav>, <aside>, [role="navigation"], header
 *
 * Blocco automatico per i pattern destructive:
 *   - button[type="submit"]
 *   - bottoni con classe primary/destructive
 *   - testo contenente "Aggiungi", "Nuovo", "Crea", "Salva", "Modifica",
 *     "Elimina", "Invia", "Pubblica", "Carica", "Importa"
 *   - icone Plus, Edit, Trash, Save, Send, Upload, Pencil
 *   - submit di <form>
 */
import { useState, useRef, useCallback, type ReactNode } from "react";
import { FeaturePreviewBanner } from "./FeaturePreviewBanner";
import { UnlockFeatureDialog } from "./UnlockFeatureDialog";
import { track, ANALYTICS_EVENTS } from "@/lib/analytics/posthog";

interface Props {
  featureKey: string;
  featureLabel?: string;
  description?: string;
  benefits?: string[];
  children: ReactNode;
}

const DESTRUCTIVE_KEYWORDS = [
  "aggiungi", "nuovo", "nuova", "crea", "create", "salva", "save",
  "modifica", "edit", "elimina", "delete", "rimuovi", "invia", "send",
  "pubblica", "publish", "carica", "upload", "importa", "import",
  "duplica", "duplicate", "archivia", "archive", "conferma", "confirm",
  "approva", "approve", "rifiuta", "reject", "annulla ordine", "cancella",
];

const SAFE_KEYWORDS = [
  "esporta", "export", "ordina", "sort", "filtra", "filter",
  "prec", "succ", "previous", "next", "indietro", "back",
  "chiudi", "close", "annulla", "cancel", "dismiss",
  "tutti", "all", "cerca", "search", "vai", "go",
  "vista", "view", "espandi", "expand", "collassa", "collapse",
];

function isInsideNav(el: Element): boolean {
  let cur: Element | null = el;
  while (cur) {
    const tag = cur.tagName?.toLowerCase();
    const role = cur.getAttribute?.("role");
    if (tag === "nav" || tag === "aside" || tag === "header") return true;
    if (role === "navigation" || role === "menubar" || role === "tablist") return true;
    if (cur.getAttribute?.("data-sidebar") !== null && cur.getAttribute?.("data-sidebar") !== undefined) return true;
    cur = cur.parentElement;
  }
  return false;
}

function shouldBlock(target: HTMLElement): boolean {
  // Trova il button/link più vicino
  const btn = target.closest("button, [role='button'], a[href], input[type='submit']") as HTMLElement | null;
  if (!btn) return false;

  // Opt-out esplicito
  if (btn.getAttribute("data-allow-in-preview") === "true") return false;

  // Link di navigazione: lascia passare
  if (btn.tagName.toLowerCase() === "a" && (btn as HTMLAnchorElement).href) {
    // Se è un link che esce dalla pagina corrente o naviga, allow
    return false;
  }

  // Dentro sidebar/header/nav: lascia passare
  if (isInsideNav(btn)) return false;

  const text = (btn.textContent ?? "").trim().toLowerCase();
  const aria = (btn.getAttribute("aria-label") ?? "").toLowerCase();
  const fullText = `${text} ${aria}`.trim();

  // Safe keywords prevalgono
  for (const k of SAFE_KEYWORDS) {
    if (fullText === k || fullText.startsWith(k + " ") || fullText.endsWith(" " + k)) return false;
  }

  // Submit di form → block
  const inputType = (btn as HTMLInputElement).type;
  if (btn.tagName.toLowerCase() === "input" && inputType === "submit") return true;
  if (btn.tagName.toLowerCase() === "button" && (btn as HTMLButtonElement).type === "submit") return true;

  // Destructive keywords → block
  for (const k of DESTRUCTIVE_KEYWORDS) {
    if (fullText.includes(k)) return true;
  }

  // Bottoni "primary" senza testo descrittivo (probabili azioni principali):
  // se il bottone è prominente (bg-primary, bg-orange...) e ha un'icona
  // riconosciuta (Plus/Save/Send), blocca.
  const className = btn.className ?? "";
  const hasPrimaryStyle = /bg-primary|bg-orange|bg-destructive|bg-emerald|bg-amber-600|bg-green-600|bg-blue-600|bg-red/i.test(className);
  if (hasPrimaryStyle) {
    // Verifica se ha un'icona di azione destruttiva
    const iconClass = btn.querySelector("svg")?.getAttribute("class") ?? "";
    const hasDestructiveIcon = /lucide-plus|lucide-trash|lucide-pencil|lucide-edit|lucide-save|lucide-send|lucide-upload|lucide-cloud-upload/i.test(iconClass);
    if (hasDestructiveIcon) return true;
  }

  return false;
}

export function PreviewModeWrapper({
  featureKey,
  featureLabel,
  description,
  benefits,
  children,
}: Props) {
  const [unlockOpen, setUnlockOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    if (shouldBlock(target)) {
      e.preventDefault();
      e.stopPropagation();
      setUnlockOpen(true);
      // v8.6.89 — analytics
      const btn = target.closest("button, [role='button']") as HTMLElement | null;
      track(ANALYTICS_EVENTS.PREVIEW_FEATURE_BLOCKED, {
        feature_key: featureKey,
        feature_label: featureLabel,
        action_text: btn?.textContent?.trim().slice(0, 50),
      });
    }
  }, [featureKey, featureLabel]);

  // Submit form intercettati SOLO se la form non ha role="search" e non ha
  // data-allow-in-preview. Le ricerche/filtri devono passare normalmente.
  const handleSubmitCapture = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const form = e.target as HTMLElement;
    if (form.tagName?.toLowerCase() !== "form") return;
    if (form.getAttribute("data-allow-in-preview") === "true") return;
    if (form.getAttribute("role") === "search") return;
    e.preventDefault();
    e.stopPropagation();
    setUnlockOpen(true);
  }, []);

  return (
    <div
      ref={containerRef}
      onClickCapture={handleClickCapture}
      onSubmitCapture={handleSubmitCapture}
      data-preview-mode="true"
      className="relative"
    >
      <div className="sticky top-0 z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-1 bg-background/95 backdrop-blur-sm">
        <FeaturePreviewBanner
          featureKey={featureKey}
          featureLabel={featureLabel}
          description={description}
          benefits={benefits}
        />
      </div>
      {children}

      <UnlockFeatureDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        featureKey={featureKey}
        featureLabel={featureLabel ?? featureKey}
        description={description}
        benefits={benefits}
      />
    </div>
  );
}
