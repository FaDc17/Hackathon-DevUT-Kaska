package com.kuska.app;

import com.getcapacitor.BridgeActivity;

import com.kuska.app.security.SecureStoragePlugin;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		registerPlugin(SecureStoragePlugin.class);
		super.onCreate(savedInstanceState);
	}
}
