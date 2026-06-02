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
        // Bind the interface so JS can call `Android.showIncomingCall(...)`
        this.bridge.getWebView().addJavascriptInterface(new WebAppInterface(this), "Android");
    }
}

class WebAppInterface {
    Context mContext;

    public WebAppInterface(Context c) {
        mContext = c;
    }

    @JavascriptInterface
    public void showIncomingCall(String callerName, String callType) {
        if (Settings.canDrawOverlays(mContext)) {
            Intent intent = new Intent(mContext, IncomingCallActivity.class);
            intent.putExtra("CALLER_NAME", callerName);
            intent.putExtra("CALL_TYPE", callType);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            mContext.startActivity(intent);
        } else {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + mContext.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            mContext.startActivity(intent);
        }
    }
}
