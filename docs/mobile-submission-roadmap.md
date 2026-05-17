# Mobile App — Roadmap Submission App Store + Play Store

**Data**: 16 aprile 2026
**App**: Edilizia in Cloud
**Bundle ID**: `com.ediliziaincloud.app`
**Stack**: React 18 + Capacitor 8.3.0 (WebView native)
**Versioni attuali**: iOS `1.0` (build 1) · Android `1.0` (versionCode 1)

---

## Stato attuale — cosa è PRONTO

### iOS ✅
- Progetto Xcode `ios/App/App.xcodeproj` configurato
- Capacitor 8 con SPM (niente CocoaPods)
- **Build Debug**: `xcodebuild ... CODE_SIGNING_ALLOWED=NO` → SUCCEEDED
- **Simulator**: install + launch su iPhone 17 Pro (iOS 26.4) → app renderizza dashboard React correttamente
- **Info.plist fixato** (commit `1a7c4400`):
  - 7 purpose strings (camera/foto/location/tracking)
  - ITSAppUsesNonExemptEncryption=false
  - UIRequiredDeviceCapabilities=arm64
- **Icona App Store**: `AppIcon-512@2x.png` 1024x1024 presente
- **14 plugin Capacitor** integrati (app, camera, geolocation, push, etc.)

### Android ✅ config / ✅ build environment
- Progetto Gradle `android/app/build.gradle` configurato
- **AndroidManifest fixato** (commit `1a7c4400`):
  - rimosso `ACCESS_BACKGROUND_LOCATION` (evita form giustificazione Play)
  - aggiunto `READ_EXTERNAL_STORAGE maxSdkVersion=32` per legacy picker
- **Permessi dichiarati**: INTERNET, CAMERA, FINE/COARSE_LOCATION, POST_NOTIFICATIONS, VIBRATE, NETWORK_STATE, READ_MEDIA_IMAGES
- **Icone mipmap**: hdpi/mdpi/xxxhdpi tutte presenti
- **minSdk 24** (Android 7.0+) — copre ~99% del mercato
- **targetSdk 36** — compliance con policy Google 2026
- **Build Debug**: `./gradlew :app:assembleDebug` → SUCCEEDED
- **Build Release AAB**: `./gradlew :app:bundleRelease` → SUCCEEDED
- **Signing release**: configurabile via `android/keystore.properties` o variabili ambiente, ma il file reale non deve essere committato
- **Nota**: senza keystore reale il bundle viene generato ma non è caricabile su Play Store.

---

## PARTE 1 — Apple App Store

### 1.1 Prerequisiti account (tu devi fare)

| Item | Costo | Dove |
|---|---|---|
| Apple ID personale | gratis | appleid.apple.com |
| **Apple Developer Program** | **$99/anno** | developer.apple.com/programs |
| App Store Connect access | incluso nel Developer | appstoreconnect.apple.com |

**Importante**: se sei una s.r.l., è consigliata enrollment come **Organization** (serve D-U-N-S number, ottenibile gratis in 1-7 giorni via Dun & Bradstreet). Individual è più veloce (1 giorno) ma mostra il tuo nome personale come Seller.

### 1.2 Setup su Apple Developer Portal

1. **Identifiers → App IDs → New**:
   - Bundle ID: `com.ediliziaincloud.app` (esplicito, non wildcard)
   - Capabilities da attivare: Push Notifications, Associated Domains (se vuoi universal links), Sign in with Apple (opzionale)

2. **Certificates**:
   - Apple Distribution Certificate (automatico via Xcode)

3. **Provisioning Profile**:
   - App Store Distribution Profile per `com.ediliziaincloud.app`

### 1.3 Setup in Xcode

```bash
open /Users/agenteai/edilizia-in-cloud/ios/App/App.xcodeproj
```

In Xcode (target "App" → "Signing & Capabilities"):
- **Team**: seleziona il tuo Apple Developer team
- **Automatically manage signing**: ON (più semplice per la prima volta)
- **Bundle Identifier**: già `com.ediliziaincloud.app`
- **Deployment target**: iOS 15.0 (già configurato)

