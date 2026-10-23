package com.inkwell.notes;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

/**
 * Bridge between the Vue app and native Android bits:
 *  - queues launcher-widget / share intents so the web layer can drain them
 *  - pushes note snapshots to the home-screen widgets
 *  - runtime permission helper for microphone access (MediaRecorder in WebView)
 */
@CapacitorPlugin(
        name = "InkwellBridge",
        permissions = {
                @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone")
        }
)
public class InkwellBridgePlugin extends Plugin {

    private static final List<String> PENDING = new ArrayList<>();
    private static WeakReference<InkwellBridgePlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    /* ------------------------------------------------------------------ */
    /* Intent queueing (called from MainActivity)                          */
    /* ------------------------------------------------------------------ */

    public static void enqueueIntent(Intent intent) {
        if (intent == null) return;
        String json = describeIntent(intent);
        if (json == null) return;
        synchronized (PENDING) {
            PENDING.add(json);
        }
        InkwellBridgePlugin plugin = instance.get();
        if (plugin != null) {
            try {
                plugin.notifyListeners("bridgeAction", new JSObject(json));
            } catch (Exception ignored) {
            }
        }
    }

    private static String describeIntent(Intent intent) {
        try {
            JSONObject obj = new JSONObject();
            String shortcut = intent.getStringExtra("inkwell_action");
            if (shortcut != null) {
                obj.put("type", shortcut);
                String id = intent.getStringExtra("inkwell_id");
                if (id != null) obj.put("id", id);
                return obj.toString();
            }
            String action = intent.getAction();
            if (Intent.ACTION_SEND.equals(action)) {
                String type = intent.getType() == null ? "" : intent.getType();
                if (type.startsWith("text/")) {
                    String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                    obj.put("type", "share_text");
                    obj.put("text", text == null ? "" : text);
                    return obj.toString();
                }
                Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (stream != null) {
                    byte[] data = readUri(stream, 12 * 1024 * 1024);
                    if (data != null) {
                        obj.put("type", "share_media");
                        obj.put("mime", type);
                        JSObject item = new JSObject();
                        item.put("name", "shared-" + System.currentTimeMillis());
                        item.put("dataUrl", "data:" + type + ";base64," + Base64.encodeToString(data, Base64.NO_WRAP));
                        JSArray items = new JSArray();
                        items.put(item);
                        obj.put("items", items);
                        return obj.toString();
                    }
                }
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] readUri(Uri uri, int maxBytes) {
        try {
            InputStream in = AppHolder.context().getContentResolver().openInputStream(uri);
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int read;
            int total = 0;
            while ((read = in.read(buf)) != -1) {
                total += read;
                if (total > maxBytes) {
                    in.close();
                    return null;
                }
                out.write(buf, 0, read);
            }
            in.close();
            return out.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Plugin methods (called from JS)                                     */
    /* ------------------------------------------------------------------ */

    @PluginMethod()
    public void getPendingActions(PluginCall call) {
        JSObject ret = new JSObject();
        JSArray arr = new JSArray();
        synchronized (PENDING) {
            for (String s : PENDING) arr.put(s);
            PENDING.clear();
        }
        ret.put("actions", arr);
        call.resolve(ret);
    }

    @PluginMethod()
    public void syncWidgetData(PluginCall call) {
        String json = call.getString("json", "{}");
        WidgetStore.save(getContext(), json);
        WidgetStore.refreshWidgets(getContext());
        call.resolve();
    }

    @PluginMethod()
    public void requestAudioPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("microphone", call, "audioPermissionCallback");
    }

    @PermissionCallback()
    private void audioPermissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED);
        call.resolve(ret);
    }
}
