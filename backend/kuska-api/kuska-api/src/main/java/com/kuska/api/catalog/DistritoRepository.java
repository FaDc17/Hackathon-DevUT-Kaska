package com.kuska.api.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DistritoRepository extends JpaRepository<Distrito, Integer> {
	List<Distrito> findByDepartamentoIdOrderByNombreAsc(Integer departamentoId);
	List<Distrito> findAllByOrderByProvinciaAscNombreAsc();
}
