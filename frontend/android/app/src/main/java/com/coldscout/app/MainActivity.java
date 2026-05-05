package com.coldscout.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppInstallerPlugin.class);
        super.onCreate(savedInstanceState);
        // Notification channel is created in ColdScoutApplication.onCreate so
        // that FCM-driven cold starts (where this Activity never runs) still
        // have the "coldscout_default" channel ready before MessagingService
        // tries to render a notification.
    }
}
