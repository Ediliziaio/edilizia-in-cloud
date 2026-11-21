import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "./useDebounce";
import { queryKeys } from "@/lib/queryKeys";
import { filtriRicercaContatti, filtriRicercaParole } from "@/lib/ricerca/ricercaContatti";

export interface SearchResult {
  id: string;
  type: "order" | "customer" | "contact" | "ticket" | "quote";
  title: string;
  subtitle: string;
  url: string;
  icon: string;
  cestinato?: boolean;
}

export function useGlobalSearch(query: string, companyId: string | undefined, includiCestino = false) {
  const debouncedQuery = useDebounce(query, 250);

  return useQuery<SearchResult[]>({
    queryKey: queryKeys.globalSearch.results(companyId, debouncedQuery, includiCestino),
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];

      // `%` e `_` sono jolly in un ilike: chi cerca "50%" cerca "50%". Virgole e
      // parentesi sono la sintassi di .or(): «Rossi, Mario» faceva fallire in
      // silenzio ordini e preventivi.
      const pattern = `%${debouncedQuery.replace(/[,()]/g, " ").trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

      // Tutte in parallelo. Una che fallisce (permesso, tabella non leggibile)
      // non deve azzerare la ricerca: si mostra quello che si è trovato.
      const orders = supabase.from("orders").select("id, order_code, description, deleted_at").eq("company_id", companyId!);
      const quotes = supabase.from("quotes").select("id, quote_number, title, client_name, deleted_at").eq("company_id", companyId!);
      const trovaOrdini = (q: typeof orders) => q.or(`order_code.ilike.${pattern},description.ilike.${pattern}`).limit(5);
      const trovaPreventivi = (q: typeof quotes) => q.or(`quote_number.ilike.${pattern},title.ilike.${pattern},client_name.ilike.${pattern}`).limit(5);
      const [ordersRes, customersRes, contactsRes, ticketsRes, quotesRes, ordiniCestinati, preventiviCestinati] = await Promise.all([
        trovaOrdini(orders.is("deleted_at", null)),
        // `profiles` NON ha una colonna `role_type`: il filtro che c'era qui
        // faceva fallire la query con 400, quindi la ricerca globale non ha mai
        // trovato un cliente — e i clienti sono la cosa che si cerca di più.
        // Il ruolo si filtra dopo, su `user_roles`, come fa useCompanyCustomers.
        (() => {
          let q = supabase.from("profiles").select("id, first_name, last_name, business_name, email, phone")
            .eq("company_id", companyId!);
          for (const filtro of filtriRicercaParole(debouncedQuery, ["first_name", "last_name", "business_name", "email", "phone"])) q = q.or(filtro);
          return q.limit(15);
        })(),
        // Contatti: ogni parola in nome, cognome, email o telefono, e un numero
        // nel telefono. Prima «Lia Logar», «RoccoPagnotta» e i numeri non si
        // trovavano. Chi vede solo i suoi li trova tutti: titolare, call center
        // o follower (lo decidono le regole di lettura del database).
        (() => {
          const filtri = filtriRicercaContatti(debouncedQuery);
          if (filtri.length === 0) return Promise.resolve({ data: [], error: null });
          let q = supabase
            .from("marketing_contacts")
            .select("id, first_name, last_name, email, phone")
            .eq("company_id", companyId!)
            .is("deleted_at", null);
          for (const filtro of filtri) q = q.or(filtro);
          return q.order("created_at", { ascending: false }).limit(8);
        })(),
        supabase.from("tickets").select("id, subject, status").eq("company_id", companyId!)
          .ilike("subject", pattern)
          .limit(5),
        // I preventivi mancavano del tutto: si cercano per numero, titolo o
        // cliente, che è esattamente come li si nomina al telefono.
        trovaPreventivi(quotes.is("deleted_at", null)),
        includiCestino ? trovaOrdini(supabase.from("orders").select("id, order_code, description, deleted_at")
          .eq("company_id", companyId!).not("deleted_at", "is", null)) : null,
        includiCestino ? trovaPreventivi(supabase.from("quotes").select("id, quote_number, title, client_name, deleted_at")
          .eq("company_id", companyId!).not("deleted_at", "is", null)) : null,
      ]);

      // Fra i profili trovati teniamo solo i clienti veri: senza questo passo
      // uscirebbero anche operai e staff, che qui non c'entrano.
      const profiliTrovati = customersRes.data ?? [];
      let idClienti = new Set<string>();
      if (profiliTrovati.length > 0) {
        const { data: ruoli } = await supabase.from("user_roles").select("user_id")
          .eq("role", "customer")
          .in("user_id", profiliTrovati.map((p) => p.id));
        idClienti = new Set((ruoli ?? []).map((r) => r.user_id));
      }

      const results: SearchResult[] = [];

      for (const o of [...(ordersRes.data ?? []), ...(ordiniCestinati?.data ?? [])]) {
        results.push({
          id: o.id,
          type: "order",
          title: o.order_code || "Ordine",
          subtitle: o.description ?? "",
          url: `/azienda/ordini/${o.id}`,
          icon: "Package",
          cestinato: !!o.deleted_at,
        });
      }

      for (const c of customersRes.data ?? []) {
        if (!idClienti.has(c.id)) continue;
        const nome = (c.business_name ?? "").trim() || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
        results.push({
          id: c.id,
          type: "customer",
          title: nome || c.email || "Cliente",
          subtitle: c.email ?? c.phone ?? "",
          url: `/azienda/clienti/${c.id}`,
          icon: "User",
        });
      }

      for (const q of [...(quotesRes.data ?? []), ...(preventiviCestinati?.data ?? [])]) {
        results.push({
          id: q.id as string,
          type: "quote",
          title: q.title || q.quote_number || "Preventivo",
          subtitle: [q.quote_number, q.client_name].filter(Boolean).join(" · "),
          url: `/azienda/marketing/preventivi/${q.id}`,
          icon: "FileText",
          cestinato: !!q.deleted_at,
        });
      }

      for (const c of contactsRes.data ?? []) {
        results.push({
          id: c.id,
          type: "contact",
          title: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.phone || c.email || "Contatto",
          subtitle: [c.phone, c.email].filter(Boolean).join(" · "),
          url: `/azienda/marketing/contatti/${c.id}`,
          icon: "UserCircle",
        });
      }

      for (const t of ticketsRes.data ?? []) {
        results.push({
          id: t.id,
          type: "ticket",
          title: t.subject,
          subtitle: `Stato: ${t.status}`,
          url: `/azienda/assistenza/${t.id}`,
          icon: "MessageSquare",
        });
      }

      return results;
    },
    enabled: !!companyId && debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}
