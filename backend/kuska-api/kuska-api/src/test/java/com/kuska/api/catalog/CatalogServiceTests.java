package com.kuska.api.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CatalogServiceTests {
	@Mock DepartamentoRepository departments;
	@Mock DistritoRepository districts;
	@Mock CategoriaServicioRepository categories;
	@Mock TipoPublicacionRepository publicationTypes;
	@Mock CanalAyudaRepository channels;
	@Mock CatalogMapper mapper;
	CatalogService service;

	@BeforeEach
	void setUp() {
		service = new CatalogService(departments, districts, categories, publicationTypes, channels, mapper);
	}

	private void selectedDistrict() {
		Distrito district = mock(Distrito.class);
		Departamento department = mock(Departamento.class);
		when(districts.findById(7)).thenReturn(Optional.of(district));
		when(district.getDepartamento()).thenReturn(department);
		when(department.getId()).thenReturn(2);
	}

	private CanalAyuda channel(String id, Integer departmentId, Integer districtId,
			String coverage, String type, String institution, String phone) {
		CanalAyuda entity = mock(CanalAyuda.class);
		when(mapper.toDto(entity)).thenReturn(new CatalogDtos.CanalAyudaDto(id, departmentId, null,
				districtId, null, institution, type, phone, null, null, coverage, "test-only", LocalDate.of(2026, 1, 1)));
		return entity;
	}

	@Test
	void selectedDistrictIncludesOnlyItsDistrictRegionalAndNationalCoverage() {
		selectedDistrict();
		List<CanalAyuda> stored = List.of(
				channel("national", null, null, "Nacional", "Policia", "National", "101"),
				channel("regional", 2, null, "Regional", "Salud", "Regional", "202"),
				channel("local", 2, 7, "Distrital", "Serenazgo", "Local", "303"),
				channel("other-district", 2, 8, "Distrital", "Serenazgo", "Other district", "404"),
				channel("other-region", 3, null, "Regional", "Salud", "Other region", "505"),
				channel("unknown-interdistrict", 2, 8, "Interdistrital", "Salud", "No inferred scope", "606"));
		when(channels.findByEliminadoFalseAndEstadoTrueOrderByNombreInstitucionAsc()).thenReturn(stored);
		assertEquals(List.of("national", "regional", "local"),
				service.canalesAyuda(null, 7, null).stream().map(CatalogDtos.CanalAyudaDto::id).toList());
	}

	@Test
	void helpTypeIsAppliedTogetherWithLocationAndDuplicatesAreRemoved() {
		selectedDistrict();
		List<CanalAyuda> stored = List.of(
				channel("first", null, null, "Nacional", "Policia", "Institución", "123 456"),
				channel("duplicate", 2, null, "Regional", "Policia", "Institución", "123-456"),
				channel("different-type", 2, 7, "Distrital", "Salud", "Salud", "789"));
		when(channels.findByEliminadoFalseAndEstadoTrueOrderByNombreInstitucionAsc()).thenReturn(stored);
		assertEquals(List.of("first"),
				service.canalesAyuda(2, 7, "policia").stream().map(CatalogDtos.CanalAyudaDto::id).toList());
	}

	@Test
	void refusesDistrictFromDifferentDepartmentInsteadOfLeakingOtherLocalNumbers() {
		selectedDistrict();
		assertThrows(IllegalArgumentException.class, () -> service.canalesAyuda(3, 7, null));
	}

	@Test
	void provinceNamesAreDerivedFromRealDistrictsAndDepartmentRemainsPartOfIdentity() {
		Distrito first = mock(Distrito.class);
		Distrito second = mock(Distrito.class);
		Distrito third = mock(Distrito.class);
		when(districts.findAllByOrderByProvinciaAscNombreAsc()).thenReturn(List.of(first, second, third));
		when(mapper.toDto(first)).thenReturn(new CatalogDtos.DistritoDto(1, 1, "Lima", "Lima", "Distrito uno"));
		when(mapper.toDto(second)).thenReturn(new CatalogDtos.DistritoDto(2, 1, "Lima", "Lima", "Distrito dos"));
		when(mapper.toDto(third)).thenReturn(new CatalogDtos.DistritoDto(3, 2, "Callao", "Callao", "Bellavista"));
		assertEquals(List.of(new CatalogDtos.ProvinciaDto(1, "Lima", "Lima"),
				new CatalogDtos.ProvinciaDto(2, "Callao", "Callao")), service.provincias(null));
	}

	@Test
	void servesSpecialDistrictWithItsPersistentDatabaseId() {
		Distrito special = mock(Distrito.class);
		CatalogDtos.DistritoDto expected = new CatalogDtos.DistritoDto(
				701, 99, "Departamento incompleto", "Sin especificar", "Sin especificar");
		when(departments.existsById(99)).thenReturn(true);
		when(districts.findByDepartamentoIdOrderByNombreAsc(99)).thenReturn(List.of(special));
		when(mapper.toDto(special)).thenReturn(expected);

		assertEquals(List.of(expected), service.distritos(99));
	}
}
