import { useState } from "react";
import { ClipboardCheck, Clock3, HardHat, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { flussoPersona, type RegoleCampo } from "@/lib/campo/regoleCampo";

/** Usa la stessa decisione dell'app Campo: l'anteprima non inventa un secondo flusso. */
export function RegoleCampoAnteprima({ regole, modificato, dettagli, evidenziata }: {
  regole: RegoleCampo; modificato: boolean; dettagli: string[]; evidenziata?: boolean;
}) {
  const [esisteCapo, setEsisteCapo] = useState(true);
  const operaio = flussoPersona(regole, { esisteCapo });
  const responsabile = flussoPersona(regole, { esisteCapo, isCapocantiere: true });
  return (
    <SezioneImpostazione id="in-pratica" titolo="In pratica, con queste scelte"
      evidenziata={evidenziata}
      descrizione="Prova i due casi per vedere cosa cambia nell’app di cantiere."
      ambito={<Badge variant={modificato ? "outline" : "secondary"} className="font-normal">{modificato ? "Anteprima della bozza" : "Configurazione attuale"}</Badge>}
    >
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Scenario dell’anteprima">
          <Button type="button" size="sm" variant={esisteCapo ? "secondary" : "ghost"} aria-pressed={esisteCapo} onClick={() => setEsisteCapo(true)} className="h-auto min-h-10 whitespace-normal px-2 text-xs">Con responsabile</Button>
          <Button type="button" size="sm" variant={!esisteCapo ? "secondary" : "ghost"} aria-pressed={!esisteCapo} onClick={() => setEsisteCapo(false)} className="h-auto min-h-10 whitespace-normal px-2 text-xs">Senza responsabile</Button>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3" role="region" aria-label="Cosa fa l’operaio">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><HardHat className="h-4 w-4 text-primary" aria-hidden="true" />Operaio</div>
          <p className="text-sm">{operaio.soloTimbratura ? "Timbra entrata e uscita. Il racconto e le presenze li registra il responsabile."
            : operaio.soloOre ? "Conferma solo le proprie ore. Lavori, foto, materiali e avanzamento li racconta il responsabile."
            : "Compila il proprio giornaliero: ore, lavori svolti, foto, materiali e avanzamento."}</p>
        </div>
        {esisteCapo ? (
          <div className="rounded-lg border bg-muted/20 p-3" role="region" aria-label="Cosa fa il responsabile">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" aria-hidden="true" />Capocantiere / caposquadra</div>
            <p className="text-sm">Racconta i lavori del cantiere o della propria squadra, con foto, materiali e avanzamento.</p>
            <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{!responsabile.registraSquadra ? "Conferma solo le proprie ore, senza inserire le presenze degli altri."
              : regole.oreDalle === "timbrature" ? "Controlla le ore proposte dalle timbrature; completa quelle mancanti e può correggerle."
              : "Inserisce a mano le ore delle persone presenti nella squadra."}</p>
          </div>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Senza un responsabile assegnato alla commessa, ogni operaio compila il proprio giornaliero completo, qualunque sia il flusso scelto.</p>
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />L’ufficio controlla e approva il rapportino nella commessa. La firma del cliente è un passaggio separato.</p>
        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Dettagli del flusso e casi particolari</summary>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-xs text-muted-foreground">{dettagli.map((riga) => <li key={riga}>{riga}</li>)}</ul>
        </details>
        <p className="text-[11px] text-muted-foreground">La prova non registra presenze. Le modifiche diventano operative con «Salva modifiche».</p>
      </div>
    </SezioneImpostazione>
  );
}
