package com.kuska.api.catalog;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalogos")
public class CatalogController {

	private final CatalogService catalogService;

	public CatalogController(CatalogService catalogService) {
		this.catalogService = catalogService;
	}

	@GetMapping("/departamentos")
	public List<CatalogDtos.DepartamentoDto> departamentos() {
		return catalogService.departamentos();
	}

	@GetMapping("/departamentos/{id}")
	public CatalogDtos.DepartamentoDto departamento(@PathVariable Integer id) {
		return catalogService.departamento(id);
	}

	@GetMapping("/distritos")
	public List<CatalogDtos.DistritoDto> distritos(
			@RequestParam(required = false) Integer departamentoId) {
		return catalogService.distritos(departamentoId);
	}

	@GetMapping("/categorias-servicio")
	public List<CatalogDtos.CategoriaServicioDto> categoriasServicio() {
		return catalogService.categoriasServicios();
	}

	@GetMapping("/tipos-publicacion")
	public List<CatalogDtos.TipoPublicacionDto> tiposPublicacion() {
		return catalogService.tiposPublicacion();
	}

	@GetMapping("/canales-ayuda")
	public List<CatalogDtos.CanalAyudaDto> canalesAyuda(
			@RequestParam(required = false) Integer departamentoId,
			@RequestParam(required = false) Integer distritoId,
			@RequestParam(required = false) String tipoAyuda) {
		return catalogService.canalesAyuda(departamentoId, distritoId, tipoAyuda);
	}
}
