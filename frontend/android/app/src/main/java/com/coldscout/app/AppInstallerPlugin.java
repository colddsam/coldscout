package com.coldscout.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "AppInstaller")
public class AppInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Missing 'path' to APK file");
            return;
        }

        // Capacitor Filesystem returns "file:///..." URIs; strip the scheme so File() works.
        String localPath = path.startsWith("file://") ? Uri.parse(path).getPath() : path;
        if (localPath == null) {
            call.reject("Invalid APK path: " + path);
            return;
        }

        File apk = new File(localPath);
        if (!apk.exists()) {
            call.reject("APK not found at " + localPath);
            return;
        }

        try {
            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to launch installer: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        boolean allowed;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        } else {
            allowed = true;
        }
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }
}
