package com.kuska.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.boot.health.registry.HealthContributorRegistry;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;

import com.kuska.api.catalog.CanalAyudaRepository;
import com.kuska.api.catalog.CategoriaServicioRepository;
import com.kuska.api.catalog.DepartamentoRepository;
import com.kuska.api.catalog.DistritoRepository;
import com.kuska.api.catalog.TipoPublicacionRepository;
import com.kuska.api.user.UsuarioRepository;

/** Real loopback HTTP and embedded Tomcat, with database repositories mocked. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"test", "multipart-http-test"})
@Import(BackendHttpSmokeTests.MultipartProbe.class)
class BackendHttpSmokeTests {
	@LocalServerPort int port;
	@MockitoBean DepartamentoRepository departments;
	@MockitoBean DistritoRepository districts;
	@MockitoBean CategoriaServicioRepository categories;
	@MockitoBean TipoPublicacionRepository types;
	@MockitoBean CanalAyudaRepository channels;
	@MockitoBean UsuarioRepository users;
	@Autowired HealthContributorRegistry healthContributors;
	@Autowired JwtService jwtService;

	@DynamicPropertySource
	static void productionMultipartLimits(DynamicPropertyRegistry registry) throws Exception {
		// Exercise the values shipped in production, not Spring's defaults or duplicated test constants.
		var properties = new java.util.Properties();
		try (var stream = java.nio.file.Files.newInputStream(java.nio.file.Path.of("src/main/resources/application.properties"))) {
			properties.load(stream);
		}
		for (String key : new String[] {"spring.servlet.multipart.max-file-size", "spring.servlet.multipart.max-request-size"})
			registry.add(key, () -> properties.getProperty(key));
	}

	@RestController
	@Profile("multipart-http-test")
	static class MultipartProbe {
		@PostMapping("/__verification/multipart")
		java.util.Map<String, Long> upload(@RequestPart("archivo") MultipartFile file) {
			return java.util.Map.of("bytes", file.getSize());
		}
	}

	@Test void acceptsTwoMegabytesThroughTheRealMultipartParser() throws Exception {
		assertEquals(200, uploadBytes(2 * 1024 * 1024).statusCode());
	}

	@Test void acceptsExactlyTenMegabytesIncludingMultipartOverhead() throws Exception {
		var response = uploadBytes(10 * 1024 * 1024);
		assertEquals(200, response.statusCode());
		assertTrue(response.body().contains("10485760"));
	}

	@Test void parserRejectionBeforeControllerSelectionReturnsHelpful413() throws Exception {
		var response = uploadBytes(10 * 1024 * 1024 + 1);
		assertEquals(413, response.statusCode());
		var json = new ObjectMapper().readTree(response.body());
		assertEquals("IMAGE_TOO_LARGE", json.get("error").asString());
		assertFalse(response.body().contains("INTERNAL_ERROR"));
	}

	private HttpResponse<String> uploadBytes(int count) throws Exception {
		org.mockito.Mockito.when(users.existsByIdAndEstadoTrueAndEliminadoFalse("upload-test-user")).thenReturn(true);
		String token = jwtService.createAccessToken(new JwtService.UsuarioTokenSubject("upload-test-user", "vecino"));
		String boundary = "kuska-multipart-verification";
		byte[] prefix = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"archivo\"; filename=\"foto.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII);
		byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII);
		byte[] body = new byte[prefix.length + count + suffix.length];
		System.arraycopy(prefix, 0, body, 0, prefix.length);
		System.arraycopy(suffix, 0, body, prefix.length + count, suffix.length);
		try (HttpClient client = HttpClient.newHttpClient()) {
			var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/__verification/multipart"))
				.timeout(Duration.ofSeconds(15)).header("Authorization", "Bearer " + token)
				.header("Content-Type", "multipart/form-data; boundary=" + boundary)
				.POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
			return client.send(request, HttpResponse.BodyHandlers.ofString());
		}
	}

	@Test
	void servesHealthCatalogAndProtectedRoutesOverRealHttp() throws Exception {
		try (HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
			HttpResponse<String> health = send(client, "/actuator/health");
			assertEquals(200, health.statusCode());
			assertPrivateHealthBody("UP", health.body());
			HttpResponse<String> catalog = send(client, "/api/catalogos/departamentos");
			assertEquals(200, catalog.statusCode());
			assertEquals("[]", catalog.body());
			assertEquals(401, send(client, "/api/usuarios/me").statusCode());
			HttpRequest preflight = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/usuarios/me"))
					.header("Origin", "capacitor://localhost")
					.header("Access-Control-Request-Method", "PUT")
					.method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();
			HttpResponse<String> cors = client.send(preflight, HttpResponse.BodyHandlers.ofString());
			assertEquals(200, cors.statusCode());
			assertEquals("capacitor://localhost", cors.headers().firstValue("access-control-allow-origin").orElse(""));
		}
	}

	@Test
	void healthStaysPublicWithoutExposingAdministrativeEndpointsOrPrivateWrites() throws Exception {
		try (HttpClient client = HttpClient.newHttpClient()) {
			HttpRequest invalidToken = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/actuator/health"))
					.header("Authorization", "Bearer invalid-verification-token").GET().build();
			assertEquals(200, client.send(invalidToken, HttpResponse.BodyHandlers.ofString()).statusCode());
			for (String path : new String[] {"/actuator/env", "/actuator/beans", "/actuator/configprops", "/actuator/heapdump", "/actuator/health/db", "/api/imagenes/estado"}) {
				assertEquals(401, send(client, path).statusCode(), path);
			}
			for (String[] mutation : new String[][] {{"POST", "/api/imagenes"}, {"PUT", "/api/servicios/verification-missing-id"}, {"DELETE", "/api/publicaciones/verification-missing-id"}, {"DELETE", "/api/usuarios/me"}, {"POST", "/actuator/health"}}) {
				HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + mutation[1]))
						.header("Content-Type", "application/json").method(mutation[0], HttpRequest.BodyPublishers.ofString("{}")).build();
				assertEquals(401, client.send(request, HttpResponse.BodyHandlers.ofString()).statusCode(), mutation[1]);
			}
		}
	}

	@Test
	void unavailableHealthContributorReturns503WithoutLeakingDetails() throws Exception {
		// Synthetic contributor: checks the HTTP health contract, not Azure connectivity.
		healthContributors.registerContributor("verificationDatabase", (HealthIndicator) () -> Health.down()
				.withDetail("database", "test-only-database").withDetail("error", "test-only-internal-detail").build());
		try (HttpClient client = HttpClient.newHttpClient()) {
			HttpResponse<String> response = send(client, "/actuator/health");
			assertEquals(503, response.statusCode());
			assertPrivateHealthBody("DOWN", response.body());
			assertTrue(response.headers().firstValue("content-type").orElse("").contains("json"));
		} finally {
			healthContributors.unregisterContributor("verificationDatabase");
		}
	}

	private HttpResponse<String> send(HttpClient client, String path) throws Exception {
		return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
				.timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
	}

	private void assertPrivateHealthBody(String expectedStatus, String body) {
		var json = new ObjectMapper().readTree(body);
		assertEquals(expectedStatus, json.get("status").asString());
		assertFalse(json.has("components"));
		assertFalse(json.has("details"));
		assertFalse(body.contains("test-only-database"));
		assertFalse(body.contains("test-only-internal-detail"));
	}
}
