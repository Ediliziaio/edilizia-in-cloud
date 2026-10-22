import { describe, expect, it } from "vitest";
import { softwareComparisons, teamsystemGuide, primusGuide } from "@/lib/marketing/softwareComparisons";
import { blogPosts } from "@/data/blogPosts";

const middlewarePath = "../../../functions/_middleware.js";
async function getFallback(path: string): Promise<string> {
  const previous = (globalThis as unknown as { caches?: unknown }).caches;
  (globalThis as unknown as { caches: unknown }).caches = { default: { match: async (): Promise<undefined> => undefined, put: async (): Promise<undefined> => undefined } };
  try {
    const { onRequest } = await import(/* @vite-ignore */ middlewarePath);
    const response = await onRequest({request: new Request(`https://www.ediliziaincloud.com${path}`,{headers:{"user-agent":"Googlebot"}}), next:async()=>new Response("SPA"),env:{ASSETS:{fetch:async()=>new Response("",{status:404})}},waitUntil:()=>{}});
    expect(response.status).toBe(200);
    return response.text();
  } finally { (globalThis as unknown as { caches?: unknown }).caches = previous; }
}
describe("confronti coerenti anche senza prerender", () => {
  it("il crawler riceve tutti i confronti, non il vecchio elenco da cinque", async () => {
    const html = await getFallback("/confronto/");
    for (const guide of softwareComparisons) expect(html).toContain(guide.path);
    const scripts=[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((match)=>JSON.parse(match[1]));
    expect(scripts.find((data)=>data["@type"]==="ItemList").numberOfItems).toBe(softwareComparisons.length);
    expect(html).not.toContain("ERP generalista vs");
  });
  it.each([teamsystemGuide,primusGuide])("$competitor: stessi punti verificati anche ai crawler",async(guide)=>{
    const html=await getFallback(`/confronto/${guide.slug}/`);
    expect(html).toContain(guide.title);
    for(const source of guide.sources)expect(html).toContain(source.url);
    expect(html).not.toContain("Con BI separata");
  });
  it("il fallback dell'articolo espone il collegamento al confronto aggiornato", async () => {
    const html = await getFallback("/blog/edilizia-in-cloud-vs-teamsystem-construction/");
    expect(html).toContain('<a href="/confronto/vs-teamsystem/">');
    expect(html).toContain("Passare da TeamSystem");
  });
  it("Pillar resta un confronto documentato, senza presunte assenze di SDI o SAL", async () => {
    const post = blogPosts.find((post) => post.slug === "edilizia-in-cloud-vs-pillar")!;
    const text = JSON.stringify(post);
    expect(post.updatedAt).toBe("2026-10-21");
    expect(text).toContain("https://www.pillar.it/fatturazione");
    expect(text).toContain("https://www.pillar.it/gestione-sal-stato-avanzamento-lavori");
    expect(text).toContain("/funzionalita/pipeline-vendite/");
    expect(text).not.toContain("48 ore");
    expect(text).not.toContain("SDI non sono dichiarate");
    expect(text).not.toContain("SAL e fatture di avanzamento non è menzionato");
    const html = await getFallback("/blog/edilizia-in-cloud-vs-pillar/");
    expect(html).toContain('<a href="https://www.pillar.it/fatturazione">');
    const hub = await getFallback("/confronto/");
    expect(hub).toContain('id="confronto-pillar"');
  });
  it("la guida generale collega i due confronti e dichiara la provenienza",()=>{
    const post=blogPosts.find((post)=>post.slug==="migliori-software-gestionali-edilizia-confronto")!;
    const text=post.content.map((section)=>section.body??"").join(" ");
    expect(text).toContain("parte interessata");
    expect(text).toContain("/confronto/vs-teamsystem/");
    expect(text).toContain("/confronto/vs-primus/");
    expect(post.content.find((section)=>section.type==="table")!.rows).toHaveLength(8);
  });
});
