package me.flyingjranch.recordbook;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "SharedFolder")
public class SharedFolderPlugin extends Plugin {

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Folder pick was cancelled.");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("No folder was returned.");
            return;
        }
        int flags =
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        getContext().getContentResolver().takePersistableUriPermission(uri, flags);

        DocumentFile tree = DocumentFile.fromTreeUri(getContext(), uri);
        JSObject out = new JSObject();
        out.put("id", uri.toString());
        out.put("name", tree != null && tree.getName() != null ? tree.getName() : "Ranch folder");
        call.resolve(out);
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        try {
            DocumentFile file = fileAt(call, true);
            OutputStream stream = getContext().getContentResolver().openOutputStream(file.getUri(), "wt");
            if (stream == null) {
                call.reject("Could not write the file.");
                return;
            }
            stream.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
            stream.close();
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        try {
            DocumentFile file = fileAt(call, false);
            if (file == null || !file.isFile()) {
                JSObject out = new JSObject();
                out.put("missing", true);
                call.resolve(out);
                return;
            }
            InputStream stream = getContext().getContentResolver().openInputStream(file.getUri());
            if (stream == null) {
                call.reject("Could not read the file.");
                return;
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = stream.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            stream.close();
            JSObject out = new JSObject();
            out.put("data", buffer.toString("UTF-8"));
            call.resolve(out);
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        try {
            folderAt(call.getString("folderId"), call.getString("path", ""), true);
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void readdir(PluginCall call) {
        try {
            DocumentFile folder = folderAt(call.getString("folderId"), call.getString("path", ""), false);
            JSArray entries = new JSArray();
            if (folder != null) {
                for (DocumentFile child : folder.listFiles()) {
                    JSObject entry = new JSObject();
                    entry.put("name", child.getName() == null ? "" : child.getName());
                    entry.put("isDir", child.isDirectory());
                    entry.put("mtime", child.lastModified());
                    entries.put(entry);
                }
            }
            JSObject out = new JSObject();
            out.put("entries", entries);
            call.resolve(out);
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void exists(PluginCall call) {
        try {
            DocumentFile node = nodeAt(call.getString("folderId"), call.getString("path", ""), false);
            JSObject out = new JSObject();
            out.put("exists", node != null && node.exists());
            out.put("isDirectory", node != null && node.isDirectory());
            call.resolve(out);
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    private DocumentFile root(String folderId) throws Exception {
        if (folderId == null || folderId.isEmpty()) {
            throw new Exception("Choose this ranch's folder in Settings.");
        }
        Uri uri = Uri.parse(folderId);
        DocumentFile tree = DocumentFile.fromTreeUri(getContext(), uri);
        if (tree == null || !tree.exists()) {
            throw new Exception("This ranch's folder is not available. Choose it again in Settings.");
        }
        return tree;
    }

    private DocumentFile folderAt(String folderId, String path, boolean create) throws Exception {
        DocumentFile current = root(folderId);
        for (String part : splitPath(path)) {
            DocumentFile next = childNamed(current, part);
            if (next == null) {
                if (!create) return null;
                next = current.createDirectory(part);
                if (next == null) {
                    throw new Exception("Could not create folder " + part);
                }
            } else if (!next.isDirectory()) {
                throw new Exception(part + " is a file, not a folder.");
            }
            current = next;
        }
        return current;
    }

    private DocumentFile fileAt(PluginCall call, boolean create) throws Exception {
        String folderId = call.getString("folderId");
        String path = call.getString("path", "");
        List<String> parts = splitPath(path);
        if (parts.isEmpty()) throw new Exception("Missing file path.");
        String name = parts.remove(parts.size() - 1);
        String parentPath = String.join("/", parts);
        DocumentFile parent = folderAt(folderId, parentPath, create);
        if (parent == null) return null;
        DocumentFile file = childNamed(parent, name);
        if (file != null && file.isFile()) return file;
        if (!create) return null;
        if (file != null && file.isDirectory()) {
            throw new Exception(name + " is a folder.");
        }
        DocumentFile created = parent.createFile("text/plain", name);
        if (created == null) throw new Exception("Could not create " + name);
        return created;
    }

    private DocumentFile nodeAt(String folderId, String path, boolean create) throws Exception {
        List<String> parts = splitPath(path);
        if (parts.isEmpty()) return root(folderId);
        DocumentFile current = root(folderId);
        for (int i = 0; i < parts.size(); i++) {
            DocumentFile next = childNamed(current, parts.get(i));
            if (next == null) {
                if (!create) return null;
                boolean last = i == parts.size() - 1;
                next = last ? current.createFile("text/plain", parts.get(i)) : current.createDirectory(parts.get(i));
                if (next == null) return null;
            }
            current = next;
        }
        return current;
    }

    private DocumentFile childNamed(DocumentFile parent, String name) {
        DocumentFile[] children = parent.listFiles();
        if (children == null) return null;
        for (DocumentFile child : children) {
            if (name.equals(child.getName())) return child;
        }
        return null;
    }

    private List<String> splitPath(String path) {
        List<String> parts = new ArrayList<>();
        if (path == null) return parts;
        for (String part : path.split("/")) {
            if (!part.isEmpty() && !".".equals(part)) parts.add(part);
        }
        return parts;
    }
}
