package com.kuska.api.catalog;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/** All devices use this authenticated endpoint. OFF by default; controlled single-instance trials only. */
@RestController
public class GeocodingController {
    public record Place(String label, double lat, double lng) { }
    private record Cached(long time, List<Place> places) { }
    private final boolean enabled;
    private final String provider;
    private final ObjectMapper mapper;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final Map<String, Cached> cache = new LinkedHashMap<>();
    private long lastRequest;

    public GeocodingController(ObjectMapper mapper,
        @Value("${kuska.geocoding.enabled:false}") boolean enabled,
        @Value("${kuska.geocoding.single-instance-confirmed:false}") boolean singleInstance,
        @Value("${kuska.geocoding.provider:https://nominatim.openstreetmap.org/search}") String provider) {
        this.mapper = mapper;
        this.enabled = enabled && singleInstance;
        this.provider = provider;
    }

    @GetMapping("/api/ubicaciones/buscar")
    public synchronized List<Place> search(@RequestParam String q) {
        if (!enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "La búsqueda geográfica todavía no está habilitada. Marca el mapa y escribe una referencia pública.");
        String query = q.trim();
        // Public place names only: avoid submitting home numbers, phones, email or coordinates.
        if (query.length() < 3 || query.length() > 100 || !query.matches("[\\p{L}\\p{M} ,.'’()-]+"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Busca un distrito, ciudad o lugar público, sin datos personales ni números de vivienda.");
        String key = query.toLowerCase(java.util.Locale.ROOT);
        long now = System.currentTimeMillis();
        Cached saved = cache.get(key);
        if (saved != null && now - saved.time() < Duration.ofDays(1).toMillis()) return saved.places();
        if (now - lastRequest < 1100) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Espera un momento antes de volver a buscar.");
        lastRequest = now;
        try {
            URI uri = URI.create(provider + "?format=jsonv2&addressdetails=1&limit=5&countrycodes=pe&q=" + URLEncoder.encode(query, StandardCharsets.UTF_8));
            if (!"https".equals(uri.getScheme())) throw new IllegalArgumentException();
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(8))
                .header("User-Agent", "KuskaHackathon/1.0 (+https://github.com/FaDc17/Hackathon-DevUT-Kaska)")
                .header("Accept", "application/json").header("Accept-Language", "es").GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new IllegalStateException();
            var json = mapper.readTree(response.body());
            if (!json.isArray()) throw new IllegalStateException();
            List<Place> places = new ArrayList<>();
            for (var row : json) {
                double lat = Double.parseDouble(row.path("lat").asText());
                double lng = Double.parseDouble(row.path("lon").asText());
                if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) continue;
                var address = row.path("address");
                List<String> names = new ArrayList<>();
                for (String field : List.of("city_district", "suburb", "city", "town", "village", "county", "state")) {
                    String name = address.path(field).asText("");
                    if (!name.isBlank() && !names.contains(name)) names.add(name);
                }
                String label = names.isEmpty() ? query : String.join(", ", names);
                places.add(new Place(label, Math.round(lat*1000)/1000.0, Math.round(lng*1000)/1000.0));
            }
            if (cache.size() >= 200) cache.remove(cache.keySet().iterator().next());
            cache.put(key, new Cached(now, List.copyOf(places)));
            return places;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Búsqueda interrumpida.");
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "No se pudo consultar la ubicación. Puedes marcar el mapa manualmente.");
        }
    }
}
