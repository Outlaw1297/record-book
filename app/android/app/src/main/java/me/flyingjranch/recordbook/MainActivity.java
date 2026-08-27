package me.flyingjranch.recordbook;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SharedFolderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
