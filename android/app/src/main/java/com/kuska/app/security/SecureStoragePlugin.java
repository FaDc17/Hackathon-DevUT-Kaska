package com.kuska.app.security;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {
	private static final String KEY_ALIAS = "kuska-session-key";
	private static final String PREFERENCES = "kuska_secure_session";
	private static final String SESSION_KEY = "session";
	private static final int GCM_TAG_BITS = 128;

	@PluginMethod
	public void set(PluginCall call) {
		String value = call.getString("value");
		if (value == null) {
			call.reject("El valor de sesión es obligatorio.");
			return;
		}
		try {
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
			byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
			ByteBuffer payload = ByteBuffer.allocate(cipher.getIV().length + encrypted.length);
			payload.put(cipher.getIV());
			payload.put(encrypted);
			getPreferences().edit()
					.putString(SESSION_KEY, Base64.encodeToString(payload.array(), Base64.NO_WRAP))
					.apply();
			call.resolve();
		} catch (Exception exception) {
			call.reject("No se pudo guardar la sesión en el almacenamiento seguro.");
		}
	}

	@PluginMethod
	public void get(PluginCall call) {
		String encoded = getPreferences().getString(SESSION_KEY, null);
		if (encoded == null) {
			JSObject result = new JSObject();
			result.put("value", JSObject.NULL);
			call.resolve(result);
			return;
		}
		try {
			byte[] payload = Base64.decode(encoded, Base64.NO_WRAP);
			ByteBuffer buffer = ByteBuffer.wrap(payload);
			byte[] iv = new byte[12];
			buffer.get(iv);
			byte[] encrypted = new byte[buffer.remaining()];
			buffer.get(encrypted);

			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
			String value = new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
			JSObject result = new JSObject();
			result.put("value", value);
			call.resolve(result);
		} catch (Exception exception) {
			call.reject("No se pudo leer la sesión del almacenamiento seguro.");
		}
	}

	@PluginMethod
	public void remove(PluginCall call) {
		getPreferences().edit().remove(SESSION_KEY).apply();
		call.resolve();
	}

	private SharedPreferences getPreferences() {
		return getContext().getSharedPreferences(PREFERENCES, android.content.Context.MODE_PRIVATE);
	}

	private SecretKey getOrCreateSecretKey() throws Exception {
		KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
		keyStore.load(null);
		if (keyStore.containsAlias(KEY_ALIAS)) {
			return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
		}

		KeyGenerator keyGenerator = KeyGenerator.getInstance(
				KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
		keyGenerator.init(new KeyGenParameterSpec.Builder(
				KEY_ALIAS,
				KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
				.setBlockModes(KeyProperties.BLOCK_MODE_GCM)
				.setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
				.setRandomizedEncryptionRequired(true)
				.build());
		return keyGenerator.generateKey();
	}
}
