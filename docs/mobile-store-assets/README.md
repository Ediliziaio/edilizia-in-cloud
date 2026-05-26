# Mobile Store Assets

Generato da `scripts/mobile-store/generate-graphics.mjs`.

## File generati

### Apple App Store
- `ios/icon-1024.png` — store icon (NO alpha, NO corner radius — Apple ce le applica)
- Screenshot iPhone 6.9": generare con `scripts/mobile-store/capture-screenshots.mjs --platform=ios`

### Google Play
- `android/play-icon-512.png` — store icon principale Play Console
- `android/adaptive-foreground-432.png` — adaptive icon layer "foreground"
- `android/adaptive-background-432.png` — adaptive icon layer "background" (solid color)
- `android/mipmap-preview/` — preview mipmaps (mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi) × 3 file each
- `feature-graphic-1024x500.png` — feature graphic (mostrata in cima alla scheda Play)
- Screenshot Android: generare con `scripts/mobile-store/capture-screenshots.mjs --platform=android`

## Come applicare le mipmap Android al progetto (post-validazione visiva)

Le mipmap sono solo in preview qui. Per applicarle al progetto Android:

```bash
# Verifica visiva PRIMA di copiare!
open docs/mobile-store-assets/android/mipmap-preview/

# Se ok, copia in res/mipmap-*/ del progetto Android
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  for f in ic_launcher ic_launcher_round ic_launcher_foreground; do
    cp docs/mobile-store-assets/android/mipmap-preview/mipmap-${d}_${f}.png \
       android/app/src/main/res/mipmap-${d}/${f}.png
  done
done

# Rebuilda
cd android && ./gradlew clean :app:assembleDebug
```

## Adaptive icon XML (già configurato?)

Verifica che esista `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
```

Se manca, lo aggiungiamo nello step successivo.

## Schermate da catturare

Le 6 pagine selezionate in `capture-screenshots.mjs`:
1. Dashboard cantieri (`/azienda`)
2. Lista cantieri (`/azienda/cantieri`)
3. Commesse e marginalità (`/azienda/ordini`)
4. Silvio AI (`/azienda/chat`)
5. Personale e timbrature (`/azienda/personale`)
6. Fatturato (`/azienda/fatturato`)
