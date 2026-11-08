package com.kuska.api.images;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import com.kuska.api.catalog.ResourceNotFoundException;
import com.kuska.api.content.ContentDtos.ImageRequest;
import com.kuska.api.content.ContentDtos.ImageView;
import com.kuska.api.content.ContentRepository;
import com.kuska.api.content.ContentService;

@Service
@Profile("!test")
public class BlobImageService {
    public record UploadResult(String id, String url) { }
    public record ReadResult(String url, int expiresIn) { }
    private final BlobImageStore blobs;
    private final ContentRepository repository;
    private final ContentService content;
    public BlobImageService(BlobImageStore blobs, ContentRepository repository, ContentService content) {
        this.blobs=blobs; this.repository=repository; this.content=content;
    }
    public UploadResult upload(String userId, String kind, String parentId, String imageId, MultipartFile file) {
        validateIds(kind, parentId, imageId);
        requireOwner(userId, kind, parentId);
        // Existing IDs must not be stolen or reassigned to another parent before bytes are written.
        if (kind.equals("servicio") && repository.serviceImageExists(imageId)
                && !parentId.equals(repository.serviceImageParent(imageId))
                || kind.equals("publicacion") && repository.postImageExists(imageId)
                && !parentId.equals(repository.postImageParent(imageId))) {
            throw new AccessDeniedException("La imagen pertenece a otra publicación.");
        }
        if (file.isEmpty() || file.getSize()>5L*1024*1024) throw new IllegalArgumentException("Elige una foto de hasta 5 MB.");
        byte[] bytes;
        try { bytes=file.getBytes(); } catch(IOException failure) { throw new IllegalArgumentException("No se pudo leer la fotografía."); }
        if (bytes.length>5*1024*1024) throw new IllegalArgumentException("Elige una foto de hasta 5 MB.");
        String mime=detectType(bytes);
        if (!mime.equalsIgnoreCase(file.getContentType())) throw new IllegalArgumentException("El tipo de fotografía no coincide con su contenido.");
        String key="kuska/"+kind+"/"+hash(parentId.getBytes(StandardCharsets.UTF_8))+"/"+hash(imageId.getBytes(StandardCharsets.UTF_8))+"/"+hash(bytes);
        String url=blobs.upload(key,bytes,mime);
        // Rechecks owner and active parent inside the existing SQL transaction.
        var request=new ImageRequest(imageId,url,0);
        if(kind.equals("servicio")) content.addServiceImage(userId,parentId,request);
        else content.addPostImage(userId,parentId,request);
        return new UploadResult(imageId,url);
    }
    public ReadResult read(String kind, String imageId) {
        return new ReadResult(blobs.readUrl(reference(kind,imageId)),600);
    }
    public BlobImageStore.StoredImage download(String kind,String imageId) {
        return blobs.download(reference(kind,imageId));
    }
    private String reference(String kind,String imageId) {
        validateIds(kind,"read",imageId);
        ImageView image;
        if(kind.equals("servicio")) {
            String parent=repository.serviceImageParent(imageId);
            content.service(parent);
            image=repository.serviceImage(imageId).orElseThrow(()->new ResourceNotFoundException("Fotografía no disponible."));
        } else {
            String parent=repository.postImageParent(imageId);
            content.post(parent);
            image=repository.postImage(imageId).orElseThrow(()->new ResourceNotFoundException("Fotografía no disponible."));
        }
        return image.url();
    }
    public boolean available() { return blobs.available(); }
    private void requireOwner(String userId,String kind,String parentId) {
        String owner=kind.equals("servicio")?repository.serviceOwner(parentId):repository.postOwner(parentId);
        if(!owner.equals(userId)) throw new AccessDeniedException("Solo puedes adjuntar fotos a tu propio contenido.");
    }
    private void validateIds(String kind,String parent,String image) {
        if(!kind.equals("servicio")&&!kind.equals("publicacion")) throw new IllegalArgumentException("Tipo de publicación inválido.");
        if(parent==null||parent.isBlank()||parent.length()>100||image==null||image.isBlank()||image.length()>100)
            throw new IllegalArgumentException("No se pudo identificar la publicación o fotografía.");
    }
    static String detectType(byte[] bytes) {
        if(bytes.length>=8&&Arrays.equals(Arrays.copyOf(bytes,8),new byte[]{(byte)137,80,78,71,13,10,26,10})) return "image/png";
        if(bytes.length>=3&&(bytes[0]&255)==255&&(bytes[1]&255)==216&&(bytes[2]&255)==255) return "image/jpeg";
        if(bytes.length>=20&&new String(bytes,0,4,StandardCharsets.US_ASCII).equals("RIFF")&&new String(bytes,8,4,StandardCharsets.US_ASCII).equals("WEBP")) return "image/webp";
        throw new IllegalArgumentException("Selecciona una fotografía JPG, PNG o WebP válida.");
    }
    static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch(Exception impossible) { throw new IllegalStateException("No se pudo preparar la fotografía."); }
    }
}
