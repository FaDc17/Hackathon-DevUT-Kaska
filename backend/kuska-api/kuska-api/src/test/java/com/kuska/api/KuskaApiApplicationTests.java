package com.kuska.api;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.kuska.api.catalog.CanalAyudaRepository;
import com.kuska.api.catalog.CategoriaServicioRepository;
import com.kuska.api.catalog.DepartamentoRepository;
import com.kuska.api.catalog.DistritoRepository;
import com.kuska.api.catalog.TipoPublicacionRepository;
import com.kuska.api.user.UsuarioRepository;

@SpringBootTest
@ActiveProfiles("test")
class KuskaApiApplicationTests {

	@MockitoBean DepartamentoRepository departamentoRepository;
	@MockitoBean DistritoRepository distritoRepository;
	@MockitoBean CategoriaServicioRepository categoriaServicioRepository;
	@MockitoBean TipoPublicacionRepository tipoPublicacionRepository;
	@MockitoBean CanalAyudaRepository canalAyudaRepository;
	@MockitoBean UsuarioRepository usuarioRepository;

	@Test
	void contextLoads() {
	}

}
