package com.vlynxly.app;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Bind the interface so JS can call `Android.showIncomingCall(...)`
        this.bridge.getWebView().addJavascriptInterface(new WebAppInterface(this), "Android");
    }
}
