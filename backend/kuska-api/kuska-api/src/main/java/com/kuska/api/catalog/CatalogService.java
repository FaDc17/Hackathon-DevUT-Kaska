package com.kuska.api.catalog;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Objects;

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
	public List<CatalogDtos.ProvinciaDto> provincias(Integer departamentoId) {
		return distritos(departamentoId).stream()
				.filter(distrito -> distrito.provincia() != null && !distrito.provincia().isBlank())
				.map(distrito -> new CatalogDtos.ProvinciaDto(distrito.idDepartamento(),
						distrito.departamento(), distrito.provincia().trim()))
				.distinct().toList();
	}

	@Transactional(readOnly = true)
	public List<CatalogDtos.TipoPublicacionDto> tiposPublicacion() {
		return tiposPublicacion.findAllByOrderByNombreAsc().stream().map(mapper::toDto).toList();
	}

	@Transactional(readOnly = true)
	public List<CatalogDtos.CanalAyudaDto> canalesAyuda(Integer departamentoId,
			Integer distritoId, String tipoAyuda) {
		Integer selectedDepartment = departamentoId;
		if (distritoId != null) {
			Distrito district = distritos.findById(requirePositive(distritoId, "distrito"))
					.orElseThrow(() -> new ResourceNotFoundException("Distrito no encontrado."));
			selectedDepartment = district.getDepartamento().getId();
			if (departamentoId != null && !departamentoId.equals(selectedDepartment)) {
				throw new IllegalArgumentException("El distrito no pertenece al departamento seleccionado.");
			}
		} else if (departamentoId != null
				&& !departamentos.existsById(requirePositive(departamentoId, "departamento"))) {
			throw new ResourceNotFoundException("Departamento no encontrado.");
		}
		final Integer department = selectedDepartment;
		var unique = new LinkedHashMap<String, CatalogDtos.CanalAyudaDto>();
		canalesAyuda.findByEliminadoFalseAndEstadoTrueOrderByNombreInstitucionAsc().stream()
				.map(mapper::toDto)
				.filter(channel -> (department == null && distritoId == null)
						|| covers(channel, department, distritoId))
				.filter(channel -> tipoAyuda == null || tipoAyuda.isBlank()
						|| tipoAyuda.trim().equalsIgnoreCase(channel.tipoAyuda()))
				.forEach(channel -> unique.putIfAbsent(channel.nombreInstitucion().trim().toLowerCase(Locale.ROOT)
						+ "|" + channel.tipoAyuda().trim().toLowerCase(Locale.ROOT)
						+ "|" + channel.telefono().replaceAll("[^0-9+]", ""), channel));
		return List.copyOf(unique.values());
	}

	private boolean covers(CatalogDtos.CanalAyudaDto channel, Integer department, Integer district) {
		return switch (channel.cobertura().trim().toLowerCase(Locale.ROOT)) {
			case "nacional" -> channel.idDepartamento() == null && channel.idDistrito() == null;
			case "regional" -> department != null && Objects.equals(department, channel.idDepartamento());
			case "distrital", "interdistrital" -> district != null
					&& Objects.equals(department, channel.idDepartamento())
					&& Objects.equals(district, channel.idDistrito());
			default -> false;
		};
	}

	private Integer requirePositive(Integer value, String field) {
		if (value == null || value <= 0) {
			throw new IllegalArgumentException(field + " debe ser un identificador positivo.");
		}
		return value;
	}
}
