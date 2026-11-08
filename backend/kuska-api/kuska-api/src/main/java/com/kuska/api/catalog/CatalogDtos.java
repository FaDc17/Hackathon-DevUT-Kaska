package com.kuska.api.catalog;

import java.time.LocalDate;

public final class CatalogDtos {

	private CatalogDtos() {
	}

	public record DepartamentoDto(Integer id, String nombre) {
	}

	public record ProvinciaDto(Integer idDepartamento, String departamento, String nombre) {
	}

	public record DistritoDto(Integer id, Integer idDepartamento, String departamento,
			String provincia, String nombre) {
	}

	public record CategoriaServicioDto(Integer id, String nombre, String descripcion) {
	}

	public record TipoPublicacionDto(Integer id, String nombre, String descripcion) {
	}

	public record CanalAyudaDto(String id, Integer idDepartamento, String departamento,
			Integer idDistrito, String distrito, String nombreInstitucion, String tipoAyuda,
			String telefono, String descripcion, String direccion, String cobertura,
			String fuenteInformacion, LocalDate fechaVerificacion) {
	}
}
