import { isNative } from "./platform";
import { setJSON, getJSON, removeItem } from "./native-storage";

const BIO_ENABLED = "biometric_enabled";
const BIO_EMAIL = "biometric_email";
const BIO_SESSION = "biometric_session";

export async function isBiometricAvailable(): Promise<boolean> { return isNative; }
export async function isBiometricEnabled(): Promise<boolean> { if (!isNative) return false; return (await getJSON<boolean>(BIO_ENABLED)) === true; }
export async function enableBiometric(email: string, refreshToken: string): Promise<void> {
  await setJSON(BIO_ENABLED, true); await setJSON(BIO_EMAIL, email); await setJSON(BIO_SESSION, refreshToken);
}
export async function getBiometricCredentials(): Promise<{ email: string; refreshToken: string } | null> {
  if (!(await isBiometricEnabled())) return null;
  const email = await getJSON<string>(BIO_EMAIL); const rt = await getJSON<string>(BIO_SESSION);
  if (!email || !rt) return null; return { email, refreshToken: rt };
}
export async function disableBiometric(): Promise<void> { await removeItem(BIO_ENABLED); await removeItem(BIO_EMAIL); await removeItem(BIO_SESSION); }
export async function updateBiometricToken(refreshToken: string): Promise<void> {
  if (!(await isBiometricEnabled())) return; await setJSON(BIO_SESSION, refreshToken);
}
