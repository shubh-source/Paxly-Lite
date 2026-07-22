package com.vlynxly.app;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(MediaFetcherPlugin.class);
        // Bind the interface so JS can call `Android.showIncomingCall(...)`
        this.bridge.getWebView().addJavascriptInterface(new WebAppInterface(this), "Android");
    }
}


