package com.kuska.api.images;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import com.kuska.api.content.ContentDtos.ImageRequest;
import com.kuska.api.content.ContentDtos.ImageView;
import com.kuska.api.content.ContentRepository;
import com.kuska.api.content.ContentService;

class BlobImageServiceTests {
    private final BlobImageStore store=mock(BlobImageStore.class);
    private final ContentRepository repo=mock(ContentRepository.class);
    private final ContentService content=mock(ContentService.class);
    private final BlobImageService service=new BlobImageService(store,repo,content);
    private final byte[] png=new byte[]{(byte)137,80,78,71,13,10,26,10,1,2,3,4};
    @BeforeEach void owner() { lenient().when(repo.serviceOwner("service-original")).thenReturn("owner"); }
    private MockMultipartFile image() { return new MockMultipartFile("archivo","unsafe-name.png","image/png",png); }

    @Test void storesOnlyPermanentReferenceAndKeepsOriginalIds() {
        when(store.upload(anyString(),any(),eq("image/png"))).thenReturn("https://blobkuska.blob.core.windows.net/imagenes/kuska/service/hash");
        var result=service.upload("owner","servicio","service-original","image-original",image());
        assertEquals("image-original",result.id()); assertFalse(result.url().contains("?"));
        verify(content).addServiceImage("owner","service-original",new ImageRequest("image-original",result.url(),0));
    }
    @Test void retryReusesContentAddressedKeyAndNewBytesGetDifferentKey() {
        when(store.upload(anyString(),any(),anyString())).thenReturn("https://blobkuska.blob.core.windows.net/imagenes/kuska/file");
        service.upload("owner","servicio","service-original","image-original",image());
        service.upload("owner","servicio","service-original","image-original",image());
        byte[] different=png.clone(); different[11]=5;
        service.upload("owner","servicio","service-original","image-original",new MockMultipartFile("archivo","foto.png","image/png",different));
        var keys=org.mockito.ArgumentCaptor.forClass(String.class);
        verify(store,times(3)).upload(keys.capture(),any(),anyString());
        assertEquals(keys.getAllValues().get(0),keys.getAllValues().get(1));
        assertNotEquals(keys.getAllValues().get(0),keys.getAllValues().get(2));
        assertTrue(keys.getAllValues().getFirst().startsWith("kuska/servicio/"));
        assertFalse(keys.getAllValues().getFirst().contains("unsafe-name"));
    }
    @Test void rejectsAnotherOwnerBeforeWritingAnyBytes() {
        assertThrows(AccessDeniedException.class,()->service.upload("stranger","servicio","service-original","image-original",image()));
        verifyNoInteractions(store,content);
    }
    @Test void rejectsReassigningAnExistingImageToAnotherParent() {
        when(repo.serviceImageExists("stolen")).thenReturn(true);
        when(repo.serviceImageParent("stolen")).thenReturn("another-service");
        assertThrows(AccessDeniedException.class,()->service.upload("owner","servicio","service-original","stolen",image()));
        verifyNoInteractions(store,content);
    }
    @Test void rejectsFakeMimeAndUnsupportedBytes() {
        assertThrows(IllegalArgumentException.class,()->service.upload("owner","servicio","service-original","image-original",new MockMultipartFile("archivo","fake.jpg","image/jpeg",png)));
        assertThrows(IllegalArgumentException.class,()->service.upload("owner","servicio","service-original","image-original",new MockMultipartFile("archivo","fake.png","image/png","<svg onload='bad'/>".getBytes())));
        verifyNoInteractions(store,content);
    }
    @Test void rejectsOversizeBeforeReadingTheFile() throws Exception {
        var huge=mock(org.springframework.web.multipart.MultipartFile.class);
        when(huge.getSize()).thenReturn(11L*1024*1024);
        assertThrows(org.springframework.web.multipart.MaxUploadSizeExceededException.class,()->service.upload("owner","servicio","service-original","image-original",huge));
        verify(huge,never()).getBytes(); verifyNoInteractions(store,content);
    }
    @Test void acceptsImagesLargerThanTheOldOneMegabyteLimit() {
        byte[] bytes=java.util.Arrays.copyOf(png,2*1024*1024);
        when(store.upload(anyString(),any(),eq("image/png"))).thenReturn("https://blobkuska.blob.core.windows.net/imagenes/kuska/large");
        var result=service.upload("owner","servicio","service-original","image-original",new MockMultipartFile("archivo","foto.png","image/png",bytes));
        assertTrue(result.url().endsWith("/large"));
        verify(content).addServiceImage(eq("owner"),eq("service-original"),any());
    }
    @Test void storageFailureNeverCreatesAFalseSqlReference() {
        when(store.upload(anyString(),any(),anyString())).thenThrow(new BlobUnavailableException());
        assertThrows(BlobUnavailableException.class,()->service.upload("owner","servicio","service-original","image-original",image()));
        verifyNoInteractions(content);
    }
    @Test void readsOnlyExistingImagesOfAnAvailableParent() {
        when(repo.serviceImageParent("image-original")).thenReturn("service-original");
        when(repo.serviceImage("image-original")).thenReturn(Optional.of(new ImageView("image-original","https://blobkuska.blob.core.windows.net/imagenes/kuska/file",0,null)));
        when(store.readUrl(anyString())).thenReturn("https://blobkuska.blob.core.windows.net/imagenes/kuska/file?sig=test-only");
        assertEquals(600,service.read("servicio","image-original").expiresIn());
        verify(content).service("service-original");
    }
    @Test void alsoAttachesEmergencyPublicationImagesUsingExistingPostTables() {
        when(repo.postOwner("post-original")).thenReturn("owner");
        when(store.upload(anyString(),any(),anyString())).thenReturn("https://blobkuska.blob.core.windows.net/imagenes/kuska/post/file");
        service.upload("owner","publicacion","post-original","photo",image());
        verify(content).addPostImage(eq("owner"),eq("post-original"),any());
    }
}
