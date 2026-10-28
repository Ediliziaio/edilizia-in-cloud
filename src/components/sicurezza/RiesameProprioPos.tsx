import { Button } from "@/components/ui/button";
import {
  useRiesameProprioPos,
  apriOriginaleRiesamePos,
} from "@/hooks/useRiesameProprioPos";
import { useState } from "react";
import { toast } from "sonner";

export function RiesameProprioPos({
  companyId,
  orderId,
  id,
}: {
  companyId: string;
  orderId: string;
  id: string;
}) {
  const q = useRiesameProprioPos(companyId, orderId, id);
  const [aprendo, setAprendo] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Controllo dei soli addetti della propria impresa, per attività, fase e
        periodo del riesame. L’organico dei subappaltatori resta nei rispettivi
        fascicoli.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={q.isFetching}
        onClick={() => q.refetch()}
      >
        {q.isFetching ? "Controllo delle fonti…" : "Ricontrolla le fonti"}
      </Button>
      {q.isLoading ? (
        <p role="status">Verifica di organico, requisiti e originali…</p>
      ) : q.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p className="font-medium">Riesame da aggiornare</p>
          <p>{q.error.message}</p>
          <p className="mt-2">
            Correggi la fonte e registra una nuova revisione nella commessa.
          </p>
        </div>
      ) : (
        q.data && (
          <>
            <div className="rounded-lg border p-4 text-sm space-y-1">
              <p className="font-medium">{q.data.attivita}</p>
              <p>
                {q.data.dal}–{q.data.al} · Rev. {q.data.revisione} ·{" "}
                {q.data.persone.length} addetti · {q.data.riscontri.length}{" "}
                riscontri
              </p>
              <p>
                Riesame di {q.data.responsabile} · {q.data.ruolo_responsabile}
              </p>
              <p className="text-muted-foreground">
                Fonti rilette{" "}
                {new Date(q.dataUpdatedAt).toLocaleTimeString("it-IT")} ·
                aggiornamento ogni 30 secondi
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Riscontri nominativi della propria impresa
                </caption>
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3">Addetto e requisito</th>
                    <th className="p-3">Evidenza e periodo</th>
                    <th className="p-3">Riesame</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.riscontri.map((r) => (
                    <tr
                      className="border-t align-top"
                      key={`${r.persona_id}:${r.profilo_id}:${r.requisito_id}`}
                    >
                      <td className="p-3 min-w-44">
                        <p className="font-medium">{r.nominativo}</p>
                        <p className="text-muted-foreground">
                          {r.mansione || "Mansione non indicata"}
                        </p>
                        {(
                          q.data.persone.find((p) => p.id === r.persona_id)
                            ?.periodi || []
                        ).map((p, i) => (
                          <p
                            className="mt-1 text-xs text-muted-foreground"
                            key={`${p.fonte_id}:${i}`}
                          >
                            Periodo assegnato: {p.dal}–{p.al}
                            {p.senza_date &&
                              " · assegnazione senza date, periodo dichiarato nel riesame"}
                          </p>
                        ))}
                        <p className="mt-2">{r.titolo}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.profilo_nome} · v{r.profilo_versione}
                        </p>
                      </td>
                      <td className="p-3 min-w-44">
                        {r.qualifica ? (
                          <>
                            <p>{r.qualifica.dati.titolo}</p>
                            <p className="text-muted-foreground">
                              {r.qualifica.dati.ente}
                            </p>
                            <p>
                              {r.qualifica.dati.validita_dal}–
                              {r.qualifica.dati.validita_al ||
                                "senza scadenza dichiarata"}
                            </p>
                            {r.qualifica.dati.limitazioni && (
                              <p className="mt-1">
                                Limiti: {r.qualifica.dati.limitazioni}
                              </p>
                            )}
                            <Button
                              variant="link"
                              size="sm"
                              disabled={aprendo || q.isFetching}
                              onClick={async () => {
                                if (!r.qualifica) return;
                                setAprendo(true);
                                try {
                                  await apriOriginaleRiesamePos(
                                    companyId,
                                    orderId,
                                    id,
                                    r.persona_id,
                                    r.qualifica.fonte_id,
                                    r.qualifica.fonte_impronta,
                                  );
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error
                                      ? e.message
                                      : "Originale non disponibile",
                                  );
                                } finally {
                                  setAprendo(false);
                                }
                              }}
                            >
                              Apri originale formativo
                            </Button>
                          </>
                        ) : (
                          "Non applicabile, con motivazione"
                        )}
                      </td>
                      <td className="p-3 min-w-44">
                        <p className="font-medium">
                          {r.esito === "riesaminata"
                            ? "Evidenza riesaminata"
                            : "Non applicabile"}
                        </p>
                        <p>{r.motivazione}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Questo controllo non inserisce dati nel POS e non ne approva
              l’emissione. Il collegamento alla lavorazione richiede una
              selezione e conferma nell’editor POS. Gli originali vengono
              conservati nel pacchetto soltanto nell’emissione completata. Non è
              un giudizio di idoneità né un permesso d’accesso.
            </p>
          </>
        )
      )}
    </div>
  );
}
