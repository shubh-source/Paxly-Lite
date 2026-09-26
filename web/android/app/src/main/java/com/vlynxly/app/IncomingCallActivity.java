package com.vlynxly.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class IncomingCallActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Turn on screen and show over lockscreen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguardManager != null) {
                keyguardManager.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        String callerName = getIntent().getStringExtra("CALLER_NAME");
        if (callerName == null) callerName = "Partner";

        // Create a simple UI programmatically to avoid needing XML layouts
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(Color.parseColor("#1a1614"));

        TextView title = new TextView(this);
        title.setText("Incoming Call...");
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        
        TextView name = new TextView(this);
        name.setText(callerName);
        name.setTextColor(Color.parseColor("#b3945a")); // Gold
        name.setTextSize(32);
        name.setGravity(Gravity.CENTER);
        name.setPadding(0, 20, 0, 100);

        Button answerBtn = new Button(this);
        answerBtn.setText("ANSWER");
        answerBtn.setBackgroundColor(Color.parseColor("#28a745"));
        answerBtn.setTextColor(Color.WHITE);
        answerBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                // Open MainActivity and tell WebApp to answer
                Intent intent = new Intent(IncomingCallActivity.this, MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(intent);
                finish();
            }
        });

        Button declineBtn = new Button(this);
        declineBtn.setText("DECLINE");
        declineBtn.setBackgroundColor(Color.parseColor("#dc3545"));
        declineBtn.setTextColor(Color.WHITE);
        declineBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });

        layout.addView(title);
        layout.addView(name);
        layout.addView(answerBtn);
        
        TextView space = new TextView(this);
        space.setHeight(40);
        layout.addView(space);
        
        layout.addView(declineBtn);

        setContentView(layout);
    }
}
