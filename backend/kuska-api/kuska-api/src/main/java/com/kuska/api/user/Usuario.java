package com.kuska.api.user;

import java.time.LocalDateTime;

import com.kuska.api.catalog.Distrito;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "Usuarios", schema = "dbo")
public class Usuario {

	@Id
	@Column(name = "IdUsuario", nullable = false, length = 100)
	private String id;

	@Column(name = "NombreUsuario", nullable = false, length = 50)
	private String nombreUsuario;

	@Column(name = "ContrasenaHash", nullable = false, length = 255)
	private String contrasenaHash;

	@Column(name = "Celular", nullable = false, length = 9)
	private String celular;

	@Column(name = "DireccionPrivada", nullable = false, length = 300)
	private String direccionPrivada;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "IdDistrito", referencedColumnName = "IdDistrito", nullable = false)
	private Distrito distrito;

	@Column(name = "DescripcionPerfil", length = 1000)
	private String descripcionPerfil;

	@Column(name = "FechaRegistro", nullable = false)
	private LocalDateTime fechaRegistro;

	@Column(name = "FechaActualizacion", nullable = false)
	private LocalDateTime fechaActualizacion;

	@Column(name = "Estado", nullable = false)
	private boolean estado;

	@Column(name = "Eliminado", nullable = false)
	private boolean eliminado;

	protected Usuario() {
	}

	@PrePersist
	void initializeTimestamps() {
		LocalDateTime now = LocalDateTime.now();
		if (fechaRegistro == null) {
			fechaRegistro = now;
		}
		if (fechaActualizacion == null) {
			fechaActualizacion = now;
		}
	}

	@PreUpdate
	void updateTimestamp() {
		fechaActualizacion = LocalDateTime.now();
	}

	public String getId() {
		return id;
	}

	public void setId(String id) {
		this.id = id;
	}

	public String getNombreUsuario() {
		return nombreUsuario;
	}

	public void setNombreUsuario(String nombreUsuario) {
		this.nombreUsuario = nombreUsuario;
	}

	public String getContrasenaHash() {
		return contrasenaHash;
	}

	public void setContrasenaHash(String contrasenaHash) {
		this.contrasenaHash = contrasenaHash;
	}

	public String getCelular() {
		return celular;
	}

	public void setCelular(String celular) {
		this.celular = celular;
	}

	public String getDireccionPrivada() {
		return direccionPrivada;
	}

	public void setDireccionPrivada(String direccionPrivada) {
		this.direccionPrivada = direccionPrivada;
	}

	public Distrito getDistrito() {
		return distrito;
	}

	public void setDistrito(Distrito distrito) {
		this.distrito = distrito;
	}

	public String getDescripcionPerfil() {
		return descripcionPerfil;
	}

	public void setDescripcionPerfil(String descripcionPerfil) {
		this.descripcionPerfil = descripcionPerfil;
	}

	public LocalDateTime getFechaRegistro() {
		return fechaRegistro;
	}

	public LocalDateTime getFechaActualizacion() {
		return fechaActualizacion;
	}

	public boolean isEstado() {
		return estado;
	}

	public void setEstado(boolean estado) {
		this.estado = estado;
	}

	public boolean isEliminado() {
		return eliminado;
	}

	public void setEliminado(boolean eliminado) {
		this.eliminado = eliminado;
	}
}
