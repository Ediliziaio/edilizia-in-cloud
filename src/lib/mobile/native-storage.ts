import { Preferences } from "@capacitor/preferences";

export async function setItem(key: string, value: string): Promise<void> { await Preferences.set({ key, value }); }
export async function getItem(key: string): Promise<string | null> { const r = await Preferences.get({ key }); return r.value; }
export async function removeItem(key: string): Promise<void> { await Preferences.remove({ key }); }
export async function clear(): Promise<void> { await Preferences.clear(); }
export async function keys(): Promise<string[]> { const r = await Preferences.keys(); return r.keys; }
export async function setJSON<T>(key: string, value: T): Promise<void> { await setItem(key, JSON.stringify(value)); }
export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getItem(key); if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
