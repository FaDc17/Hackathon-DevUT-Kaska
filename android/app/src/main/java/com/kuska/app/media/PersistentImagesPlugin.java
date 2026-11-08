package com.kuska.app.media;

import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

/** Images live in private app storage, independently of the original picker URI. */
@CapacitorPlugin(name = "PersistentImages")
public class PersistentImagesPlugin extends Plugin {
    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    private static final int MAX_DATA_URL_CHARACTERS = ((MAX_IMAGE_BYTES + 2) / 3) * 4 + 128;
    @PluginMethod
    public void remove(PluginCall call) {
        String value = call.getString("uri");
        if (value == null) { call.reject("No se pudo identificar la fotografía."); return; }
        try {
            Uri uri = Uri.parse(value);
            String scheme = uri.getScheme();
            if (scheme != null && !scheme.equals("file")
                    && !((scheme.equals("https") || scheme.equals("http")) && "localhost".equals(uri.getHost()))) {
                call.reject("Solo se pueden limpiar fotografías guardadas por Kuska."); return;
            }
            String path = uri.getPath();
            if (path == null) throw new IllegalArgumentException();
            if (path.startsWith("/_capacitor_file_/")) path = path.substring("/_capacitor_file_".length());
            File directory = new File(getContext().getFilesDir(), "kuska-images").getCanonicalFile();
            File target = new File(path).getCanonicalFile();
            if (!target.getPath().startsWith(directory.getPath() + File.separator) || target.isDirectory()) {
                call.reject("Solo se pueden limpiar fotografías guardadas por Kuska."); return;
            }
            if (target.exists() && !target.delete()) throw new java.io.IOException();
            call.resolve();
        } catch (Exception exception) {
            call.reject("No se pudo limpiar la fotografía guardada.");
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        String id = call.getString("id");
        String dataUrl = call.getString("dataUrl");
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,120}") || dataUrl == null
                || !dataUrl.matches("(?s)^data:image/(jpeg|png|webp);base64,.+")) {
            call.reject("Selecciona una fotografía JPG, PNG o WebP.");
            return;
        }
        if (dataUrl.length() > MAX_DATA_URL_CHARACTERS) {
            call.reject("La fotografía es demasiado grande. Selecciona otra de hasta 10 MB.");
            return;
        }
        File temporary = null;
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), Base64.DEFAULT);
            if (bytes.length > MAX_IMAGE_BYTES) {
                call.reject("La fotografía es demasiado grande. Selecciona otra de hasta 10 MB.");
                return;
            }
            File directory = new File(getContext().getFilesDir(), "kuska-images");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException();
            String extension = dataUrl.startsWith("data:image/png") ? ".png"
                    : dataUrl.startsWith("data:image/webp") ? ".webp" : ".jpg";
            File destination = new File(directory, id + extension);
            temporary = File.createTempFile("upload-", ".tmp", directory);
            try (FileOutputStream stream = new FileOutputStream(temporary)) {
                stream.write(bytes);
                stream.getFD().sync();
            }
            if (!temporary.renameTo(destination)) throw new java.io.IOException();
            JSObject result = new JSObject();
            result.put("uri", Uri.fromFile(destination).toString());
            call.resolve(result);
        } catch (Exception exception) {
            if (temporary != null) temporary.delete();
            call.reject("No se pudo guardar la fotografía en el teléfono.");
        }
    }
}
