import { afterEach, describe, expect, it } from "vitest";
import { applyBrandFavicon } from "@/lib/brandFavicon";

afterEach(() => document.head.querySelectorAll("link[rel='icon']").forEach(link => link.remove()));

describe("Icona del browser white-label", () => {
  it("rimuovendo l'icona aziendale ripristina quella della piattaforma", () => {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "/favicon.ico";
    document.head.appendChild(link);
    const restore = applyBrandFavicon("https://example.test/azienda.png");
    expect(link.getAttribute("href")).toBe("https://example.test/azienda.png");
    restore();
    applyBrandFavicon(null);
    expect(link.getAttribute("href")).toBe("/favicon.ico");
  });
  it("non lascia icone residue se la pagina non ne aveva una", () => {
    const restore = applyBrandFavicon("https://example.test/azienda.png");
    expect(document.head.querySelector("link[rel='icon']")).not.toBeNull();
    restore();
    expect(document.head.querySelector("link[rel='icon']")).toBeNull();
  });
});
