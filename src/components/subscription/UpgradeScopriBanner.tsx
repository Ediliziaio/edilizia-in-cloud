import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isMobileAppRuntime } from "@/lib/mobile/platform";
import { useIsMobile } from "@/hooks/use-mobile";

export type ScopriWallType =
  | "max_orders"
  | "sdi_invoice"
  | "ddt_nc_proforma"
  | "banca_psd2"
  | "crm_pipeline"
  | "hr_completo"
  | "magazzino"
  | "marketing"
  | "render_ai"
  | "previsionale"
  | "report"
  | "max_campo_operai"
  | "generic";

const WALL_MESSAGES: Record<ScopriWallType, {
  icon: string;
  title: string;
  desc: string;
  cta: string;
}> = {
  max_orders: {
    icon: "\u{1F3D7}\u{FE0F}",
    title: "Stai crescendo \u2014 \u00e8 il momento giusto.",
    desc: "Con il piano Scopri puoi gestire fino a 3 cantieri. Hai gi\u00e0 visto come funziona: ora porta i tuoi cantieri senza limiti.",
    cta: "Passa a Starter \u2014 commesse illimitate",
  },
  sdi_invoice: {
    icon: "\u{1F4C4}",
    title: "La fatturazione elettronica SDI \u00e8 disponibile da Starter.",
    desc: "Emetti fatture elettroniche FatturaPA 1.2 conformi all'Agenzia delle Entrate, gestisci il CassettoSDI e il Registro Incassi.",
    cta: "Attiva Starter \u2014 fatturazione inclusa",
  },
  ddt_nc_proforma: {
    icon: "\u{1F4CB}",
    title: "DDT, Note di Credito e Proforma sono inclusi da Starter.",
    desc: "Gestisci tutta la documentazione fiscale: DDT collegati alle commesse, storno fatture, acconti e proforma.",
    cta: "Attiva Starter \u2014 incluso nel piano",
  },
  banca_psd2: {
    icon: "\u{1F3E6}",
    title: "Collega il tuo conto bancario da Starter.",
    desc: "Sincronizzazione automatica movimenti, riconciliazione fatture, tesoreria multi-conto. Smetti di fare copia-incolla dal home banking.",
    cta: "Attiva Starter \u2014 banca inclusa",
  },
  crm_pipeline: {
    icon: "\u{1F3AF}",
    title: "Il CRM completo \u00e8 disponibile da Starter.",
    desc: "Pipeline opportunit\u00e0 drag & drop, storico interazioni con ogni cliente, sync automatico dei lead da Facebook Ads.",
    cta: "Attiva Starter \u2014 CRM incluso",
  },
  hr_completo: {
    icon: "\u{1F465}",
    title: "HR completo e cedolini sono disponibili da Starter.",
    desc: "Presenze, ferie, permessi, cedolini strutturati (lordo, IRPEF, INPS, netto). Il tuo ufficio del personale in un click.",
    cta: "Attiva Starter \u2014 HR incluso",
  },
  magazzino: {
    icon: "\u{1F4E6}",
    title: "Il magazzino \u00e8 disponibile da Starter.",
    desc: "Gestione materiali, movimenti IN/OUT, barcode scanner da mobile, scorte furgone. Sapere sempre cosa hai e dove.",
    cta: "Attiva Starter \u2014 magazzino incluso",
  },
  marketing: {
    icon: "\u{1F4E3}",
    title: "Email, WhatsApp e SMS marketing sono disponibili da Starter.",
    desc: "5.000 email/mese incluse, campagne WhatsApp, SMS bulk, sync automatico dei lead da Facebook/Instagram.",
    cta: "Attiva Starter \u2014 marketing incluso",
  },
  render_ai: {
    icon: "\u{1F3A8}",
    title: "Render AI \u00e8 un add-on disponibile da qualsiasi piano.",
    desc: "Carica una foto dell'ambiente e mostra al cliente il risultato finito prima di firmare il contratto. Chiude pi\u00f9 trattative.",
    cta: "Attiva un piano e aggiungi Render AI",
  },
  previsionale: {
    icon: "\u{1F4C8}",
    title: "Il previsionale di cassa \u00e8 disponibile da Starter.",
    desc: "Vedi a 60 giorni se avrai abbastanza liquidit\u00e0 per pagare fornitori e dipendenti. Smetti di navigare a vista.",
    cta: "Attiva Starter \u2014 previsionale incluso",
  },
  report: {
    icon: "\u{1F4CA}",
    title: "I report P&L e cash flow sono disponibili da Starter.",
    desc: "Margine reale per cantiere, conto economico, andamento cassa. I numeri che ti servono per decidere bene.",
    cta: "Attiva Starter \u2014 report inclusi",
  },
  max_campo_operai: {
    icon: "\u{1F4CD}",
    title: "Con Starter puoi aggiungere operai illimitati sull'app.",
    desc: "Nel piano Scopri puoi avere 2 operai sull'app campo. Con Starter sono illimitati \u2014 tutta la tua squadra in un posto solo.",
    cta: "Attiva Starter \u2014 operai illimitati",
  },
  generic: {
    icon: "\u2728",
    title: "Questa funzione \u00e8 disponibile da Starter.",
    desc: "Hai gi\u00e0 visto il potenziale di EiC. Con Starter a \u20ac127/mese sblocchi tutto \u2014 senza limite di commesse, con fatturazione e molto altro.",
    cta: "Scopri il piano Starter",
  },
};

