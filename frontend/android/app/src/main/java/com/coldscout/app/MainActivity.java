package com.coldscout.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String DEFAULT_CHANNEL_ID = "coldscout_default";
    private static final CharSequence DEFAULT_CHANNEL_NAME = "Cold Scout";
    private static final String DEFAULT_CHANNEL_DESC =
        "Pipeline progress, app updates, and system alerts.";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppInstallerPlugin.class);
        super.onCreate(savedInstanceState);
        ensureDefaultNotificationChannel();
    }

    /**
     * Create the channel the backend posts to (id "coldscout_default").
     * Android 8+ silently drops notifications targeting an unknown
     * channel, so this MUST run before any push arrives — that's why we
     * do it on every cold launch instead of lazily on first push.
     * Re-creating an existing channel is a no-op.
     */
    private void ensureDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            DEFAULT_CHANNEL_ID,
            DEFAULT_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(DEFAULT_CHANNEL_DESC);
        channel.enableLights(true);
        channel.enableVibration(true);
        nm.createNotificationChannel(channel);
    }
}
