/**
 * Pagina Social: «collegata» dice il vero, «Crea post» in tre passi, errori veri (24/09/2026).
 *
 * - Una pagina è «pronta» solo se il database lo dice pagina per pagina
 *   (stato_pubblicazione_social): token valido, permesso di Meta, account
 *   Instagram professionale. Prima bastava una riga in social_accounts, e un
 *   post programmato su una pagina senza permesso falliva all'ora stabilita.
 * - Il composer parte dalle sole piattaforme pronte e da «Pubblica ora».
 * - Un errore di caricamento si dice, con «Riprova»: prima finiva in un
 *   console.warn e la pagina mostrava i dati rimasti nel browser.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateSocialDraft, type SocialPlatformRule } from "@/lib/social/publishing";
import {
  leggiStatoPubblicazione,
  motivoComune,
  motivoPiattaforma,
  paginePronte,
  piattaformePronte,
  spiegaMotivo,
} from "@/lib/social/statoPubblicazione";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

// Risposta vera della RPC per BeMade e Green Energy, 24/09/2026.
const BEMADE = {
  modalita_post: "revisione",
  integrazione: { id: "i-1", stato: "connected", scade_il: "2026-11-13T18:05:34+00:00", scaduta: false, permessi_noti: true },
  pagine: [
    { id: "a", nome: "Bemade.", motivo: "ok", page_id: "107319265374665", piattaforma: "facebook", puo_pubblicare: true },
    { id: "b", nome: "bemade.salotti", motivo: "ok", page_id: "107319265374665", piattaforma: "instagram", puo_pubblicare: true },
  ],
};
const GREEN_ENERGY = {
  modalita_post: "revisione",
  integrazione: { id: "i-2", stato: "connected", scade_il: null as string | null, scaduta: false, permessi_noti: true },
  pagine: [
    { id: "c", nome: "Energia Più SRL", motivo: "in_approvazione_meta", page_id: "887506151103879", piattaforma: "facebook", puo_pubblicare: false },
    { id: "d", nome: "Greenenergy Group", motivo: "in_approvazione_meta", page_id: "104952581186441", piattaforma: "facebook", puo_pubblicare: false },
  ],
};

describe("stato di pubblicazione delle pagine", () => {
  it("legge la risposta della RPC e dice chi è pronto", () => {
    const stato = leggiStatoPubblicazione(BEMADE);
    expect(stato.modalitaPost).toBe("revisione");
    expect(stato.integrazione).toMatchObject({ id: "i-1", permessiNoti: true, scaduta: false });
    expect(piattaformePronte(stato)).toEqual(["facebook", "instagram"]);
    expect(paginePronte(stato)).toEqual([
      { platform_id: "facebook", page_id: "107319265374665", page_name: "Bemade." },
      { platform_id: "instagram", page_id: "107319265374665", page_name: "bemade.salotti" },
    ]);
  });

  it("una pagina senza permesso non è pronta, e il motivo si dice una volta", () => {
    const stato = leggiStatoPubblicazione(GREEN_ENERGY);
    expect(piattaformePronte(stato)).toEqual([]);
    expect(motivoPiattaforma(stato, "facebook")).toBe("in_approvazione_meta");
    expect(motivoPiattaforma(stato, "linkedin")).toBeNull();
    expect(motivoComune(stato)).toBe("in_approvazione_meta");
    expect(spiegaMotivo("in_approvazione_meta").lungo).toContain("in attesa dell'approvazione di Meta");
  });

  it("nel dubbio non pubblica: sì senza «ok», motivo sconosciuto, dati storti", () => {
    const stato = leggiStatoPubblicazione({
      pagine: [
        { id: "x", nome: "A", motivo: "token_scaduto", page_id: "1", piattaforma: "facebook", puo_pubblicare: true },
        { id: "y", nome: "B", motivo: "boh", page_id: "2", piattaforma: "facebook", puo_pubblicare: true },
        { id: "z", nome: "C", motivo: "ok", page_id: "3", piattaforma: "facebook", puo_pubblicare: "true" },
        null,
        "rotto",
        { id: "w", nome: "D", motivo: "ok", piattaforma: "facebook", puo_pubblicare: true },
      ],
    });
    expect(stato.pagine.map((p) => p.puoPubblicare)).toEqual([false, false, false]);
    expect(stato.pagine[1].motivo).toBe("permessi_da_verificare");
    expect(stato.modalitaPost).toBe("spento");
    expect(stato.integrazione).toBeNull();
    expect(leggiStatoPubblicazione(null).pagine).toEqual([]);
  });

  it("una verifica chiesta a Meta e rimasta senza risposta chiede di ricollegare", () => {
    expect(spiegaMotivo("permessi_da_verificare").azione).toBe("verifica");
    const fallita = spiegaMotivo("permessi_da_verificare", { verificaNonRiuscita: true });
    expect(fallita.azione).toBe("ricollega");
    expect(fallita.lungo).toContain("ricollega Meta");
  });
});

const rules: SocialPlatformRule[] = [
  { id: "facebook", name: "Facebook", maxChars: 63206, hashtagsMax: 10, contentTypes: ["post", "story", "reel", "carosello"], schedulingSupport: "native", videoOnly: false },
  { id: "linkedin", name: "LinkedIn", maxChars: 3000, hashtagsMax: 5, contentTypes: ["post", "carosello", "video"], schedulingSupport: "draft_only", videoOnly: false },
  { id: "youtube", name: "YouTube", maxChars: 5000, hashtagsMax: 15, contentTypes: ["video"], schedulingSupport: "video_only", videoOnly: true },
];

describe("il composer valida solo chi riceverà il post", () => {
  it("una piattaforma che non può pubblicare non blocca le altre, e si dice", () => {
    const risultato = validateSocialDraft(
      {
        selectedPlatforms: ["facebook", "linkedin"],
        connectedPlatformIds: ["facebook"],
        contentType: "post",
        fallbackText: "A".repeat(3500),
        textByPlatform: {},
        hashtags: ["#1", "#2", "#3", "#4", "#5", "#6"],
        mediaUrl: null,
        publishNow: true,
        livePublishingEnabled: true,
      },
      rules,
    );
    // I limiti di LinkedIn (3.000 caratteri, 5 hashtag) non fermano Facebook.
    expect(risultato.errors).toEqual([]);
    expect(risultato.canPublishLive).toBe(true);
    expect(risultato.connectedSelectedPlatforms).toEqual(["facebook"]);
    expect(risultato.warnings).toContain("LinkedIn non può pubblicare adesso: il post uscirà solo su Facebook.");
  });

  it("senza nessuna piattaforma pronta resta la bozza, con i limiti di tutte", () => {
    const risultato = validateSocialDraft(
      {
        selectedPlatforms: ["linkedin", "youtube"],
        connectedPlatformIds: [],
        contentType: "post",
        fallbackText: "Ciao",
        textByPlatform: {},
        hashtags: [],
        publishNow: true,
        livePublishingEnabled: true,
      },
      rules,
    );
    expect(risultato.canPublishLive).toBe(false);
    expect(risultato.canSaveDraft).toBe(true);
    expect(risultato.errors).toContain("Nessuna delle piattaforme scelte può pubblicare adesso: salva il post come bozza.");
    expect(risultato.errors).toContain("YouTube non supporta il formato selezionato.");
  });
});

describe("la pagina Social", () => {
  const pagina = leggi("src/pages/azienda/marketing/SocialManagerBeta.tsx");

  it("il composer parte dalle piattaforme pronte e da «Pubblica ora»", () => {
    expect(pagina).toContain("piattaformePronte(stato)");
    expect(pagina).toContain("connectedPlatformIds: piattaformeOk");
    expect(pagina).toContain("accounts: pronte");
    // «Pubblica ora» salvo un giorno scelto dal calendario o un post programmato da modificare.
    expect(pagina).toContain("publishNow: !(iniziale?.data || conData),");
    expect(pagina).toContain("const [publishNow, setPublishNow] = useState(avvio.publishNow);");
    expect(pagina).not.toContain('useState<string[]>(["facebook", "instagram"])');
  });

  it("tre passi visibili, il resto nelle opzioni avanzate", () => {
    expect(pagina).toContain('titolo="Dove"');
    expect(pagina).toContain('titolo="Cosa"');
    expect(pagina).toContain('titolo="Quando"');
    expect(pagina).toContain("Opzioni avanzate");
    expect(pagina).toContain("const [opzioniAperte, setOpzioniAperte] = useState(avvio.opzioniAperte);");
    expect(pagina).toContain('opzioniAperte: Boolean(post && (tipo !== "post" || perPiattaforma || post.firstComment || post.argomento)),');
  });

  it("niente gergo né finzioni: anteprima col nome vero, niente hashtag «AI» finti", () => {
    expect(pagina).not.toContain("Vincoli API");
    expect(pagina).not.toContain("La Tua Impresa");
    expect(pagina).not.toContain(">demo<");
    expect(pagina).not.toContain("setTimeout(r, 1200)");
    expect(pagina).not.toContain("gia' pronto");
    expect(pagina).not.toContain("Import CSV");
    expect(pagina).not.toContain('label: "Educational"');
    expect(pagina).not.toContain("contentType.name");
    // l'argomento consigliava un formato inesistente
    expect(pagina).not.toContain('suggestedContentType: "carousel"');
  });

  it("il composer si svuota solo se il post è salvato davvero", () => {
    expect(pagina).toContain("onPostScheduled: (post: ScheduledPost, modificaId?: string) => Promise<boolean>;");
    expect(pagina).toContain("if (!(await onPostScheduled(newPost, inModifica?.id))) return;");
    expect(pagina).toContain("if (!(await onPostScheduled(bozza, inModifica?.id))) return;");
  });

  it("la pagina con più pagine collegate pubblica su quella pronta, detta esplicitamente", () => {
    expect(pagina).toContain("else if (opzioni.length === 1) chosenTargets[platformId] = opzioni[0].page_id;");
  });

  it("un errore di caricamento si mostra, con «Riprova»", () => {
    expect(pagina).toContain("Non riesco a caricare post e file social.");
    expect(pagina).toContain("onClick={riprovaDati}");
    expect(pagina).not.toContain("isDbBacked");
    expect(pagina).not.toContain("Dati di esempio");
  });
});

describe("i dati social non ripiegano più in silenzio sul browser", () => {
  const hook = leggi("src/hooks/useSocialManagerData.ts");

  it("solo le tabelle assenti portano al browser; ogni altro errore sale", () => {
    expect(hook).not.toContain("fallback\", err");
    expect(hook.match(/if \(isSchemaUnavailable\(err\)\) return null;\n\s+throw err;/g)?.length).toBe(3);
    expect(hook).toContain("error,");
    expect(hook).toContain("riprova,");
    expect(hook).not.toContain("placeholderData: null");
  });

  it("il post non si scrive nel browser prima del database", () => {
    expect(hook).not.toMatch(/persistLocalPost\(post\);\n\n\s+try/);
    expect(hook).toContain("if (isSchemaUnavailable(err)) return persistLocalPost(post);");
    expect(hook).toContain("if (isSchemaUnavailable(err)) return persistLocalMedia(item);");
  });
});

describe("lato server", () => {
  const migrazione = (() => {
    const cartella = resolve(process.cwd(), "supabase/migrations");
    const nome = readdirSync(cartella).find((f) => f.endsWith("_stato_pubblicazione_social.sql"));
    return nome ? readFileSync(resolve(cartella, nome), "utf8") : "";
  })();

  it("la funzione controlla l'azienda, non è aperta ad anon e non dà token", () => {
    expect(migrazione).toContain("SECURITY DEFINER");
    expect(migrazione).toContain("SET search_path = ''");
    expect(migrazione).toContain("IF NOT public.user_can_access_company(p_company_id) THEN");
    expect(migrazione).toContain("REVOKE ALL ON FUNCTION public.stato_pubblicazione_social(uuid) FROM PUBLIC, anon;");
    expect(migrazione).toContain("GRANT EXECUTE ON FUNCTION public.stato_pubblicazione_social(uuid) TO authenticated, service_role;");
    // Le chiavi dei token si guardano (?), i valori non escono.
    expect(migrazione).not.toMatch(/'token'\s*,/);
    expect(migrazione).not.toContain("access_token_encrypted");
    expect(migrazione).not.toMatch(/'permessi'\s*,\s*v_permessi/);
  });

  it("i permessi richiesti sono quelli del publisher", () => {
    expect(migrazione).toContain("WHEN 'facebook' THEN 'pages_manage_posts' = ANY (v_permessi)");
    expect(migrazione).toContain("'instagram_basic' = ANY (v_permessi) AND 'instagram_content_publish' = ANY (v_permessi)");
    expect(migrazione).toContain("instagram_business_account");
  });

  it("get-permissions salva i permessi che Meta dice", () => {
    const proxy = leggi("supabase/functions/meta-api-proxy/index.ts");
    const blocco = proxy.slice(proxy.indexOf('case "get-permissions"'), proxy.indexOf('case "get-page-posts"'));
    expect(blocco).toContain('.from("integration_credentials")');
    expect(blocco).toContain(".update({ granted_scopes: granted })");
    expect(blocco).toContain('.eq("integration_id", integration_id)');
  });
});