interface UpgradeScopriWallProps {
  type: ScopriWallType;
  inline?: boolean;
  onDismiss?: () => void;
}

export function UpgradeScopriWall({ type, inline = false, onDismiss }: UpgradeScopriWallProps) {
  const navigate = useNavigate();
  const msg = WALL_MESSAGES[type];
  // Dal telefono il piano non si cambia (regola dell'utente, 25/09/2026): lo
  // stesso avviso neutro dell'app.
  const isMobile = useIsMobile();

  const handleUpgrade = () => {
    navigate("/azienda/impostazioni/abbonamento");
  };

  // App Store Guideline 3.1.1: nell'app mobile NON mostriamo prezzi (es. "€127/mese")
  // né CTA di upgrade/acquisto (porterebbero a meccanismi di pagamento esterni).
  // Stato "non incluso" neutro, senza prezzo, senza link/bottone d'acquisto. Sul
  // web resta il nudge completo con prezzo + CTA.
  if (isMobileAppRuntime || isMobile) {
    return (
      <div className={cn(
        "rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900",
        inline ? "p-6 text-center space-y-1" : "flex items-center gap-3 px-4 py-3"
      )}>
        <Lock className={cn("text-orange-600 flex-shrink-0", inline ? "h-6 w-6 mx-auto mb-1" : "h-4 w-4")} />
        <div className={inline ? "" : "flex-1 min-w-0"}>
          <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
            Funzionalità non inclusa nel tuo piano attuale
          </p>
          <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
            {isMobileAppRuntime ? "Per ampliare il piano contatta l'assistenza." : "Il piano si cambia dal computer."}
          </p>
        </div>
      </div>
    );
  }

  if (inline) {
    return (
      <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-6 text-center space-y-4">
        <div className="text-4xl">{msg.icon}</div>
        <div>
          <h3 className="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1">
            {msg.title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            {msg.desc}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={handleUpgrade} className="gap-2 bg-[#E8521A] hover:bg-[#d44714] text-white">
            <Sparkles className="h-4 w-4" />
            {msg.cta}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss} className="text-gray-500">
              Non ora
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Starter a {"\u20ac"}127/mese {"\u00b7"} 31 giorni gratis {"\u00b7"} Nessuna carta per il trial
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 px-4 py-3">
      <Lock className="h-4 w-4 text-orange-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
          {msg.title}
        </p>
        <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5 truncate">
          {msg.desc}
        </p>
      </div>
      <Button
        size="sm"
        onClick={handleUpgrade}
        className="flex-shrink-0 gap-1.5 bg-[#E8521A] hover:bg-[#d44714] text-white"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Aggiorna
      </Button>
    </div>
  );
}

interface ScopriProgressBannerProps {
  usedOrders: number;
  maxOrders: number;
  /** v8.6.84 — nome del piano corrente (es. "Render + Preventivatore Serramenti"). Default "Scopri". */
  planName?: string;
}

export function ScopriProgressBanner({ usedOrders, maxOrders, planName = "Scopri" }: ScopriProgressBannerProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const remaining = maxOrders - usedOrders;
  const pct = (usedOrders / maxOrders) * 100;

  const isNearLimit = remaining <= 1;

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm",
      isNearLimit
        ? "border-orange-200 bg-orange-50 dark:bg-orange-950/20"
        : "border-gray-200 bg-gray-50 dark:bg-gray-900/40"
    )}>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className={cn(
            "font-medium text-xs",
            isNearLimit ? "text-orange-700 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"
          )}>
            {usedOrders}/{maxOrders} cantieri {"\u00b7"} Piano {planName}
          </span>
          {isNearLimit && (
            <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
              Quasi al limite
            </Badge>
          )}
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
          <div
            className={cn(
              "h-1 rounded-full transition-all",
              isNearLimit ? "bg-orange-500" : "bg-blue-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {/* App Store 3.1.1: niente CTA upgrade nell'app mobile (la barra resta
          informativa: mostra solo l'uso cantieri, senza acquisto). */}
      {isNearLimit && !isMobileAppRuntime && !isMobile && (
        <Button
          size="sm"
          variant="outline"
          className="flex-shrink-0 text-xs h-7 border-orange-300 text-orange-700 hover:bg-orange-100"
          onClick={() => navigate("/azienda/impostazioni/abbonamento")}
        >
          Aggiorna {"\u2192"}
        </Button>
      )}
    </div>
  );
}