### 1.4 Assets App Store Connect — checklist

| Asset | Size/Formato | Stato |
|---|---|---|
| App Icon store | 1024x1024 PNG no alpha | ✅ presente |
| Screenshots iPhone 6.9" (obbligatorio) | 1290x2796 PNG | ❌ da generare |
| Screenshots iPhone 6.5" (raccomandato) | 1242x2688 o 1284x2778 | ❌ da generare |
| Screenshots iPad 13" (se universale) | 2064x2752 | n/a (mobile-first) |
| App Preview video (opzionale) | 15-30s, vedi specs Apple | opzionale |
| Privacy Policy URL | pagina pubblica | ✅ `ediliziaincloud.com/privacy` (verifica esista) |
| Support URL | pagina pubblica | ✅ `ediliziaincloud.com` |
| Marketing URL | opzionale | ✅ `ediliziaincloud.com` |
| Description | max 4000 caratteri | ❌ da scrivere (IT + EN) |
| Keywords | max 100 caratteri, virgole | ❌ da scrivere |
| Promotional Text | max 170 caratteri | ❌ da scrivere |
| What's New | max 4000 | ❌ da scrivere |

### 1.5 Privacy Nutrition Labels (obbligatorie)

Da compilare in App Store Connect → App Privacy:
- **Data collected**: Email, Name, Phone (customer profile); Photos/Videos (rapportini); Precise Location (timbrature); Purchase History (se hai billing)
- **Linked to user**: sì, tutti tranne diagnostics
- **Used for tracking**: NO (dichiarato in Info.plist NSUserTrackingUsageDescription)

### 1.6 Build e Upload (Archive)

Dopo aver configurato signing in Xcode:

```bash
# 1. Assicurati che la web app sia già buildata
cd /Users/agenteai/edilizia-in-cloud
npm run build
npx cap sync ios

# 2. In Xcode:
# - Device: "Any iOS Device (arm64)"
# - Product → Archive
# - Organizer → Distribute App → App Store Connect → Upload

# OPPURE via CLI (richiede Apple ID login):
cd ios/App
xcodebuild -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ExportOptions.plist
```

### 1.7 TestFlight → Submit Review

1. Upload build via Xcode/CLI → arriva in App Store Connect in 10-30 min (processing)
2. **TestFlight**: aggiungi se stesso come Internal Tester → install su device reale
3. Test su device reale 1-2 giorni con edge case (offline, permessi negati, sessione scaduta)
4. **Submit for Review**: compila tutto il form, submit
5. **Tempi review Apple 2026**: tipicamente 24-48h, a volte fino a 7 giorni

### 1.8 Rejection tipiche (da prevenire)

- ❌ Demo account non fornito → **fornisci `demo@azienda.srl / Demo2026Azienda`** nel form "App Review Information"
- ❌ Permessi richiesti senza giustificazione → purpose strings già in place
- ❌ App solo WebView senza funzionalità native → OK, abbiamo Camera/Geolocation/Push
- ❌ Contenuti user-generated senza moderazione → nella descrizione spiega che è B2B (imprese edili clienti), non social

---

## PARTE 2 — Google Play Store

### 2.1 Prerequisiti account

| Item | Costo | Dove |
|---|---|---|
| Google account | gratis | accounts.google.com |
| **Google Play Developer Account** | **$25 una tantum** | play.google.com/console/signup |

Verifica identità: serve documento ID + 2-3 giorni per approvazione iniziale.

### 2.2 Setup ambiente build

Su questa macchina l'ambiente base è già stato verificato con OpenJDK 21 e Android command line tools. Se devi rifarlo su un'altra macchina:

