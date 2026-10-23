package com.inkwell.notes;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(InkwellBridgePlugin.class);
        super.onCreate(savedInstanceState);
        InkwellBridgePlugin.enqueueIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        InkwellBridgePlugin.enqueueIntent(intent);
    }
}
