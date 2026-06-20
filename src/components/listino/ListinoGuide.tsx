/**
 * ListinoGuide — Pannello informativo collassabile in cima al catalogo listino.
 *
 * Spiega all'utente come è organizzato il listino multi-verticale (gerarchia
 * macrocategorie → categorie → articoli, etichette verticali, scheda tecnica
 * dinamica). Compare SEMPRE chiuso di default; l'utente può espanderlo e la
 * scelta viene ricordata in localStorage (riapre solo se espanso esplicitamente).
 *
 * Visibile solo per company_admin (la guida è operativa: spiega cose che
 * solo l'admin può fare). Il commerciale non ne ha bisogno.
 */
import { useEffect, useState } from "react";
import {
  Layers, FolderTree, Package, Settings2, Tag, Wand2, Info,
  ChevronDown, ChevronUp, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "listino-guide-collapsed-v1";

export function ListinoGuide() {
  // Default: SEMPRE chiuso. Resta aperto solo se l'utente lo ha
  // esplicitamente espanso in precedenza (persistenza in localStorage).
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "0") setCollapsed(false);
    } catch {
      // localStorage non disponibile (es. SSR/incognito) → resta chiuso
    }
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // silenzioso
    }
  };

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 dark:from-blue-950/30 dark:to-indigo-950/20 dark:border-blue-900/50">
      <CardContent className="p-4 sm:p-5">
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-between gap-3 text-left"
          aria-expanded={!collapsed}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 truncate">
              Come funziona il listino prodotti
            </h3>
            {collapsed && (
              <span className="hidden sm:inline text-xs text-muted-foreground">
                · Click per espandere
              </span>
            )}
          </div>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {!collapsed && (
          <div className="mt-4 space-y-4 text-sm text-blue-950/90 dark:text-blue-100/90">
            {/* Struttura gerarchica */}
            <section>
              <h4 className="font-semibold mb-2 flex items-center gap-1.5">
                <Layers className="h-4 w-4" /> Struttura a 3 livelli
              </h4>
              <div className="rounded-lg bg-white/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 p-3 space-y-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <FolderTree className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold">Macrocategoria</span>
                  <span className="text-muted-foreground font-sans">
                    es. <em>Infissi</em>, <em>Pannelli FV</em>, <em>Sanitari</em>
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-muted-foreground">└─</span>
                  <FolderTree className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-semibold">Categoria</span>
                  <span className="text-muted-foreground font-sans">
                    es. <em>Finestre PVC</em>, <em>Moduli monocristallini</em>
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-10">
                  <span className="text-muted-foreground">└─</span>
                  <Package className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold">Articolo</span>
                  <span className="text-muted-foreground font-sans">
                    prezzo base, griglia L×H, variabili (colore, apertura, ferramenta…)
                  </span>
                </div>
              </div>
            </section>

            {/* Verticali */}
            <section>
              <h4 className="font-semibold mb-2 flex items-center gap-1.5">
                <Tag className="h-4 w-4" /> Verticali — un solo listino, tanti moduli
              </h4>
              <p className="leading-relaxed">
                Se vendi <strong>serramenti + bagno + fotovoltaico</strong>, etichetta
                ogni macrocategoria con i moduli preventivo in cui deve apparire.
                Esempio: <em>Pannelli FV</em> → solo "Fotovoltaico", <em>Infissi</em>{" "}
                → solo "Serramenti". Quando crei un preventivo serramenti, vedrai{" "}
                <strong>solo</strong> i prodotti del verticale serramenti — niente
                pannelli o sanitari in mezzo.
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Imposti le etichette in <em>Gestisci categorie → modifica macrocategoria → Verticali abilitati</em>.
                Lascia vuoto per renderla generica (visibile ovunque).
              </p>
            </section>

            {/* Scheda tecnica */}
            <section>
              <h4 className="font-semibold mb-2 flex items-center gap-1.5">
                <Settings2 className="h-4 w-4" /> Scheda tecnica — campi diversi per ogni macrocategoria
              </h4>
              <p className="leading-relaxed">
                Per <em>Infissi</em> ti serve sapere il vetro, la trasmittanza Uw,
                il materiale del profilo. Per <em>Pannelli FV</em> ti servono la
                potenza Wp, l'efficienza, la tecnologia delle celle. Ogni
                macrocategoria ha la sua <strong>scheda tecnica personalizzata</strong>:
                imposti i campi una volta, ogni articolo te li chiede in automatico.
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                <strong>Scorciatoia:</strong> in <em>Gestisci categorie</em>, click
                sull'icona <Settings2 className="h-3 w-3 inline" /> accanto alla
                macrocategoria → bottone{" "}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-[10px]">
                  <Wand2 className="h-2.5 w-2.5" />Genera scheda standard
                </span>{" "}
                per popolare i campi tipici del verticale in un click. Poi
                modifichi quello che vuoi.
              </p>
              <div className="mt-2 rounded-md bg-white/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 p-2.5 text-xs">
                <strong>Scheda tecnica vs Variabili — differenza importante:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>
                    <strong>Scheda tecnica</strong> → caratteristiche{" "}
                    <em>intrinseche del modello</em> (vetro, Uw, materiale profilo).
                    Costanti per quell'articolo.
                  </li>
                  <li>
                    <strong>Variabili Prodotto</strong> (step 3 dell'articolo) →
                    caratteristiche <em>che variano in preventivo</em>{" "}
                    (colore interno/esterno, tipo apertura, ferramenta). Il
                    commerciale le sceglie quando compila il preventivo e possono
                    avere maggiorazioni di prezzo.
                  </li>
                </ul>
              </div>
            </section>

            {/* Import */}
            <section>
              <h4 className="font-semibold mb-2 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> Import veloce
              </h4>
              <p className="leading-relaxed">
                <strong>Excel/CSV</strong> per caricare in massa da un foglio
                esistente, oppure <strong>Import AI da PDF</strong> per estrarre
                automaticamente articoli + prezzi da un listino fornitore in PDF
                (riconoscimento intelligente delle tabelle).
              </p>
            </section>

            {/* Flusso preventivo */}
            <section className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-3">
              <h4 className="font-semibold mb-1.5 text-emerald-900 dark:text-emerald-100 flex items-center gap-1.5">
                <Package className="h-4 w-4" /> Cosa vede il commerciale nel preventivo
              </h4>
              <ol className="list-decimal list-inside space-y-0.5 text-emerald-950/90 dark:text-emerald-100/90 text-[13px]">
                <li>Sceglie la <strong>macrocategoria</strong> (filtrata per verticale)</li>
                <li>Sceglie la <strong>categoria</strong> figlia</li>
                <li>Sceglie l'<strong>articolo</strong> (con foto se caricata)</li>
                <li>Inserisce <strong>misure libere</strong> → prezzo calcolato live</li>
                <li>Vede la <strong>scheda tecnica</strong> del prodotto (vetro, Uw, ecc.) come riepilogo</li>
              </ol>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
