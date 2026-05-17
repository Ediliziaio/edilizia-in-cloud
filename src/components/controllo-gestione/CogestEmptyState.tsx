/**
 * CogestEmptyState — MP-DIR-001 Fase 2.1
 *
 * Mostrato dentro la Dashboard del Controllo di Gestione quando la company
 * ha la feature `controllo_gestione_v1` attiva ma NON ha ancora dati
 * (0 movimenti, 0 budget). Sostituisce i KPI vuoti con una landing che
 * spiega il valore del modulo e offre CTA chiare.
 *
 * Differente da `AddonNotActivePlaceholder` (mostrato quando la feature è OFF):
 * questo invece appare quando la feature è ATTIVA ma il modulo è vuoto.
 *
 * Demo data: già seedato via migration `cg_seed_demo_*` per le aziende create
 * via flow demo. Per aziende reali con 0 dati la CTA principale è
 * "Configurazione" dove si imposta classificazione + scenari.
 */
import { Link } from "react-router-dom";
import {
  TrendingUp, Target, Banknote, ArrowRight, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ValueCardProps {
  icon: typeof TrendingUp;
  iconClass: string;
  title: string;
  desc: string;
}

function ValueCard({ icon: Icon, iconClass, title, desc }: ValueCardProps) {
  return (
    <Card className="border-2 hover:border-primary/30 transition-colors">
      <CardContent className="p-5">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-bold text-base mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-snug">{desc}</p>
      </CardContent>
    </Card>
  );
}

export function CogestEmptyState() {
  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 items-center justify-center shadow-sm">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          Smetti di guardare il bilancio una volta all&apos;anno.
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Il Controllo di Gestione ti dice ogni mese quanto stai facendo, su quali
          cantieri stai perdendo, dove tagliare costi e quanto cash avrai fra 90 giorni.
        </p>
      </div>

      {/* 3 value cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ValueCard
          icon={TrendingUp}
          iconClass="bg-emerald-100 text-emerald-700"
          title="Margine cantiere"
          desc="Vedi cantiere per cantiere quanto stai guadagnando davvero, costi inclusi. Smetti di scoprirlo a fine anno."
        />
        <ValueCard
          icon={Target}
          iconClass="bg-blue-100 text-blue-700"
          title="Budget vs Actual"
          desc="Imposta il budget annuale e ricevi alert mensili sugli scostamenti. Sai subito dove correggere."
        />
        <ValueCard
          icon={Banknote}
          iconClass="bg-amber-100 text-amber-700"
          title="Cash flow 90gg"
          desc="Forecast dei prossimi 90 giorni basato su scadenze attive, passive e payback medio. Niente sorprese."
        />
      </div>

      {/* CTA */}
      <div className="space-y-3 text-center">
        <Button asChild size="lg" className="gap-2">
          <Link to="/azienda/controllo-gestione/configurazione">
            Inizia dalla classificazione voci
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Configura piano dei conti, aliquote IRES/IRAP e note → poi i tab Bilancio, Budget
          e Marginalità si popolano automaticamente.
        </p>
      </div>

      {/* Footer info */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4 text-sm text-slate-600 space-y-2">
          <p>
            <strong className="text-slate-900">Da dove arrivano i dati?</strong> Il modulo
            riclassifica automaticamente i movimenti di prima nota, le fatture attive/passive,
            i finanziamenti e gli ordini. Non serve inserire nulla a mano se hai già usato
            Tesoreria e Fatturazione.
          </p>
          <p>
            <strong className="text-slate-900">Quando attivarlo?</strong> Quando inizi a fare
            bilancio mensile (non solo annuale), quando vuoi capire quali cantieri sono
            realmente profittevoli, o quando devi presentare un pacchetto banca aggiornato.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
