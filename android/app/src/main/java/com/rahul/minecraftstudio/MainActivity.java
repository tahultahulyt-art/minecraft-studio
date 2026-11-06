package com.rahul.minecraftstudio;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.Collections;
import org.json.JSONObject;
import androidx.webkit.WebViewClientCompat;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQ = 1001;
    private static final int SAVE_VIDEO_REQ = 1002;
    private File pendingVideo;
    private FileOutputStream exportStream;
    private long exportBytes;
    private boolean saveBusy;
    private void finishSave(String text) {
        saveBusy = false;
        exportStatus(text);
        webView.evaluateJavascript("window.dispatchEvent(new Event(" + JSONObject.quote("alya-save-finished") + "))", null);
    }
    private void exportStatus(String text) {
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('alya-save-status',{detail:" + JSONObject.quote(text) + "}))", null);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage (projects index, bg, key)
        s.setDatabaseEnabled(true);            // IndexedDB (project media)
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true); // Android document picker media URIs
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("https".equals(u.getScheme()) && "appassets.androidplatform.net".equals(u.getHost())) return false;
                if ("https".equals(u.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                }
                return true;
            }
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        // <input type=file> support (clip/photo/music/background import)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "Files chuno"), FILE_CHOOSER_REQ); }
                catch (Exception ex) {
                    filePathCallback.onReceiveValue(null); filePathCallback = null;
                    exportStatus("File picker unavailable on this device.");
                }
                return true;
            }
        });

        // This bridge accepts only messages from the bundled HTTPS origin.
        // It writes one bounded MP4 cache file and launches Android's user-save picker.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "AlyaSave",
                Collections.singleton("https://appassets.androidplatform.net"),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame) return;
                    try {
                        String data = message.getData();
                        if (data == null) return;
                        if (data.equals("abort") && exportStream != null) {
                            exportStream.close(); exportStream = null;
                            if (pendingVideo != null) { pendingVideo.delete(); pendingVideo = null; }
                            finishSave("Save stopped. Export again to retry.");
                        } else if (data.equals("begin")) {
                            if (saveBusy) { exportStatus("A save is already in progress."); return; }
                            saveBusy = true;
                            pendingVideo = File.createTempFile("alya-export-", ".mp4", getCacheDir());
                            exportStream = new FileOutputStream(pendingVideo); exportBytes = 0;
                        } else if (data.startsWith("chunk:") && exportStream != null) {
                            if (data.length() > 200000) throw new Exception("Chunk too large");
                            byte[] bytes = Base64.decode(data.substring(6), Base64.DEFAULT);
                            exportBytes += bytes.length;
                            if (exportBytes > 512L * 1024 * 1024) throw new Exception("Export over 512MB");
                            exportStream.write(bytes);
                        } else if (data.equals("end") && exportStream != null) {
                            exportStream.close(); exportStream = null;
                            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                            save.addCategory(Intent.CATEGORY_OPENABLE); save.setType("video/mp4");
                            save.putExtra(Intent.EXTRA_TITLE, "alya-edit-" + System.currentTimeMillis() + ".mp4");
                            startActivityForResult(save, SAVE_VIDEO_REQ);
                            exportStatus("Choose where to save the video.");
                        }
                    } catch (Exception ex) {
                        try { if (exportStream != null) exportStream.close(); } catch (Exception ignored) {}
                        exportStream = null;
                        if (pendingVideo != null) { pendingVideo.delete(); pendingVideo = null; }
                        finishSave("Save failed: " + ex.getMessage());
                    }
                });
        }
        setContentView(webView);
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SAVE_VIDEO_REQ) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingVideo != null) {
                final Uri destination = data.getData();
                final File video = pendingVideo;
                pendingVideo = null;
                new Thread(() -> {
                    String status;
                    try (FileInputStream in = new FileInputStream(video);
                         OutputStream out = getContentResolver().openOutputStream(destination)) {
                        if (out == null) throw new Exception("Cannot open destination");
                        byte[] buffer = new byte[65536]; int n;
                        while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                        status = "Video saved.";
                    } catch (Exception ex) { status = "Save failed: " + ex.getMessage(); }
                    video.delete();
                    final String result = status; runOnUiThread(() -> finishSave(result));
                }).start();
            } else { if (pendingVideo != null) { pendingVideo.delete(); pendingVideo = null; } finishSave("Save cancelled. Export again to retry."); }
        }
        if (requestCode == FILE_CHOOSER_REQ && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    results = new Uri[n];
                    for (int i = 0; i < n; i++) results[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
