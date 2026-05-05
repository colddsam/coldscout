package com.coldscout.app;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

/**
 * Process-scoped initialization that runs before any Activity, Service, or
 * BroadcastReceiver in this app — including FCM's MessagingService.
 *
 * Why this exists:
 *
 * FCM delivers a "notification" message by spinning up the
 * FirebaseMessagingService inside our process and asking the system to render
 * the notification on the channel ID specified by the server (or the
 * AndroidManifest default). On Android 8+ the system silently drops the
 * notification if the channel does not exist yet. Creating the channel inside
 * MainActivity.onCreate is too late for this case — when the app is killed
 * and a push wakes the process, MessagingService runs but MainActivity does
 * not, so the channel would not exist on the very first push after install.
 *
 * Application.onCreate is guaranteed to run for every process startup
 * (Activity-driven cold launch, Service-driven cold launch from FCM, content
 * provider start, etc.), so creating the channel here closes that hole.
 *
 * Re-creating an existing channel is a no-op, so this is safe to call on
 * every process start.
 */
public class ColdScoutApplication extends Application {
    private static final String DEFAULT_CHANNEL_ID = "coldscout_default";
    private static final CharSequence DEFAULT_CHANNEL_NAME = "Cold Scout";
    private static final String DEFAULT_CHANNEL_DESC =
        "Pipeline progress, app updates, and system alerts.";

    @Override
    public void onCreate() {
        super.onCreate();
        ensureDefaultNotificationChannel();
    }

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
