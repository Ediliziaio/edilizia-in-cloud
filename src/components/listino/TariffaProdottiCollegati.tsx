/**
 * TariffaProdottiCollegati — pannello reverse: dato una tariffa,
 * mostra i prodotti del listino (article_families) che la usano
 * come manodopera default.
 *
 * Aggancia: SettingsTariffe → dialog tariffa → tab/sezione "Prodotti
 * collegati". Permette di scollegare la tariffa da un prodotto con un
 * click (setta posa_tariffa_default_id=NULL su quella family).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { invalidaListinoNelPreventivatore } from "@/lib/serramenti/cacheListino";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Unlink, Package, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ArticleFamilyLinked {
  id: string;
  nome: string;
  vertical: string | null;
  posa_quantita_default: number | null;
  posa_linked: boolean | null;
  manodopera_modalita: string | null;
}

interface Props {
  tariffaId: string;
  tariffaName: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientDb = { from: (tabella: string) => any };

/** I prodotti collegati alla tariffa, senza quelli nel cestino (05/10/2026). */
export async function caricaProdottiCollegati(
  sb: ClientDb,
  tariffaId: string,
): Promise<ArticleFamilyLinked[]> {
  const { data, error } = await sb
    .from("article_families")
    .select("id, nome, vertical, posa_quantita_default, posa_linked, manodopera_modalita")
    .eq("posa_tariffa_default_id", tariffaId)
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ArticleFamilyLinked[];
}

/**
 * Scollega la tariffa da un prodotto (05/10/2026). Si toglie il collegamento;
 * la posa passa a «nessuna» solo se il prodotto la prendeva da questa tariffa
 * (modalità «tariffa»). Prima diventava «nessuna» sempre: un prodotto con la
 * posa a prezzo manuale e un vecchio collegamento rimasto perdeva la sua posa.
 * La modalità la decide la riga nel database al momento dell'aggiornamento,
 * non l'elenco a schermo, che può essere vecchio.
 *
 * Ritorna la modalità della posa del prodotto; null se non c'era niente da
 * scollegare (già fatto altrove, o niente permesso di modificare il listino).
 */
export async function scollegaTariffaDaProdotto(
  sb: ClientDb,
  familyId: string,
  tariffaId: string,
): Promise<string | null> {
  const { data: daTariffa, error: errTariffa } = await sb
    .from("article_families")
    .update({ posa_tariffa_default_id: null, manodopera_modalita: "nessuna" })
    .eq("id", familyId)
    .eq("posa_tariffa_default_id", tariffaId)
    .eq("manodopera_modalita", "tariffa")
    .select("id");
  if (errTariffa) throw errTariffa;
  if ((daTariffa ?? []).length > 0) return "tariffa";
  const { data: altri, error: errAltri } = await sb
    .from("article_families")
    .update({ posa_tariffa_default_id: null })
    .eq("id", familyId)
    .eq("posa_tariffa_default_id", tariffaId)
    .select("id, manodopera_modalita");
  if (errAltri) throw errAltri;
  return ((altri ?? []) as Array<{ manodopera_modalita: string | null }>)[0]?.manodopera_modalita ?? null;
}

/** Cosa dire dopo «Scollega», secondo la posa che il prodotto aveva. */
export function esitoScollegamento(modalita: string | null): { fatto: boolean; testo: string } {
  switch (modalita) {
    case "tariffa":
      return { fatto: true, testo: "Prodotto scollegato. I preventivi futuri non avranno più manodopera automatica." };
    case "manuale":
      return { fatto: true, testo: "Tariffa scollegata. Il prodotto tiene la sua posa a prezzo manuale." };
    case null:
      return {
        fatto: false,
        testo: "Niente da scollegare: il prodotto era già scollegato, o non hai il permesso di modificare il listino.",
      };
    default:
      return { fatto: true, testo: "Tariffa scollegata." };
  }
}

export function TariffaProdottiCollegati({ tariffaId, tariffaName }: Props) {
  const qc = useQueryClient();
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["tariffa-prodotti-collegati", tariffaId],
    queryFn: () => caricaProdottiCollegati(supabase as unknown as ClientDb, tariffaId),
    enabled: !!tariffaId,
    staleTime: 30 * 1000,
  });

  const unlinkMut = useMutation({
    mutationFn: (familyId: string) =>
      scollegaTariffaDaProdotto(supabase as unknown as ClientDb, familyId, tariffaId),
    onMutate: (familyId: string) => setUnlinkingId(familyId),
    onSuccess: (modalita) => {
      qc.invalidateQueries({ queryKey: ["tariffa-prodotti-collegati", tariffaId] });
      // Come dopo ogni modifica di un prodotto (useFamilyMutations): riaperto
      // dalla cache vecchia, il prodotto mostrerebbe ancora la tariffa e la
      // rimetterebbe al primo salvataggio; il preventivo serramenti ha le sue chiavi.
      qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
      invalidaListinoNelPreventivatore(qc);
      const esito = esitoScollegamento(modalita);
      if (esito.fatto) toast.success(esito.testo);
      else toast.info(esito.testo);
    },
    onError: (e) => toast.error("Scollegamento fallito", { description: String(e) }),
    onSettled: () => setUnlinkingId(null),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          <Link2 className="h-3 w-3 inline mr-1" />
          Prodotti del listino che usano <strong>{tariffaName}</strong> come manodopera automatica
          {products.length > 0 && ` (${products.length})`}
        </p>
      </div>

      {products.length === 0 ? (
        <Card className="p-4 text-center bg-slate-50">
          <Package className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">
            Nessun prodotto usa questa tariffa come manodopera automatica.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Vai in <strong>Listino → modifica un prodotto → sezione Manodopera</strong> per collegarlo.
          </p>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-md border border-emerald-100 bg-emerald-50/30 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{p.nome}</p>
                <p className="text-[11px] text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                  {p.vertical && <span>📦 {p.vertical}</span>}
                  {p.posa_quantita_default != null && (
                    <span>× {Number(p.posa_quantita_default).toLocaleString("it-IT")}</span>
                  )}
                  {p.posa_linked && (
                    <span className="text-emerald-700">🔗 sync attiva</span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unlinkMut.mutate(p.id)}
                disabled={unlinkingId === p.id}
                className="h-8 text-xs text-rose-600 hover:bg-rose-50"
              >
                {unlinkingId === p.id ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Unlink className="h-3 w-3 mr-1" />
                )}
                Scollega
              </Button>
            </div>
          ))}
          <a
            href="/azienda/impostazioni/listino"
            className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 mt-2"
          >
            <ExternalLink className="h-3 w-3" /> Vai al listino per collegarne altri
          </a>
        </div>
      )}
    </div>
  );
}
