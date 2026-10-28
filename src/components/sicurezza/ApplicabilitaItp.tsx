import { useState } from "react";
import type { VerificaItp } from "@/lib/sicurezza/itp";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
import { nomeTitolare } from "@/lib/sicurezza/soggettiItp";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const applicabilita = {
  da_chiarire: "Da chiarire",
  applicabile: "Applicabile",
  non_applicabile: "Escluso nella valutazione",
};
const esiti = {
  da_verificare: "Da verificare",
  conforme: "Conforme registrato",
  non_conforme: "Non conforme registrato",
  non_applicabile: "Non applicabile registrato",
};
/** A view of the recorded assessment, never a new completeness or eligibility decision. */
export function ApplicabilitaItp({
  verifica: v,
  evidenze,
  riesame,
}: {
  verifica: VerificaItp;
  evidenze: readonly EvidenzaFascicolo[];
  riesame: boolean;
}) {
  const [cerca, setCerca] = useState("");
  const [filtro, setFiltro] = useState("tutti");
  const [limite, setLimite] = useState(20);
  const righe = v.criteri.filter(
    (c) =>
      (filtro === "tutti" || c.applicabilita === filtro) &&
      `${c.titolo} ${nomeTitolare(c, v.soggetti ?? undefined)} ${c.riferimento} ${c.note}`
        .toLocaleLowerCase("it")
        .includes(cerca.trim().toLocaleLowerCase("it")),
  );
  return (
    <section
      aria-label="Applicabilità documentale registrata"
      className="space-y-3 border-t pt-3"
    >
      <div>
        <h5 className="font-medium">Applicabilità documentale registrata</h5>
        <p className="text-xs text-muted-foreground">
          Criteri della verifica v{v.versione}, riferiti a lavori, periodo e
          fase indicati sopra. Le esclusioni valgono per questo ambito. Non
          rappresentano tutti i requisiti della commessa.
        </p>
      </div>
      {riesame && (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
        >
          Valutazione da riesaminare: fonti o contesto cambiati, oppure
          confronto non disponibile. Gli esiti qui sotto sono quelli registrati.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Cerca criteri di applicabilità"
          className="min-w-44 flex-1"
          placeholder="Requisito, titolare, riferimento…"
          value={cerca}
          onChange={(e) => {
            setCerca(e.target.value);
            setLimite(20);
          }}
        />
        <select
          aria-label="Filtra applicabilità"
          className="h-10 rounded-md border bg-background px-2 text-sm"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value);
            setLimite(20);
          }}
        >
          <option value="tutti">Tutti i criteri ({v.criteri.length})</option>
          {Object.entries(applicabilita).map(([id, titolo]) => (
            <option key={id} value={id}>
              {titolo} ({v.criteri.filter((c) => c.applicabilita === id).length}
              )
            </option>
          ))}
        </select>
      </div>
      {!v.criteri.length ? (
        <p className="text-sm text-amber-700">
          Nessun criterio registrato in questa valutazione. Non indica assenza
          di requisiti.
        </p>
      ) : !righe.length ? (
        <p className="text-sm text-muted-foreground">
          Nessun criterio corrisponde ai filtri.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[600px] text-left text-xs">
              <caption className="sr-only">
                Requisiti, titolari, decisioni e prove della verifica ITP
                registrata
              </caption>
              <thead className="bg-muted">
                <tr>
                  {[
                    "Requisito e titolare",
                    "Decisione registrata",
                    "Riferimento e motivazione",
                    "Prove esaminate",
                  ].map((t) => (
                    <th key={t} scope="col" className="p-2 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {righe.slice(0, limite).map((c) => (
                  <tr key={c.id} className="border-t align-top">
                    <td className="p-2">
                      <p className="font-medium">
                        {c.titolo || "Criterio senza titolo"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {nomeTitolare(c, v.soggetti ?? undefined)}
                      </p>
                      {c.profilo_snapshot && (
                        <p className="mt-1 text-muted-foreground">
                          Profilo {c.profilo_snapshot.nome} · v
                          {c.profilo_snapshot.versione}
                        </p>
                      )}
                    </td>
                    <td className="p-2">
                      <p>{applicabilita[c.applicabilita]}</p>
                      <p className="mt-1 text-muted-foreground">
                        {esiti[c.esito]}
                      </p>
                      {c.applicabilita === "non_applicabile" &&
                        (!c.note.trim() || !c.riferimento.trim()) && (
                          <p className="mt-1 text-amber-700">
                            Esclusione incompleta: motivazione e riferimento da
                            integrare.
                          </p>
                        )}
                    </td>
                    <td className="p-2 whitespace-pre-wrap">
                      <p>{c.riferimento || "Riferimento non indicato"}</p>
                      <p className="mt-1 text-muted-foreground">
                        {c.note || "Motivazione / note non indicate"}
                      </p>
                    </td>
                    <td className="p-2">
                      {!c.evidenze.length ? (
                        <p>
                          {c.applicabilita === "non_applicabile"
                            ? "Esclusione da valutare sui riferimenti indicati"
                            : "Nessuna prova collegata"}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {c.evidenze.map((id) => {
                            const prima = v.evidenze.find((e) => e.id === id);
                            const ora = evidenze.find(
                              (e) =>
                                e.id === id &&
                                e.company_id === v.company_id &&
                                (!e.order_id || e.order_id === v.order_id) &&
                                (!e.subappaltatore_id ||
                                  e.subappaltatore_id === v.subappaltatore_id),
                            );
                            const cambiata =
                              !prima ||
                              !ora ||
                              ora.updated_at !== prima.updated_at ||
                              ora.file_path !== prima.file_path ||
                              ora.stato === "superato";
                            return (
                              <li key={id}>
                                <p>
                                  {prima?.titolo ||
                                    "Prova non presente nella registrazione"}
                                </p>
                                <p
                                  className={`mt-1 ${cambiata ? "text-amber-700" : "text-muted-foreground"}`}
                                >
                                  {cambiata
                                    ? "Fonte cambiata o non disponibile: da riesaminare"
                                    : "Stessa versione del record esaminato"}
                                </p>
                                {prima?.file_name && (
                                  <p className="mt-1 text-muted-foreground break-all">
                                    {prima.file_name}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {righe.length > limite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLimite((n) => n + 20)}
            >
              Mostra altri criteri ({righe.length - limite})
            </Button>
          )}
        </>
      )}
    </section>
  );
}
