package me.flyingjranch.recordbook;

import android.content.Intent;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Catches the OAuth redirect from Chrome Custom Tabs. Google Web clients cannot
 * use a custom URI scheme, and loading accounts.google.com in the Capacitor
 * WebView is rejected with disallowed_useragent.
 */
final class OauthLoopbackServer {
    /** Keep in sync with NATIVE_OAUTH_CALLBACK in src/sync/pkce.ts */
    static final int PORT = 18763;

    private static final String TAG = "OauthLoopback";
    private static final Object LOCK = new Object();
    private static ServerSocket server;
    private static WeakReference<BridgeActivity> activityRef = new WeakReference<>(null);

    static void bind(BridgeActivity activity) {
        activityRef = new WeakReference<>(activity);
        ensureStarted();
    }

    private static void ensureStarted() {
        synchronized (LOCK) {
            if (server != null && !server.isClosed()) {
                return;
            }
            try {
                ServerSocket next = new ServerSocket();
                next.setReuseAddress(true);
                next.bind(new InetSocketAddress("127.0.0.1", PORT));
                server = next;
                Thread worker = new Thread(OauthLoopbackServer::acceptLoop, "oauth-loopback");
                worker.setDaemon(true);
                worker.start();
            } catch (IOException e) {
                Log.e(TAG, "Could not bind OAuth loopback port " + PORT, e);
            }
        }
    }

    private static void acceptLoop() {
        while (true) {
            ServerSocket current;
            synchronized (LOCK) {
                current = server;
            }
            if (current == null || current.isClosed()) {
                return;
            }
            try {
                Socket socket = current.accept();
                handle(socket);
            } catch (IOException e) {
                synchronized (LOCK) {
                    if (server == null || server.isClosed()) {
                        return;
                    }
                }
                Log.w(TAG, "OAuth loopback accept failed", e);
            }
        }
    }

    private static void handle(Socket socket) {
        try {
            socket.setSoTimeout(5000);
            String requestLine = readRequestLine(socket.getInputStream());
            String target = requestTarget(requestLine);
            boolean callback = target.startsWith("/oauth/callback");
            writeResponse(socket.getOutputStream(), callback);
            if (callback) {
                int q = target.indexOf('?');
                String query = q >= 0 ? target.substring(q) : "";
                deliver(query);
            }
        } catch (IOException e) {
            Log.w(TAG, "OAuth loopback request failed", e);
        } finally {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }

    private static String readRequestLine(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\n') {
                break;
            }
            if (b != '\r') {
                line.write(b);
                if (line.size() > 8192) {
                    break;
                }
            }
        }
        return line.toString(StandardCharsets.US_ASCII);
    }

    private static String requestTarget(String requestLine) {
        String[] parts = requestLine.split(" ");
        return parts.length >= 2 ? parts[1] : "";
    }

    private static void writeResponse(OutputStream out, boolean ok) throws IOException {
        String body =
            ok
                ? "<!doctype html><title>Record Book</title><p>You can return to Record Book.</p>"
                : "<!doctype html><title>Record Book</title><p>Not found.</p>";
        String status = ok ? "200 OK" : "404 Not Found";
        String response =
            "HTTP/1.1 " +
            status +
            "\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " +
            body.getBytes(StandardCharsets.UTF_8).length +
            "\r\nConnection: close\r\n\r\n" +
            body;
        out.write(response.getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private static void deliver(String query) {
        BridgeActivity activity = activityRef.get();
        if (activity == null) {
            return;
        }
        activity.runOnUiThread(() -> {
            if (activity.getBridge() != null && activity.getBridge().getWebView() != null) {
                activity.getBridge().getWebView().loadUrl("https://localhost/oauth/callback" + query);
            }
            Intent intent = new Intent(activity, activity.getClass());
            intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            activity.startActivity(intent);
        });
    }
}
