package com.ediliziaincloud.app;

import android.app.Activity;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "CampoDocumentScanner")
public class CampoDocumentScannerPlugin extends Plugin {
    private static final int MAX_PAGINE = 12;
    private static final int MAX_BYTE = 18 * 1024 * 1024;
    private static final long GIORNO_MS = 86_400_000L;
    private final ExecutorService lavoro = Executors.newSingleThreadExecutor();
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall scansioneInCorso;

    @PluginMethod
    public void scan(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (scansioneInCorso != null) {
                call.reject("Aspetta che finisca la scansione aperta.", "BUSY");
                return;
            }
            if (launcher == null) {
                // Questo overload consente la registrazione anche con l'Activity già visibile.
                launcher = getActivity().getActivityResultRegistry().register(
                    "campo-ddt-scanner",
                    new ActivityResultContracts.StartIntentSenderForResult(),
                    this::riceviScansione
                );
            }
            scansioneInCorso = call;
            GmsDocumentScannerOptions opzioni = new GmsDocumentScannerOptions.Builder()
                .setPageLimit(limitePagine(call))
                .setGalleryImportAllowed(true)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_BASE_WITH_FILTER)
                .build();
            GmsDocumentScanning.getClient(opzioni).getStartScanIntent(getActivity())
                .addOnSuccessListener(sender -> {
                    if (scansioneInCorso != call || launcher == null) return;
                    try {
                        launcher.launch(new IntentSenderRequest.Builder(sender).build());
                    } catch (RuntimeException e) {
                        scansioneInCorso = null;
                        call.reject("Impossibile aprire lo scanner. Puoi usare la fotocamera.", "UNAVAILABLE");
                    }
                })
                .addOnFailureListener(error -> {
                    if (scansioneInCorso != call) return;
                    scansioneInCorso = null;
                    call.reject("Scanner documenti non disponibile. Puoi usare la fotocamera.", "UNAVAILABLE");
                });
        });
    }

    private void riceviScansione(ActivityResult risposta) {
        PluginCall call = scansioneInCorso;
        if (call == null) return;
        if (risposta.getResultCode() != Activity.RESULT_OK) {
            scansioneInCorso = null;
            if (risposta.getData() != null && risposta.getData().hasExtra(
                ActivityResultContracts.StartIntentSenderForResult.EXTRA_SEND_INTENT_EXCEPTION
            )) {
                call.reject("Impossibile aprire lo scanner. Puoi usare la fotocamera.", "UNAVAILABLE");
            } else {
                call.resolve(new JSObject().put("cancelled", true));
            }
            return;
        }
        GmsDocumentScanningResult scansione = GmsDocumentScanningResult.fromActivityResultIntent(risposta.getData());
        List<GmsDocumentScanningResult.Page> pagine = scansione == null ? null : scansione.getPages();
        if (pagine == null || pagine.isEmpty()) {
            scansioneInCorso = null;
            call.reject("Lo scanner non ha restituito le pagine.", "SCAN_FAILED");
            return;
        }
        if (pagine.size() > limitePagine(call)) {
            scansioneInCorso = null;
            call.reject("Hai raggiunto il limite di pagine per questa bolla.", "PAGE_LIMIT");
            return;
        }
        lavoro.execute(() -> salvaPagine(call, pagine));
    }

    private void salvaPagine(PluginCall call, List<GmsDocumentScanningResult.Page> pagine) {
        String id = UUID.randomUUID().toString();
        File cartella = new File(deposito(), id);
        try {
            rimuoviScansioniScadute();
            if (!cartella.mkdirs()) throw new IOException("Cache non disponibile");
            int rimasti = Math.min(MAX_BYTE, Math.max(1, call.getInt("byteBudget", MAX_BYTE)));
            byte[] buffer = new byte[64 * 1024];
            for (int indice = 0; indice < pagine.size(); indice++) {
                Uri uri = pagine.get(indice).getImageUri();
                File file = new File(cartella, "pagina-" + (indice + 1) + ".jpg");
                try (InputStream input = getContext().getContentResolver().openInputStream(uri);
                     FileOutputStream output = new FileOutputStream(file)) {
                    if (input == null) throw new IOException("Pagina non disponibile");
                    int letti;
                    while ((letti = input.read(buffer)) != -1) {
                        if (letti > rimasti) throw new ScansioneTroppoGrande();
                        output.write(buffer, 0, letti);
                        rimasti -= letti;
                    }
                }
                if (file.length() == 0) throw new IOException("Pagina vuota");
            }
            terminaScansione(call, () -> call.resolve(new JSObject().put("scanId", id).put("pageCount", pagine.size())));
        } catch (ScansioneTroppoGrande e) {
            cancellaCartella(cartella);
            terminaScansione(call, () -> call.reject("Le pagine superano lo spazio disponibile per questa bolla.", "BYTE_LIMIT"));
        } catch (IOException | RuntimeException e) {
            cancellaCartella(cartella);
            terminaScansione(call, () -> call.reject("Impossibile salvare la scansione sul telefono.", "SCAN_FAILED"));
        }
    }

    @PluginMethod
    public void recognizePage(PluginCall call) {
        String id = call.getString("scanId");
        Integer indice = call.getInt("page");
        if (!idValido(id) || indice == null || indice < 1 || indice > MAX_PAGINE) {
            call.reject("Pagina della scansione non disponibile.", "INVALID_PAGE");
            return;
        }
        lavoro.execute(() -> {
            File file = new File(new File(deposito(), id), "pagina-" + indice + ".jpg");
            try {
                InputImage immagine = InputImage.fromFilePath(getContext(), Uri.fromFile(file));
                TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                recognizer.process(immagine).addOnCompleteListener(esito -> {
                    recognizer.close();
                    if (!esito.isSuccessful() || esito.getResult() == null) {
                        call.reject("Testo della pagina non disponibile.", "OCR_FAILED");
                        return;
                    }
                    String testo = esito.getResult().getText();
                    call.resolve(new JSObject().put("text", testo.substring(0, Math.min(8000, testo.length()))));
                });
            } catch (IOException | RuntimeException e) {
                call.reject("Testo della pagina non disponibile.", "OCR_FAILED");
            }
        });
    }

    private void terminaScansione(PluginCall call, Runnable risolvi) {
        getActivity().runOnUiThread(() -> {
            if (scansioneInCorso != call) return;
            scansioneInCorso = null;
            risolvi.run();
        });
    }

    private int limitePagine(PluginCall call) {
        return Math.min(MAX_PAGINE, Math.max(1, call.getInt("pageLimit", MAX_PAGINE)));
    }

    private File deposito() {
        return new File(getContext().getCacheDir(), "scanner-ddt");
    }

    private boolean idValido(String id) {
        return id != null && id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }

    private void rimuoviScansioniScadute() {
        File[] cartelle = deposito().listFiles();
        if (cartelle == null) return;
        long scadenza = System.currentTimeMillis() - GIORNO_MS;
        for (File cartella : cartelle) {
            if (idValido(cartella.getName()) && cartella.lastModified() < scadenza) cancellaCartella(cartella);
        }
    }

    private void cancellaCartella(File cartella) {
        File[] pagine = cartella.listFiles();
        if (pagine != null) for (File pagina : pagine) pagina.delete();
        cartella.delete();
    }

    @Override
    protected void handleOnDestroy() {
        if (launcher != null) launcher.unregister();
        launcher = null;
        scansioneInCorso = null;
        lavoro.shutdown();
    }

    private static class ScansioneTroppoGrande extends IOException {}
}
