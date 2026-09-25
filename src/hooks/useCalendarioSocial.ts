import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { PostEsterno } from "@/lib/social/calendario";
import { formatoDaTipo, type PostInstagramReale } from "@/lib/social/griglia";
import type { StatoPubblicazioneSocial } from "@/lib/social/statoPubblicazione";

/**
 * Può approvare o rimandare i post social: titolare, amministratore, super
 * admin (puo_approvare_post_social). Il database lo controlla comunque a ogni
 * approvazione; qui serve solo a mostrare o no i pulsanti.
 */
export function usePuoApprovareSocial(companyId: string | undefined) {
  return useQuery({
    queryKey: ["social-manager", "puo-approvare", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc(
        "puo_approvare_post_social" as never,
        { p_company_id: companyId } as never,
      );
      if (error) throw error;
      return data === true;
    },
  });
}

interface PostPaginaMeta {
  id?: string;
  message?: string;
  created_time?: string;
  permalink_url?: string | null;
  image?: string | null;
}

/**
 * I post pubblicati sulle pagine Facebook nel periodo mostrato, anche quelli
 * fatti fuori dall'app (meta-api-proxy «get-page-posts», permesso di lettura
 * che hanno tutte le aziende collegate). Una pagina che non risponde non
 * ferma le altre: il suo errore torna in `errori`.
 */
export function usePostFacebookEsterni(
  companyId: string | undefined,
  stato: StatoPubblicazioneSocial | null,
  inizio: Date,
  fine: Date,
) {
  const integrazione = stato?.integrazione;
  const pagine = Array.from(
    new Map(
      (stato?.pagine ?? [])
        .filter((p) => p.piattaforma === "facebook")
        .map((p) => [p.pageId, p.nome] as const),
    ),
  );
  const attivo = Boolean(companyId && integrazione && !integrazione.scaduta && pagine.length > 0);

  return useQuery({
    queryKey: [
      "social-manager",
      "post-facebook",
      companyId,
      integrazione?.id,
      pagine.map(([id]) => id).join(","),
      inizio.toISOString(),
      fine.toISOString(),
    ],
    enabled: attivo,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<{ posts: PostEsterno[]; errori: string[] }> => {
      const posts: PostEsterno[] = [];
      const errori: string[] = [];
      await Promise.all(pagine.map(async ([pageId, nome]) => {
        const { data, error } = await supabase.functions.invoke("meta-api-proxy", {
          body: {
            action: "get-page-posts",
            company_id: companyId,
            integration_id: integrazione?.id,
            page_id: pageId,
            since: inizio.toISOString(),
            until: fine.toISOString(),
            limit: 100,
          },
        });
        const letti = (data as { posts?: PostPaginaMeta[] } | null)?.posts;
        if (error || !Array.isArray(letti)) {
          errori.push(nome);
          return;
        }
        for (const p of letti) {
          if (!p.id || !p.created_time) continue;
          posts.push({
            id: String(p.id),
            pageId,
            pagina: nome,
            testo: p.message ?? "",
            quando: p.created_time,
            link: p.permalink_url ?? null,
            immagine: p.image ?? null,
          });
        }
      }));
      return { posts, errori };
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (name: string) => (supabase as any).from(name);

interface RigaStatistichePost {
  post_id: string | null;
  pagina_id: string | null;
  pubblicato_il: string | null;
  tipo: string | null;
  testo: string | null;
  permalink: string | null;
  immagine_url: string | null;
  reazioni: number | null;
  commenti: number | null;
  copertura: number | null;
  salvataggi: number | null;
  visualizzazioni: number | null;
  sincronizzato_il: string | null;
}

/**
 * I post già su Instagram, con foto e numeri: li salva la sincronizzazione
 * delle statistiche (meta-ads-sync-insights, ogni 4 ore) in
 * social_statistiche_post. La griglia li usa al posto di un profilo finto.
 */
export function usePostInstagramReali(companyId: string | undefined) {
  return useQuery({
    queryKey: ["social-manager", "instagram-reali", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PostInstagramReale[]> => {
      const { data, error } = await fromTable("social_statistiche_post")
        .select("post_id,pagina_id,pubblicato_il,tipo,testo,permalink,immagine_url,reazioni,commenti,copertura,salvataggi,visualizzazioni,sincronizzato_il")
        .eq("company_id", companyId ?? "")
        .eq("piattaforma", "instagram")
        .order("pubblicato_il", { ascending: false })
        .limit(60);
      if (error) throw error;
      return ((data ?? []) as RigaStatistichePost[])
        .filter((r) => r.post_id && r.pagina_id && r.pubblicato_il)
        .map((r) => ({
          postId: String(r.post_id),
          pageId: String(r.pagina_id),
          quando: String(r.pubblicato_il),
          formato: formatoDaTipo(r.tipo),
          testo: r.testo ?? "",
          link: r.permalink ?? null,
          immagine: r.immagine_url ?? null,
          numeri: {
            reazioni: r.reazioni,
            commenti: r.commenti,
            copertura: r.copertura,
            salvataggi: r.salvataggi,
            visualizzazioni: r.visualizzazioni,
          },
          sincronizzatoIl: r.sincronizzato_il ?? null,
        }));
    },
  });
}
