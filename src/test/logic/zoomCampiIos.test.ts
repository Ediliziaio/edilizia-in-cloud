import { afterEach, describe, expect, it } from "vitest";
import { bloccaZoomCampiIos } from "@/lib/mobile/zoomCampiIos";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const BASE = "width=device-width, initial-scale=1.0, viewport-fit=cover";

function documento() {
  document.head.innerHTML = `<meta name="viewport" content="${BASE}">`;
  return document;
}
const nav = (userAgent: string, platform: string, maxTouchPoints: number) =>
  ({ userAgent, platform, maxTouchPoints }) as Navigator;
const viewport = () => document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content;

afterEach(() => { document.head.innerHTML = ""; });

describe("campi a 14px senza ingrandimento su iOS", () => {
  it("su iPhone aggiunge maximum-scale=1, una volta sola", () => {
    const doc = documento();
    expect(bloccaZoomCampiIos(doc, nav(IPHONE, "iPhone", 5))).toBe(true);
    expect(viewport()).toBe(`${BASE}, maximum-scale=1`);
    expect(bloccaZoomCampiIos(doc, nav(IPHONE, "iPhone", 5))).toBe(false);
    expect(viewport()).toBe(`${BASE}, maximum-scale=1`);
  });

  it("riconosce l'iPad che si presenta come Mac", () => {
    expect(bloccaZoomCampiIos(documento(), nav(MAC, "MacIntel", 5))).toBe(true);
  });

  it("non tocca Android né il Mac: lì lo zoom resta", () => {
    expect(bloccaZoomCampiIos(documento(), nav(ANDROID, "Linux armv8l", 5))).toBe(false);
    expect(bloccaZoomCampiIos(documento(), nav(MAC, "MacIntel", 0))).toBe(false);
    expect(viewport()).toBe(BASE);
  });
});