```bash
# 1. Installa OpenJDK 17 via Homebrew
brew install --cask temurin@17

# 2. Installa Android Studio (include SDK + emulator)
brew install --cask android-studio
open -a "Android Studio"
# Dentro Android Studio: Preferences → Appearance & Behavior → System Settings → Android SDK
# Installa:
# - Android SDK Platform 36 (target)
# - Android SDK Build-Tools 36.x
# - Android SDK Platform-Tools
# - Android Emulator

# 3. Aggiungi a ~/.zshrc:
# export ANDROID_HOME="$HOME/Library/Android/sdk"
# export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

### 2.3 Signing key (produzione)

Il keystore di produzione è LA cosa più importante — se lo perdi NON puoi più aggiornare l'app.

```bash
cd /Users/agenteai/edilizia-in-cloud/android
keytool -genkey -v \
  -keystore ediliziaincloud-release.keystore \
  -alias ediliziaincloud \
  -keyalg RSA \
  -keysize 2048 \
  -validity 25000
# Salva la password in 1Password. BACKUP il file .keystore in due posti sicuri.
```

Poi copia il template e compila i valori reali:

```bash
cp android/keystore.properties.example android/keystore.properties
# modifica android/keystore.properties con file, alias e password reali
```

**Google Play App Signing** (raccomandato): ti consente di perdere il keystore e recuperarlo via Google. Attivalo in Play Console → Setup → App Integrity.

### 2.4 Build AAB (Android App Bundle)

AAB è il formato richiesto dal 2021 per nuove app. Sostituisce APK.

```bash
cd /Users/agenteai/edilizia-in-cloud
npm run mobile:android:release
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### 2.5 Assets Play Console — checklist

| Asset | Size/Formato | Stato |
|---|---|---|
| App icon | 512x512 PNG 32-bit | ✅ `public/icons/icon-512.png` |
| Feature graphic | 1024x500 PNG | ❌ da generare |
| Phone screenshots | min 2, 16:9 o 9:16, 1080-3840px lato | ❌ da generare |
| Tablet 7" screenshots | opzionale se designi per tablet | n/a |
| Tablet 10" screenshots | opzionale | n/a |
| Promo video YouTube | opzionale | opzionale |
| Short description | max 80 caratteri | ❌ da scrivere |
| Full description | max 4000 caratteri | ❌ da scrivere |
| Privacy Policy URL | obbligatoria per permessi | ✅ verifica URL |

### 2.6 Data Safety Form (obbligatorio)

In Play Console → App content → Data safety. Dichiarazioni:
- **Personal info**: Name, Email, Phone, Address — collected, linked, REQUIRED
- **Photos/Videos**: collected per rapportini, REQUIRED user-initiated
- **Location precise**: collected per timbrature, REQUIRED user-initiated
- **Encryption in transit**: SI (HTTPS Supabase)
- **Data deletion mechanism**: SI (email support)

### 2.7 Release tracks → Production

1. **Internal testing** (istantaneo, fino 100 tester): carica AAB, aggiungi tu stesso via email
2. **Closed testing** (alpha/beta, opzionale): testa con team
3. **Open testing** (beta pubblica, opzionale)
4. **Production**: submit for review — tipicamente 1-7 giorni review

### 2.8 Rejection tipiche Play

- ❌ Permessi richiesti e non usati → verifica che tutti i permessi in Manifest siano realmente chiamati da qualche plugin/codice
- ❌ Target SDK < N (Google aggiorna ogni anno) → targetSdk 36 OK fino 2027
- ❌ Data safety incompleto → compila TUTTE le sezioni
- ❌ 64-bit mancante → Capacitor 8 build automatico arm64 OK

---

## PARTE 3 — Processo consigliato (ordine temporale)

```
Settimana 1-2  │ Enrollment Apple Developer ($99) + Google Play ($25)
               │ Nel frattempo: generare screenshot, scrivere description
Settimana 2    │ Setup Xcode signing + build Archive iOS
               │ Installare JDK + Android Studio + generare keystore
Settimana 2-3  │ TestFlight iOS (1-2 giorni dogfood)
               │ Internal Testing Android (1-2 giorni dogfood)
Settimana 3    │ Submit Apple + Google stessa settimana
Settimana 3-4  │ Rispondere a eventuali richieste review
Settimana 4    │ APPROVED → release pubblica
```

