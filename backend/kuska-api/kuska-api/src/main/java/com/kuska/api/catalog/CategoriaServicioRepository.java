package com.kuska.api.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoriaServicioRepository extends JpaRepository<CategoriaServicio, Integer> {
	List<CategoriaServicio> findAllByOrderByNombreAsc();
}
