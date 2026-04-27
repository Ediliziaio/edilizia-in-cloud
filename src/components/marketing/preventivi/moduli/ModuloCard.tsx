import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuloVenditaView } from "@/lib/moduli-vendita";

interface ModuloCardProps {
  view: ModuloVenditaView;
  onLockedClick: (view: ModuloVenditaView) => void;
}

/**
 * Card singola di un modulo di vendita verticale.
 *
 * Stati visuali:
 *  - "attivo":      cliccabile, link al modulo, badge verde "Attivo"
 *  - "coming_soon": disabilitato visivamente, badge "In arrivo"
 *  - "bloccato":    cliccabile, apre il dialog di richiesta attivazione
 *                   (badge "Premium" + icona lucchetto)
 */
export function ModuloCard({ view, onLockedClick }: ModuloCardProps) {
  const { modulo, stato } = view;
  const Icon = modulo.icon;

  if (stato === "attivo") {
    return (
      <Card
        className="group relative overflow-hidden border-2 border-transparent transition-all hover:border-primary/50 hover:shadow-lg"
      >
        <Link
          to={modulo.href}
          className="absolute inset-0 z-10"
          aria-label={`Apri modulo ${modulo.nome}`}
        />
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-500">
              Attivo
            </Badge>
          </div>
          <div>
            <CardTitle className="text-lg">{modulo.nome}</CardTitle>
            <CardDescription className="line-clamp-2 mt-1">{modulo.tagline}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
            Apri modulo
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stato === "coming_soon") {
    return (
      <Card className="relative overflow-hidden border-dashed opacity-80">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <Badge variant="secondary">
              <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
              In arrivo
            </Badge>
          </div>
          <div>
            <CardTitle className="text-lg text-muted-foreground">{modulo.nome}</CardTitle>
            <CardDescription className="line-clamp-2 mt-1">{modulo.tagline}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="ghost" size="sm" disabled className="w-full justify-start px-0">
            Disponibile prossimamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // stato === "bloccato"
  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-2 border-transparent transition-all",
        "hover:border-primary/40 hover:shadow-md cursor-pointer",
      )}
    >
      <button
        type="button"
        onClick={() => onLockedClick(view)}
        className="absolute inset-0 z-10"
        aria-label={`Richiedi attivazione modulo ${modulo.nome}`}
      />
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary">
            <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
            Premium
          </Badge>
        </div>
        <div>
          <CardTitle className="text-lg">{modulo.nome}</CardTitle>
          <CardDescription className="line-clamp-2 mt-1">{modulo.tagline}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
          Scopri e attiva
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}
