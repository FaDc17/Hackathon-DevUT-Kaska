package com.kuska.api.images;

import static org.junit.jupiter.api.Assertions.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

/** Actual Azure SDK HTTP against a loopback fixture, never a cloud account. */
class AzureBlobImageStoreTests {
    @Test void usesExistingContainerWithoutOverwriteAndGeneratesOnlyReadHttpsPermission() throws Exception {
        var objects=new ConcurrentHashMap<String,byte[]>();
        var uploads=new AtomicInteger(); var containerCreates=new AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{
            String path=exchange.getRequestURI().getPath();
            exchange.getResponseHeaders().set("x-ms-request-id","test-only-id");
            exchange.getResponseHeaders().set("ETag","\"test-only-etag\"");
            exchange.getResponseHeaders().set("Last-Modified","Sun, 08 Nov 2026 10:00:00 GMT");
            if(exchange.getRequestMethod().equals("PUT")) {
                if(path.equals("/imagenes")) containerCreates.incrementAndGet();
                assertEquals("*",exchange.getRequestHeaders().getFirst("If-None-Match"));
                byte[] data=exchange.getRequestBody().readAllBytes();
                if(objects.putIfAbsent(path,data)!=null) {
                    exchange.getResponseHeaders().set("x-ms-error-code","BlobAlreadyExists");
                    exchange.sendResponseHeaders(412,-1);
                }else {uploads.incrementAndGet();exchange.sendResponseHeaders(201,-1);}
            } else if(exchange.getRequestMethod().equals("HEAD")) {
                if(objects.containsKey(path)) exchange.getResponseHeaders().set("Content-Length",String.valueOf(objects.get(path).length));
                exchange.sendResponseHeaders(path.equals("/imagenes")||objects.containsKey(path)?200:404,-1);
            } else if(exchange.getRequestMethod().equals("GET")&&path.equals("/imagenes")) exchange.sendResponseHeaders(200,-1);
            else if(exchange.getRequestMethod().equals("GET")&&objects.containsKey(path)) {
                byte[] bytes=objects.get(path);exchange.getResponseHeaders().set("Content-Type","image/png");
                exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);
            }
            else exchange.sendResponseHeaders(405,-1);
            exchange.close();
        });
        server.start();
        try {
            String endpoint="http://127.0.0.1:"+server.getAddress().getPort();
            // Deliberately synthetic credentials for a local fixture, not an Azure key.
            String connection="DefaultEndpointsProtocol=http;AccountName=testonly;AccountKey="+Base64.getEncoder().encodeToString(new byte[32])+";BlobEndpoint="+endpoint+";";
            var store=new AzureBlobImageStore(connection,endpoint,"imagenes");
            byte[] data=new byte[]{(byte)137,80,78,71,13,10,26,10,1,2,3,4};
            String reference=store.upload("kuska/service/id/photo/hash",data,"image/png");
            assertEquals(reference,store.upload("kuska/service/id/photo/hash",data,"image/png"));
            assertEquals(1,uploads.get());assertEquals(0,containerCreates.get());
            assertTrue(store.available());
            assertTrue(java.net.URI.create(reference).getPath().contains("/imagenes/kuska/"),reference);
            String access=store.readUrl(reference);
            assertTrue(access.contains("spr=https"));assertTrue(access.contains("sp=r"));
            assertFalse(reference.contains("?"));
            assertArrayEquals(data,store.download(reference).bytes());
            assertThrows(IllegalArgumentException.class,()->store.download(endpoint+"/imagenes/secret"));
            assertThrows(IllegalArgumentException.class,()->store.readUrl("https://unrelated.example.com/photo.png"));
        } finally {server.stop(0);}
    }
}
