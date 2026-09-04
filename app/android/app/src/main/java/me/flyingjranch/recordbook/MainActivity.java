package me.flyingjranch.recordbook;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

/**
 * Google Drive scopes go through AuthorizationClient. Capgo rejects extra scopes
 * unless this activity implements ModifiedMainActivityForSocialLoginPlugin and
 * forwards the result. See https://developer.android.com/identity/authorization
 * and https://capgo.app/docs/plugins/social-login/google/android/
 *
 * Dropbox/Google custom-scheme returns also land here (singleTask). Keep that
 * intent on getIntent() so the plugin and JS appUrlOpen listener can finish
 * sign-in without the WebView treating the URI as a page load.
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    private static final String TAG = "HerdLedgerAuth";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SharedFolderPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        if (intent != null) {
            setIntent(intent);
        }
        super.onNewIntent(intent);
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            deliverGoogleAuthorizationResult(requestCode, data);
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void deliverGoogleAuthorizationResult(int requestCode, Intent data) {
        if (getBridge() == null) {
            Log.w(TAG, "Google sign-in result arrived before the Capacitor bridge was ready");
            return;
        }
        PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
        if (pluginHandle == null) {
            Log.w(TAG, "SocialLogin plugin handle is null");
            return;
        }
        Plugin plugin = pluginHandle.getInstance();
        if (!(plugin instanceof SocialLoginPlugin)) {
            Log.w(TAG, "SocialLogin plugin instance is not SocialLoginPlugin");
            return;
        }
        ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
