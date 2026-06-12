/**
 * MarketingDomainGateWall — muro mostrato al posto dell'Email Marketing
 * quando l'azienda non ha ancora un dominio email proprio verificato.
 *
 * Policy: niente dominio proprio → niente campagne. Ogni azienda invia con
 * la reputazione del SUO dominio, mai con quella condivisa della piattaforma.
 */
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, ShieldCheck, TrendingUp, BadgeCheck, ArrowRight } from "lucide-react";

export function MarketingDomainGateWall() {
  const navigate = useNavigate();

  return (
    <Card className="max-w-2xl mx-auto border-orange-200">
      <CardContent className="pt-10 pb-10 text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-sm shadow-orange-200">
          <Globe className="h-8 w-8 text-white" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-950">
            Collega il dominio email della tua azienda
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Per inviare campagne di email marketing devi prima collegare e
            verificare il tuo dominio (es. <strong>tuaazienda.it</strong>).
            Le email partiranno a nome tuo, con il tuo brand.
          </p>
        </div>

        <ul className="text-sm text-left max-w-sm mx-auto space-y-2.5">
          <li className="flex gap-2.5 items-start">
            <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>
              <strong>Mittente professionale</strong> — i clienti ricevono
              email da <em>info@tuaazienda.it</em>, non da un dominio generico
            </span>
          </li>
          <li className="flex gap-2.5 items-start">
            <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>
              <strong>Più consegne in inbox</strong> — SPF e DKIM sul tuo
              dominio aumentano la deliverability
            </span>
          </li>
          <li className="flex gap-2.5 items-start">
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>
              <strong>Reputazione protetta</strong> — ogni azienda invia con
              la propria reputazione, indipendente dalle altre
            </span>
          </li>
        </ul>

        <div className="space-y-2">
          <Button
            size="lg"
            className="gap-2"
            onClick={() => navigate("/azienda/impostazioni/dominio-email")}
          >
            Configura il dominio email
            <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-xs text-slate-500">
            Servono ~5 minuti: aggiungi il dominio, copia i record DNS dal
            pannello del tuo registrar (Aruba, Register, GoDaddy…) e verifica.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
