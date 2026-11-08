package com.kuska.api.catalog;

import org.springframework.stereotype.Component;

@Component
public class CatalogMapper {

	public CatalogDtos.DepartamentoDto toDto(Departamento entity) {
		return new CatalogDtos.DepartamentoDto(entity.getId(), entity.getNombre());
	}

	public CatalogDtos.DistritoDto toDto(Distrito entity) {
		return new CatalogDtos.DistritoDto(
				entity.getId(),
				entity.getDepartamento().getId(),
				entity.getDepartamento().getNombre(),
				entity.getProvincia(),
				entity.getNombre());
	}

	public CatalogDtos.CategoriaServicioDto toDto(CategoriaServicio entity) {
		return new CatalogDtos.CategoriaServicioDto(
				entity.getId(), entity.getNombre(), entity.getDescripcion());
	}

	public CatalogDtos.TipoPublicacionDto toDto(TipoPublicacion entity) {
		return new CatalogDtos.TipoPublicacionDto(
				entity.getId(), entity.getNombre(), entity.getDescripcion());
	}

	public CatalogDtos.CanalAyudaDto toDto(CanalAyuda entity) {
		return new CatalogDtos.CanalAyudaDto(
				entity.getId(),
				entity.getDepartamento() == null ? null : entity.getDepartamento().getId(),
				entity.getDepartamento() == null ? null : entity.getDepartamento().getNombre(),
				entity.getDistrito() == null ? null : entity.getDistrito().getId(),
				entity.getDistrito() == null ? null : entity.getDistrito().getNombre(),
				entity.getNombreInstitucion(),
				entity.getTipoAyuda(),
				entity.getTelefono(),
				entity.getDescripcion(),
				entity.getDireccion(),
				entity.getCobertura(),
				entity.getFuenteInformacion(),
				entity.getFechaVerificacion());
	}
}