**Tempi reali 2026** (esperienza): Apple 1-3 giorni review, Google 2-7 giorni review. Se rigettano, fix + resubmit cicli brevi (24-48h).

---

## PARTE 4 — Checklist GO / NO-GO prima della submission

### Pre-submit GO
- [ ] npm run build OK, no TypeScript errors, no console.error in produzione
- [ ] `npx cap sync` eseguito dopo ogni web build
- [ ] Demo account `demo@azienda.srl` funziona in app mobile (per Apple reviewer)
- [ ] Sentry DSN configurato in produzione (monitoraggio crash)
- [ ] Privacy Policy URL raggiungibile (HTTP 200)
- [ ] Terms of Service URL raggiungibile
- [ ] CSP `_headers` consente tutti i domain richiesti (Supabase, Open-Meteo, etc.)
- [ ] Testato offline → mostra stato offline invece di crash
- [ ] Testato con permessi negati (camera, location) → fallback graceful
- [ ] Testato con sessione scaduta → redirect login senza crash
- [ ] Testato su iPhone piccolo (SE) e grande (Pro Max) → no overflow
- [ ] Testato orientation change → nessun crash

### iOS specifici
- [ ] LaunchScreen.storyboard con logo corretto (non placeholder Capacitor)
- [ ] AppIcon.appiconset tutte le varianti (40@2x, 60@3x, 76@2x, 83.5@2x, 1024x1024)
- [ ] Info.plist CFBundleDisplayName = "Edilizia in Cloud" ✅
- [ ] Version e Build numbers incrementati ad ogni upload

### Android specifici
- [ ] versionCode incrementato (numero intero monotonico)
- [ ] versionName = "1.0.0"
- [ ] Splash screen androidSplashResourceName="splash" esiste
- [ ] App icon adaptive su Android 8+ (foreground + background layers)
- [ ] keystore BACKUP su almeno 2 posti sicuri

---

## PARTE 5 — Comandi rapidi di riferimento

```bash
# Sync web → native
npm run build && npx cap sync

# iOS simulator (rapido)
xcrun simctl boot A072C859-E838-4A3A-AB00-6E37CB7D9B54
cd ios/App
xcodebuild -project App.xcodeproj -scheme App \
  -destination 'platform=iOS Simulator,id=A072C859-E838-4A3A-AB00-6E37CB7D9B54' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO
xcrun simctl install A072C859-E838-4A3A-AB00-6E37CB7D9B54 \
  build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch A072C859-E838-4A3A-AB00-6E37CB7D9B54 com.ediliziaincloud.app

# iOS device (richiede signing)
open ios/App/App.xcodeproj   # build da UI Xcode

# iOS Archive (App Store)
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive archive

# Android debug
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk

# Android release AAB
cd android && ./gradlew bundleRelease
# android/app/build/outputs/bundle/release/app-release.aab

# Incrementa build/version
# iOS: edita in Xcode target settings MARKETING_VERSION e CURRENT_PROJECT_VERSION
# Android: edita android/app/build.gradle versionCode e versionName
```

---

## Note finali

- **Cloudflare Pages** continua a servire la web app (app/admin/clienti/lavori subdomain) indipendentemente dall'app nativa.
- **App nativa** serve la stessa web app via WebView, quindi **ogni fix nel codebase beneficia entrambi** una volta fatto `npx cap sync`. Non serve mantenere due codebase.
- **Aggiornamenti OTA**: Capacitor supporta `@capacitor/live-updates` (plugin opzionale, servizio Ionic a pagamento) per aggiornare il JS senza passare dalla store review. Utile per hotfix urgenti dopo il go-live.
- **Push notifications**: Supabase ha integrazione con FCM (Android) e APNs (iOS). Setup da fare post-submission.

Tutto il codebase è aderente ai requisiti store. Prossimo blocker operativo: **enrollment Apple Developer + Google Play account** (tu, non io), **JDK/Android SDK install** (comando sopra), **screenshot e descrizioni** (design + copy).
