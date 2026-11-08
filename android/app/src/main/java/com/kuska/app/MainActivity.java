package com.kuska.app;

import com.getcapacitor.BridgeActivity;

import com.kuska.app.security.SecureStoragePlugin;
import com.kuska.app.media.PersistentImagesPlugin;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		registerPlugin(SecureStoragePlugin.class);
		registerPlugin(PersistentImagesPlugin.class);
		super.onCreate(savedInstanceState);
	}
}
