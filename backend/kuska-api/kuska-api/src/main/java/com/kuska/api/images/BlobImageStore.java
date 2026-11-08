package com.kuska.api.images;

public interface BlobImageStore {
    record StoredImage(byte[] bytes,String contentType) { }
    String upload(String key, byte[] bytes, String contentType);
    String readUrl(String permanentUrl);
    boolean available();
    StoredImage download(String permanentUrl);
}
