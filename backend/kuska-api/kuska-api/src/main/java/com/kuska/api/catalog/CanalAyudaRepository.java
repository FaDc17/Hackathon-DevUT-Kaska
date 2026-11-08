package com.kuska.api.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CanalAyudaRepository extends JpaRepository<CanalAyuda, String> {
	List<CanalAyuda> findByEliminadoFalseAndEstadoTrueOrderByNombreInstitucionAsc();

	List<CanalAyuda> findByEliminadoFalseAndEstadoTrueAndDepartamentoIdOrderByNombreInstitucionAsc(
			Integer departamentoId);

	List<CanalAyuda> findByEliminadoFalseAndEstadoTrueAndDistritoIdOrderByNombreInstitucionAsc(
			Integer distritoId);

	List<CanalAyuda> findByEliminadoFalseAndEstadoTrueAndTipoAyudaIgnoreCaseOrderByNombreInstitucionAsc(
			String tipoAyuda);
}
