package com.kuska.api.images;

public class BlobUnavailableException extends RuntimeException {
    public BlobUnavailableException() { super("No se pudo acceder al almacenamiento de fotos. Inténtalo nuevamente."); }
}
