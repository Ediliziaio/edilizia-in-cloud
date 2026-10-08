import { describe, expect, it, vi } from "vitest";
import { signBathroomProjectMedia } from "../../../supabase/functions/_shared/scopedProjectMedia";
const company = "00000000-0000-4000-8000-000000000001", project = "00000000-0000-4000-8000-000000000002";
const file = "00000000-0000-4000-8000-000000000003.jpg", path = `${company}/bagni/${project}/${file}`;
const base = "https://db.example.test";
const row = () => ({ company_id: company, progetto_id: project, tipo: "situazione", caption: "Foto fittizia", url: `progetti-media/${path}` });
const setup = () => {
  const sign = vi.fn(async (value: string) => ({ data: { signedUrl: `${base}/storage/v1/object/sign/progetti-media/${value}?token=fixture` }, error: null }));
  const from = vi.fn(() => ({ createSignedUrl: sign })); return { db: { storage: { from } }, sign, from };
};
describe("Private project images before actual PDF rendering", () => {
  it("signs only the saved project path without mutating the persisted reference", async () => {
    const { db, sign, from } = setup(); const original = row();
    const result = await signBathroomProjectMedia(db, company, project, [original], base);
    expect(from).toHaveBeenCalledWith("progetti-media"); expect(sign).toHaveBeenCalledWith(path, 300);
    expect(result[0]).toMatchObject({ caption: "Foto fittizia", url: `${base}/storage/v1/object/sign/progetti-media/${path}?token=fixture` });
    expect(original.url).toBe(`progetti-media/${path}`);
  });
  it.each([
    `progetti-media/foreign/bagni/${project}/${file}`,
    `progetti-media/${company}/bagni/other-project/${file}`,
    `progetti-media/${company}/bagni/${project}/../${file}`,
    `progetti-media/${company}/bagni/${project}/%2e%2e/${file}`,
    `other-bucket/${path}`, `progetti-media/${path.replace(".jpg", ".webp")}`,
  ])("never signs another scope or unsupported path: %s", async url => {
    const { db, sign } = setup();
    await expect(signBathroomProjectMedia(db, company, project, [{ ...row(), url }], base)).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });
  it.each(["company_id", "progetto_id"])("checks row ownership %s, not only its URL", async field => {
    const { db, sign } = setup();
    await expect(signBathroomProjectMedia(db, company, project, [{ ...row(), [field]: "foreign" }], base)).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });
  it("does not silently discard an attached document", async () => {
    const { db, sign } = setup();
    await expect(signBathroomProjectMedia(db, company, project, [{ ...row(), tipo: "allegato" }], base)).rejects.toThrow(/omessi/);
    expect(sign).not.toHaveBeenCalled();
  });
  it("cannot bypass tenant checks with a pre-signed storage URL", async () => {
    const { db, sign } = setup();
    await expect(signBathroomProjectMedia(db, company, project, [{ ...row(), url: `${base}/storage/v1/object/sign/progetti-media/foreign/photo.jpg?token=x` }], base)).rejects.toThrow(/riferimento/);
    expect(sign).not.toHaveBeenCalled();
  });
  it.each([
    "https://evil.test/photo.jpg", `${base}/storage/v1/object/sign/progetti-media/other/photo.jpg?token=x`,
    `${base}/storage/v1/object/sign/progetti-media/${path}`, `http://db.example.test/storage/v1/object/sign/progetti-media/${path}?token=x`,
  ])("rejects an unexpected signature result %s", async signedUrl => {
    const { db, sign } = setup(); sign.mockResolvedValueOnce({ data: { signedUrl }, error: null });
    await expect(signBathroomProjectMedia(db, company, project, [row()], base)).rejects.toThrow();
  });
  it("stops on a missing storage signature instead of falling back to a public URL", async () => {
    const { db, sign } = setup(); sign.mockResolvedValueOnce({ data: { signedUrl: "" }, error: null });
    await expect(signBathroomProjectMedia(db, company, project, [row()], base)).rejects.toThrow(/Firma/);
  });
  it("preserves stable ordering with bounded parallel signing", async () => {
    const { db, sign } = setup(); let active = 0, maximum = 0;
    sign.mockImplementation(async value => {
      active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 1)); active--;
      return { data: { signedUrl: `${base}/storage/v1/object/sign/progetti-media/${value}?token=fixture` }, error: null };
    });
    const rows = Array.from({ length: 9 }, (_, n) => ({ ...row(), caption: `Photo ${n}` }));
    const result = await signBathroomProjectMedia(db, company, project, rows, base);
    expect(result.map(r => r.caption)).toEqual(rows.map(r => r.caption)); expect(maximum).toBeLessThanOrEqual(4);
  });
});
