package com.kuska.api.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TipoPublicacionRepository extends JpaRepository<TipoPublicacion, Integer> {
	List<TipoPublicacion> findAllByOrderByNombreAsc();
}
