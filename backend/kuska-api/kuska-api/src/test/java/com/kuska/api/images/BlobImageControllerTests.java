package com.kuska.api.images;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.kuska.api.security.AuthenticatedUser;
import com.kuska.api.catalog.ApiExceptionHandler;

class BlobImageControllerTests {
    private final BlobImageService service=mock(BlobImageService.class);
    private MockMvc mvc;
    @BeforeEach void setup() {
        mvc=MockMvcBuilders.standaloneSetup(new BlobImageController(service))
            .setControllerAdvice(new ApiExceptionHandler())
            .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new AuthenticatedUser("actual-owner","vecino"),null,List.of()));
    }
    @AfterEach void clear() {SecurityContextHolder.clearContext();}
    @Test void bindsMultipartAndTakesOwnerFromAuthenticatedPrincipal() throws Exception {
        when(service.upload(eq("actual-owner"),eq("servicio"),eq("parent-original"),eq("image-original"),any()))
            .thenReturn(new BlobImageService.UploadResult("image-original","https://blobkuska.blob.core.windows.net/imagenes/kuska/photo"));
        mvc.perform(multipart("/api/imagenes").file(new MockMultipartFile("archivo","foto.png","image/png",new byte[]{1,2,3}))
            .param("tipo","servicio").param("entidadId","parent-original").param("imagenId","image-original").param("userId","forged-owner"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value("image-original"));
        verify(service).upload(eq("actual-owner"),eq("servicio"),eq("parent-original"),eq("image-original"),any());
    }
    @Test void missingParentIsAHelpful400InsteadOfAnInternalError() throws Exception {
        mvc.perform(multipart("/api/imagenes").file(new MockMultipartFile("archivo",new byte[]{1})))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("IMAGE_FIELDS_REQUIRED"));
        verifyNoInteractions(service);
    }
    @Test void oversizedImageUsesTheGlobal413Response() throws Exception {
        when(service.upload(any(),any(),any(),any(),any()))
            .thenThrow(new org.springframework.web.multipart.MaxUploadSizeExceededException(10L*1024*1024));
        mvc.perform(multipart("/api/imagenes").file(new MockMultipartFile("archivo","foto.png","image/png",new byte[]{1}))
            .param("tipo","servicio").param("entidadId","parent").param("imagenId","image"))
            .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.error").value("IMAGE_TOO_LARGE"))
            .andExpect(jsonPath("$.message").value("La fotografía es demasiado grande. Elige una más pequeña."));
    }
    @Test void temporaryReadPermissionsAreNeverHttpCached() throws Exception {
        when(service.read("servicio","image-original")).thenReturn(new BlobImageService.ReadResult("https://blobkuska.blob.core.windows.net/imagenes/kuska/photo?sig=test-only",600));
        mvc.perform(get("/api/imagenes/servicio/image-original/acceso")).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.expiresIn").value(600));
    }
    @Test void storageFailureReturns503WithoutAnyCredentialDetails() throws Exception {
        when(service.available()).thenThrow(new BlobUnavailableException());
        mvc.perform(get("/api/imagenes/estado")).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.error").value("BLOB_UNAVAILABLE"));
    }
}
