package com.kuska.api.images;

import java.time.Instant;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.kuska.api.security.AuthenticatedUser;

@RestController
@Profile("!test")
@RequestMapping("/api/imagenes")
public class BlobImageController {
    private final BlobImageService images;
    public BlobImageController(BlobImageService images) { this.images=images; }
    @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public BlobImageService.UploadResult upload(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam String tipo,@RequestParam String entidadId,@RequestParam String imagenId,
            @RequestPart("archivo") MultipartFile file) {
        return images.upload(user.id(),tipo,entidadId,imagenId,file);
    }
    @GetMapping("/{tipo}/{imagenId}/acceso")
    public ResponseEntity<BlobImageService.ReadResult> read(@PathVariable String tipo,@PathVariable String imagenId) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(images.read(tipo,imagenId));
    }
    @GetMapping("/estado")
    public Map<String,Boolean> status() { return Map.of("available",images.available()); }
    @GetMapping("/{tipo}/{imagenId}/archivo")
    public ResponseEntity<byte[]> download(@PathVariable String tipo,@PathVariable String imagenId) {
        var image=images.download(tipo,imagenId);
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
            .header("X-Content-Type-Options","nosniff").contentType(MediaType.parseMediaType(image.contentType())).body(image.bytes());
    }
    @ExceptionHandler(BlobUnavailableException.class)
    public ResponseEntity<?> unavailable(BlobUnavailableException error) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("timestamp",Instant.now(),"status",503,"error","BLOB_UNAVAILABLE","message",error.getMessage()));
    }
    @ExceptionHandler({org.springframework.web.bind.MissingServletRequestParameterException.class,
        org.springframework.web.multipart.support.MissingServletRequestPartException.class})
    public ResponseEntity<?> missingFields() {
        return ResponseEntity.badRequest().body(Map.of("status",400,"error","IMAGE_FIELDS_REQUIRED","message","Indica tipo, entidadId, imagenId y el archivo de la fotografía."));
    }
}
