# GO / NO-GO Check — Stato attuale (26 maggio 2026)

Eseguito automaticamente da Claude sul codice committed. ✅ = OK, ⚠️ = verifica manuale, ❌ = da fare.

## Codice

| Check | Stato | Note |
|-------|-------|------|
| `npm run build` senza errori | ✅ | Verificato in CI dopo fix `healthLabelStyle` import |
| TypeScript errors | ✅ | tsc --noEmit exit 0 |
| Privacy policy esiste come pagina | ✅ | `src/pages/PrivacyPolicy.tsx` su rotte `/privacy` + `/privacy-policy` |
| Termini di servizio esiste come pagina | ✅ | `src/pages/TerminiServizio.tsx` su rotte `/termini` + `/termini-e-condizioni` |
| Sentry DSN configurato | ✅ | Lazy init in `src/main.tsx` (requestIdleCallback) |
| Demo account valido | ⚠️ | `demo@azienda.srl` / `Demo2026Azienda` — verifica manuale che funzioni su mobile |

## iOS

| Check | Stato | Note |
|-------|-------|------|
| Bundle ID configurato | ✅ | `com.ediliziaincloud.app` |
| `ITSAppUsesNonExemptEncryption = false` | ✅ | In Info.plist |
| Purpose strings | ✅ | 7 stringhe (camera, photos, location, tracking, ecc.) |
| App icon 1024x1024 no-alpha | ✅ | `docs/mobile-store-assets/ios/icon-1024.png` (appena generata) |
| Splash screen color brand | ✅ | `#0a0a0f` in capacitor.config |
| Deployment target iOS | ✅ | 15.0 |
| Screenshots iPhone 6.9" | ⏳ | Script pronto: `scripts/mobile-store/capture-screenshots.mjs` |
| Store copy IT + EN | ✅ | `docs/mobile-store-assets/store-copy-it.md` + `-en.md` |

## Android

| Check | Stato | Note |
|-------|-------|------|
| applicationId configurato | ✅ | `com.ediliziaincloud.app` |
| minSdk / targetSdk | ✅ | minSdk 24, targetSdk 36 (compliance 2026) |
| 10 permission dichiarati | ✅ | INTERNET, CAMERA, FINE/COARSE_LOCATION, POST_NOTIFICATIONS, RECORD_AUDIO, VIBRATE, NETWORK_STATE, READ_MEDIA_IMAGES, READ_EXTERNAL_STORAGE |
| `ACCESS_BACKGROUND_LOCATION` rimosso | ✅ | Già fatto (no form Google) |
| Adaptive icon XML | ✅ | `ic_launcher.xml` + `ic_launcher_round.xml` in `mipmap-anydpi-v26/` |
| Adaptive foreground PNG | ✅ | `docs/mobile-store-assets/android/adaptive-foreground-432.png` |
| Adaptive background PNG | ✅ | `docs/mobile-store-assets/android/adaptive-background-432.png` |
| Mipmap density (5 livelli × 3 file) | ⏳ | Preview generate, da applicare con script di copia |
| Play store icon 512x512 | ✅ | `docs/mobile-store-assets/android/play-icon-512.png` |
| Feature graphic 1024x500 | ✅ | `docs/mobile-store-assets/feature-graphic-1024x500.png` |
| Screenshots phone (1080+) | ⏳ | Script pronto |
| Keystore release | ❌ | Da generare (azione utente — istruzioni in `mobile-submission-roadmap.md` §2.3) |
| Data safety form Play Console | ❌ | Da compilare al momento del submit (template in `store-copy-it.md` §1.5) |

## Azioni esterne (utente)

| Action | Stato | Note |
|--------|-------|------|
| Apple Developer Program enrollment ($99/anno) | ❌ | https://developer.apple.com/programs |
| Google Play Developer account ($25 una tantum) | ❌ | https://play.google.com/console/signup |
| D-U-N-S number (se s.r.l.) | ❌ | Gratis su dnb.com — necessario per Apple Organization |
| Signing certificate iOS distribuzione | ❌ | Generato da Xcode dopo enrollment Apple |
| Keystore Android prod (`.keystore`) | ❌ | `keytool -genkey ...` (istruzioni in roadmap) |
| Backup keystore in 2 posti sicuri | ❌ | Se perdi il keystore = non puoi più aggiornare l'app |

## Comandi pronti per l'uso

### 1. Generare screenshot (quando l'app è raggiungibile)
```bash
cd /Users/agenteai/edilizia-in-cloud
# Default: cattura iOS + Android contro https://app.ediliziaincloud.com
node scripts/mobile-store/capture-screenshots.mjs

# Solo iOS, contro un base URL diverso
node scripts/mobile-store/capture-screenshots.mjs --platform=ios --base=https://staging.ediliziaincloud.com
```

### 2. Applicare le mipmap Android generate
```bash
# PRIMA verifica visivamente
open docs/mobile-store-assets/android/mipmap-preview/

# Poi copia al progetto
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  for f in ic_launcher ic_launcher_round ic_launcher_foreground; do
    cp docs/mobile-store-assets/android/mipmap-preview/mipmap-${d}_${f}.png \
       android/app/src/main/res/mipmap-${d}/${f}.png
  done
done

# Rebuild
cd android && ./gradlew clean :app:assembleDebug
```

### 3. Build release AAB Android (dopo keystore)
```bash
cd /Users/agenteai/edilizia-in-cloud
npm run mobile:android:release
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### 4. Build Archive iOS (dopo signing in Xcode)
```bash
cd /Users/agenteai/edilizia-in-cloud
npm run build && npx cap sync ios
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive archive
```

## Cosa serve davvero da te per fare la prima submission

1. ✅ (tu) Apri Apple Developer Program → $99 → aspetta 1-7 giorni
2. ✅ (tu) Apri Google Play Developer → $25 → aspetta 2-3 giorni
3. ✅ (tu) Verifica che `demo@azienda.srl` funzioni davvero sulla app mobile
4. ⏳ (insieme) Genera screenshot con lo script (richiede app raggiungibile)
5. ⏳ (insieme) Genera keystore Android con `keytool`, BACKUP in 1Password + Google Drive
6. ⏳ (insieme) Build Archive iOS in Xcode + upload TestFlight
7. ⏳ (insieme) Build AAB Android + upload Internal Testing
8. ⏳ (insieme) Submit per review (Apple + Google stesso giorno)

Tempo stimato: **3-4 settimane** dal punto 1 alla pubblicazione, ipotizzando 1 rejection per ciascuno (statistica realistica).
