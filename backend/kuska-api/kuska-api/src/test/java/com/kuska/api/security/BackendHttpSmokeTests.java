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

import com.kuska.api.catalog.CanalAyudaRepository;
import com.kuska.api.catalog.CategoriaServicioRepository;
import com.kuska.api.catalog.DepartamentoRepository;
import com.kuska.api.catalog.DistritoRepository;
import com.kuska.api.catalog.TipoPublicacionRepository;
import com.kuska.api.user.UsuarioRepository;

/** Real loopback HTTP and embedded Tomcat, with database repositories mocked. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class BackendHttpSmokeTests {
	@LocalServerPort int port;
	@MockitoBean DepartamentoRepository departments;
	@MockitoBean DistritoRepository districts;
	@MockitoBean CategoriaServicioRepository categories;
	@MockitoBean TipoPublicacionRepository types;
	@MockitoBean CanalAyudaRepository channels;
	@MockitoBean UsuarioRepository users;
	@Autowired HealthContributorRegistry healthContributors;

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
			for (String path : new String[] {"/actuator/env", "/actuator/beans", "/actuator/configprops", "/actuator/heapdump", "/actuator/health/db"}) {
				assertEquals(401, send(client, path).statusCode(), path);
			}
			for (String[] mutation : new String[][] {{"PUT", "/api/servicios/verification-missing-id"}, {"DELETE", "/api/publicaciones/verification-missing-id"}, {"DELETE", "/api/usuarios/me"}, {"POST", "/actuator/health"}}) {
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
