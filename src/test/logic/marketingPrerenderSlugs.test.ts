import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectBlogSlugs } from "../../../scripts/collect-blog-slugs.mjs";
describe("pagine del blog da prerenderizzare", () => {
  it("include gli oggetti scritti a mano e quelli con chiavi JSON", () => {
    expect(collectBlogSlugs('slug: "a", "slug": "b", \'slug\': \'c\', slug: "a"')).toEqual(["a","b","c"]);
  });
  it("include i confronti Pillar e TeamSystem aggiornati", () => {
    const source=readFileSync("src/data/blogPostsConfrontoDiretti.ts","utf8");
    expect(collectBlogSlugs(source)).toContain("edilizia-in-cloud-vs-pillar");
    expect(collectBlogSlugs(source)).toContain("edilizia-in-cloud-vs-teamsystem-construction");
  });
});
