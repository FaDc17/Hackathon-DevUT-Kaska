package com.kuska.api.catalog;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {

	private final DepartamentoRepository departamentos;
	private final DistritoRepository distritos;
	private final CategoriaServicioRepository categoriasServicios;
	private final TipoPublicacionRepository tiposPublicacion;
	private final CanalAyudaRepository canalesAyuda;
	private final CatalogMapper mapper;

	public CatalogService(
			DepartamentoRepository departamentos,
			DistritoRepository distritos,
			CategoriaServicioRepository categoriasServicios,
			TipoPublicacionRepository tiposPublicacion,
			CanalAyudaRepository canalesAyuda,
			CatalogMapper mapper) {
		this.departamentos = departamentos;
		this.distritos = distritos;
		this.categoriasServicios = categoriasServicios;
		this.tiposPublicacion = tiposPublicacion;
		this.canalesAyuda = canalesAyuda;
		this.mapper = mapper;
	}

	@Transactional(readOnly = true)
	public List<CatalogDtos.DepartamentoDto> departamentos() {
		return departamentos.findAllByOrderByNombreAsc().stream().map(mapper::toDto).toList();
	}

	@Transactional(readOnly = true)
	public CatalogDtos.DepartamentoDto departamento(Integer id) {
		return departamentos.findById(requirePositive(id, "departamento"))
				.map(mapper::toDto)
				.orElseThrow(() -> new ResourceNotFoundException("Departamento no encontrado: " + id));
	}

	@Transactional(readOnly = true)
	public List<CatalogDtos.DistritoDto> distritos(Integer departamentoId) {
		if (departamentoId == null) {
			return distritos.findAllByOrderByProvinciaAscNombreAsc().stream().map(mapper::toDto).toList();
		}
		if (!departamentos.existsById(requirePositive(departamentoId, "departamento"))) {
			throw new ResourceNotFoundException("Departamento no encontrado: " + departamentoId);
		}
		return distritos.findByDepartamentoIdOrderByNombreAsc(departamentoId).stream()
				.map(mapper::toDto).toList();
	}

	@Transactional(readOnly = true)
	public List<CatalogDtos.CategoriaServicioDto> categoriasServicios() {
		return categoriasServicios.findAllByOrderByNombreAsc().stream().map(mapper::toDto).toList();
	}

	@Transactional(readOnly = true)
	public List<CatalogDtos.TipoPublicacionDto> tiposPublicacion() {
		return tiposPublicacion.findAllByOrderByNombreAsc().stream().map(mapper::toDto).toList();
	}

	@Transactional(readOnly = true)
	public List<CatalogDtos.CanalAyudaDto> canalesAyuda(Integer departamentoId,
			Integer distritoId, String tipoAyuda) {
		List<CanalAyuda> result;
		if (departamentoId != null) {
			requirePositive(departamentoId, "departamento");
			result = canalesAyuda.findByEliminadoFalseAndEstadoTrueAndDepartamentoIdOrderByNombreInstitucionAsc(
					departamentoId);
		} else if (distritoId != null) {
			requirePositive(distritoId, "distrito");
			result = canalesAyuda.findByEliminadoFalseAndEstadoTrueAndDistritoIdOrderByNombreInstitucionAsc(
					distritoId);
		} else if (tipoAyuda != null && !tipoAyuda.isBlank()) {
			result = canalesAyuda.findByEliminadoFalseAndEstadoTrueAndTipoAyudaIgnoreCaseOrderByNombreInstitucionAsc(
					tipoAyuda.trim());
		} else {
			result = canalesAyuda.findByEliminadoFalseAndEstadoTrueOrderByNombreInstitucionAsc();
		}
		return result.stream().map(mapper::toDto).toList();
	}

	private Integer requirePositive(Integer value, String field) {
		if (value == null || value <= 0) {
			throw new IllegalArgumentException(field + " debe ser un identificador positivo.");
		}
		return value;
	}
}
