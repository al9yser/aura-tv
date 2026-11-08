package com.aura.iptv;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuraPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
