# Mobile Store Release

Questa checklist serve per generare build iOS/Android ripetibili senza salvare segreti nel repository.

## Android

1. Genera una upload key e salvala fuori dal repository o dentro `android/` ma ignorata da Git:

```bash
cd android
keytool -genkey -v \
  -keystore ediliziaincloud-upload-key.jks \
  -alias ediliziaincloud \
  -keyalg RSA \
  -keysize 2048 \
  -validity 25000
```

2. Copia `android/keystore.properties.example` in `android/keystore.properties` e compila i valori reali, oppure esporta:

```bash
export ANDROID_KEYSTORE_FILE="ediliziaincloud-upload-key.jks"
export ANDROID_KEYSTORE_PASSWORD="..."
export ANDROID_KEY_ALIAS="ediliziaincloud"
export ANDROID_KEY_PASSWORD="..."
```

3. Genera l'AAB Play Store:

```bash
npm run mobile:android:release
```

Lo script rileva automaticamente `JAVA_HOME` e `ANDROID_HOME` sui setup macOS standard. Se usi path diversi, esportali prima del comando.

4. Verifica che il bundle sia firmato:

```bash
jarsigner -verify -verbose -certs android/app/build/outputs/bundle/release/app-release.aab
```

Se vedi `jar is unsigned`, il bundle e' compilato ma non ancora caricabile su Play Store: manca la upload key reale in `android/keystore.properties` o nelle variabili ambiente.

## iOS

1. Apri `ios/App/App.xcodeproj`.
2. In `Signing & Capabilities`, seleziona il Team Apple corretto e lascia `Automatically manage signing` attivo.
3. Bundle ID: `com.ediliziaincloud.app`.
4. Esegui:

```bash
npm run mobile:build
npm run mobile:sync
```

5. In Xcode: `Product -> Archive`, poi upload su App Store Connect/TestFlight.

## Note di pubblicazione

- La build mobile usa `VITE_APP_MODE=mobile`, quindi l'app nativa parte sempre dal contesto applicativo e non dalla home marketing.
- `CAPACITOR_DEBUG=1` abilita il WebView debugging Android; lasciarlo spento nelle build store.
- Le chiavi reali Android non devono mai essere committate.
