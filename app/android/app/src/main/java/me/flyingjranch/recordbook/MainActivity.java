package me.flyingjranch.recordbook;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        OauthLoopbackServer.bind(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        OauthLoopbackServer.bind(this);
    }
}

