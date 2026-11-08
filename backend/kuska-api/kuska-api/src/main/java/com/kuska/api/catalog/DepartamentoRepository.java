package com.kuska.api.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DepartamentoRepository extends JpaRepository<Departamento, Integer> {
	List<Departamento> findAllByOrderByNombreAsc();
}
