package com.kuska.api.images;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import com.azure.storage.blob.BlobClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import com.azure.core.util.Context;
import com.azure.core.util.BinaryData;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.BlobServiceClientBuilder;
import com.azure.storage.blob.models.BlobHttpHeaders;
import com.azure.storage.blob.models.BlobRequestConditions;
import com.azure.storage.blob.models.BlobStorageException;
import com.azure.storage.blob.options.BlobParallelUploadOptions;
import com.azure.storage.blob.sas.BlobSasPermission;
import com.azure.storage.blob.sas.BlobServiceSasSignatureValues;
import com.azure.storage.common.sas.SasProtocol;

@Component
@Profile("!test")
public class AzureBlobImageStore implements BlobImageStore {
    private final String connectionString, endpoint, containerName;
    private volatile BlobServiceClient service;
    public AzureBlobImageStore(@Value("${azure.storage.connection-string:}") String connectionString,
            @Value("${azure.storage.endpoint:https://blobkuska.blob.core.windows.net}") String endpoint,
            @Value("${azure.storage.container:imagenes}") String containerName) {
        this.connectionString = connectionString; this.endpoint = endpoint; this.containerName = containerName;
    }
    private synchronized BlobServiceClient client() {
        if (service == null) {
            var builder = new BlobServiceClientBuilder();
            if (!connectionString.isBlank()) builder.connectionString(connectionString);
            else builder.endpoint(endpoint).credential(new DefaultAzureCredentialBuilder().build());
            service = builder.buildClient();
        }
        return service;
    }
    private BlobContainerClient container() { return client().getBlobContainerClient(containerName); }
    private BlobClient existingBlob(String reference) {
        var container=container();
        String prefix=container.getBlobContainerUrl()+"/";
        if(!reference.startsWith(prefix)||reference.contains("?")||reference.contains("#"))
            throw new IllegalArgumentException("Esta referencia no pertenece al almacenamiento de Kuska.");
        String name=URLDecoder.decode(reference.substring(prefix.length()),StandardCharsets.UTF_8);
        if(!name.startsWith("kuska/")||name.contains("..")||name.contains("\\"))
            throw new IllegalArgumentException("Esta referencia no pertenece al almacenamiento de Kuska.");
        return container.getBlobClient(name);
    }
    @Override public String upload(String key, byte[] bytes, String contentType) {
        try {
            var blob = container().getBlobClient(key);
            try {
                blob.uploadWithResponse(new BlobParallelUploadOptions(BinaryData.fromBytes(bytes))
                    .setHeaders(new BlobHttpHeaders().setContentType(contentType).setCacheControl("private, max-age=300"))
                    .setMetadata(Map.of("sha256", key.substring(key.lastIndexOf('/') + 1)))
                    .setRequestConditions(new BlobRequestConditions().setIfNoneMatch("*")), Duration.ofSeconds(30), Context.NONE);
            } catch (BlobStorageException conflict) {
                // The key includes the complete SHA-256: a retry never overwrites an earlier photo.
                if (conflict.getStatusCode() != 409 && conflict.getStatusCode() != 412) throw conflict;
                if (blob.getProperties().getBlobSize() != bytes.length) throw new BlobUnavailableException();
            }
            return blob.getBlobUrl();
        } catch (RuntimeException failure) { throw new BlobUnavailableException(); }
    }
    @Override public String readUrl(String permanentUrl) {
        try {
            var blob = existingBlob(permanentUrl);
            var now = OffsetDateTime.now(ZoneOffset.UTC);
            var values = new BlobServiceSasSignatureValues(now.plusMinutes(10), new BlobSasPermission().setReadPermission(true))
                .setStartTime(now.minusMinutes(1)).setProtocol(SasProtocol.HTTPS_ONLY);
            String sas = !connectionString.isBlank() ? blob.generateSas(values)
                : blob.generateUserDelegationSas(values, client().getUserDelegationKey(now.minusMinutes(1), now.plusMinutes(15)));
            return blob.getBlobUrl() + "?" + sas;
        } catch (IllegalArgumentException invalid) { throw invalid; }
        catch (RuntimeException failure) { throw new BlobUnavailableException(); }
    }
    @Override public boolean available() {
        try { return container().exists(); } catch (RuntimeException failure) { throw new BlobUnavailableException(); }
    }
    @Override public StoredImage download(String permanentUrl) {
        try {
            var blob=existingBlob(permanentUrl);
            if(blob.getProperties().getBlobSize()>5L*1024*1024) throw new BlobUnavailableException();
            byte[] bytes=blob.downloadContent().toBytes();
            if(bytes.length>5*1024*1024) throw new BlobUnavailableException();
            return new StoredImage(bytes,BlobImageService.detectType(bytes));
        } catch(IllegalArgumentException invalid) {throw invalid;}
        catch(RuntimeException failure) {throw new BlobUnavailableException();}
    }
}
