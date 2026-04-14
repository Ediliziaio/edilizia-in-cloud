import { Camera, CameraResultType, CameraSource, type Photo } from "@capacitor/camera";
import { isNative } from "./platform";

export interface CapturedPhoto {
  dataUrl: string;
  format: string;
  path?: string;
}

export async function takePhoto(): Promise<CapturedPhoto> {
  if (isNative) {
    const photo: Photo = await Camera.getPhoto({
      quality: 80, allowEditing: false, resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera, width: 1920, height: 1920, correctOrientation: true,
    });
    return { dataUrl: photo.dataUrl || "", format: photo.format, path: photo.path };
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.capture = "environment";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error("Nessuna foto selezionata")); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result as string, format: file.type.split("/")[1] || "jpeg" });
      reader.onerror = () => reject(new Error("Errore lettura foto"));
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

export async function pickPhoto(): Promise<CapturedPhoto> {
  if (isNative) {
    const photo = await Camera.getPhoto({
      quality: 80, allowEditing: false, resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos, width: 1920, height: 1920,
    });
    return { dataUrl: photo.dataUrl || "", format: photo.format, path: photo.path };
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error("Nessuna foto selezionata")); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result as string, format: file.type.split("/")[1] || "jpeg" });
      reader.onerror = () => reject(new Error("Errore lettura foto"));
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
