import { useEffect, useState } from "react";
import { LocationPicker } from "../../components/map/KuskaMap";
import { coordsOf, districtCenter, roundPoint } from "../../utils/geo";
import type { LatLng } from "../../utils/geo";
import type { FormEvent } from "react";
import { Icon, Modal } from "../../components/common/CommonComponents";
import type { Service, User } from "../../types";
import { categories, defaultPriceRange, photos, priceRanges } from "../../data/demo";

export function CreateService({
  user,
  onClose,
  onPublish,
}: {
  user: User;
  onClose: () => void;
  onPublish: (s: Service) => void;
}) {
  const [error, setError] = useState("");
  const [point, setPoint] = useState<LatLng | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<string>(defaultPriceRange.label);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get("title") || !fd.get("description") || !fd.get("category"))
      return setError("Completa el título, la descripción y la categoría.");
    if (!selectedPrice) return setError("Selecciona un rango de precio");
    const range = priceRanges.find((item) => item.label === selectedPrice);
    if (!range) return setError("Selecciona un rango de precio");
    const newId = Date.now();
    const coords = point
      ? roundPoint(point)
      : coordsOf({ id: newId, district: user.district });
    onPublish({
      id: newId,
      owner: user.name,
      ownerId: user.id,
      title: String(fd.get("title")),
      description: String(fd.get("description")),
      category: String(fd.get("category")),
      priceLabel: range.label,
      priceMin: range.min,
      priceMax: range.max,
      currency: "PEN",
      district: user.district,
      createdAt: Date.now(),
      contactPhone: user.phone,
      location: String(fd.get("location")),
      lat: coords.lat,
      lng: coords.lng,
      image: photos.textile,
      reviews: [],
      mine: true,
    });
  };
  return (
    <Modal title="Publicar mi servicio" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <label>
          Título del servicio *<input name="title" placeholder="Ej. Reparación de prendas" />
        </label>
        <label className="upload-box">
          <Icon name="camera" />
          <span>Agregar fotografía</span>
          <small>En este prototipo usaremos una imagen de muestra</small>
          <input type="file" accept="image/*" />
        </label>
        <label>
          Descripción *
          <textarea name="description" placeholder="Cuéntale a tus vecinos qué ofreces…" />
        </label>
        <label>
          Categoría *
          <select name="category" defaultValue="">
            <option value="" disabled>
              Seleccionar categoría
            </option>
            {categories.slice(0, 7).map(([x]) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Categoría de precio *
          <select
            className="price-select selected"
            value={selectedPrice}
            onChange={(event) => {
              setSelectedPrice(event.target.value);
              setError("");
            }}
          >
            {priceRanges.map((range) => (
              <option key={range.label} value={range.label}>
                {range.label}
              </option>
            ))}
          </select>
          <small className="range-help">
            Rango aproximado en soles. Cada importe pertenece a un único intervalo.
          </small>
        </label>
        <label>
          Ubicación pública aproximada
          <input name="location" defaultValue={`${user.district} · zona aproximada`} />
        </label>
        <div className="picker-field">
          <span className="picker-label">Marca la zona en el mapa</span>
          <LocationPicker
            center={districtCenter(user.district)}
            value={point}
            onChange={setPoint}
            kind="service"
          />
        </div>
        <p className="privacy-note">Nunca mostraremos automáticamente tu dirección privada.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button">Publicar servicio</button>
        </div>
      </form>
    </Modal>
  );
}
