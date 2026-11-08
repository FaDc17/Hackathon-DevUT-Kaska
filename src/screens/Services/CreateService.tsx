import { useEffect, useState } from "react";
import { LocationPicker } from "../../components/map/KuskaMap";
import { districtCenter, roundPoint } from "../../utils/geo";
import type { LatLng } from "../../utils/geo";
import type { FormEvent } from "react";
import { Icon, Modal } from "../../components/common/CommonComponents";
import type { Service, User } from "../../types";
import { defaultPriceRange, priceRanges } from "../../data/demo";
import { getServiceCategories, type ServiceCategory } from "../../services/catalogs";
import { persistSelectedImage } from "../../services/images";

export function CreateService({
  user,
  onClose,
  onPublish,
  initial,
}: {
  user: User;
  onClose: () => void;
  onPublish: (s: Service) => Promise<void>;
  initial?: Service;
}) {
  const [error, setError] = useState("");
  const [location, setLocation] = useState(initial?.location || user.district);
  const [point, setPoint] = useState<LatLng | null>(
    initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [selectedPrice, setSelectedPrice] = useState<string>(
    initial?.priceLabel || defaultPriceRange.label,
  );
  const [catalog, setCatalog] = useState<ServiceCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(
    initial?.categoryId ? String(initial.categoryId) : "",
  );
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [draftId] = useState(() => initial?.id ?? crypto.randomUUID());
  useEffect(() => {
    void getServiceCategories()
      .then(setCatalog)
      .catch(() => setError("No pudimos cargar las categorías. Conéctate e inténtalo nuevamente."));
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    if (
      !String(fd.get("title") || "").trim() ||
      !String(fd.get("description") || "").trim() ||
      !fd.get("category")
    )
      return setError("Completa el título, la descripción y la categoría.");
    if (!selectedPrice) return setError("Selecciona un rango de precio");
    const range =
      priceRanges.find((item) => item.label === selectedPrice) ??
      (initial && selectedPrice === initial.priceLabel
        ? { label: initial.priceLabel, min: initial.priceMin, max: initial.priceMax }
        : null);
    if (!range) return setError("Selecciona un rango de precio");
    const category = catalog.find((item) => item.id === Number(fd.get("category")));
    if (!category) return setError("Selecciona una categoría disponible.");
    const newId = draftId;
    const coords = point ? roundPoint(point) : null;
    setBusy(true);
    setError("");
    try {
      const image = file ? await persistSelectedImage(file) : initial?.image || "";
      await onPublish({
        ...initial,
        id: newId,
        owner: user.name,
        ownerId: user.id,
        title: String(fd.get("title")).trim(),
        description: String(fd.get("description")).trim(),
        category: category.nombre,
        categoryId: category.id,
        priceLabel: range.label,
        priceMin: range.min,
        priceMax: range.max,
        currency: "PEN",
        district: user.district,
        districtId: user.districtId,
        createdAt: initial?.createdAt ?? Date.now(),
        contactPhone: user.phone,
        location: String(fd.get("location")),
        lat: coords?.lat,
        lng: coords?.lng,
        image,
        reviews: initial?.reviews || [],
        mine: true,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar el servicio.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={initial ? "Editar servicio" : "Publicar mi servicio"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack-form" onSubmit={submit}>
        <label>
          Título del servicio *
          <input
            name="title"
            defaultValue={initial?.title}
            maxLength={150}
            required
            placeholder="Ej. Reparación de prendas"
          />
        </label>
        <label className="upload-box">
          <Icon name="camera" />
          <span>Agregar fotografía</span>
          <small>{file?.name || "Opcional. Se conservará en este dispositivo."}</small>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>
        {file && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setFile(undefined)}
          >
            Quitar fotografía
          </button>
        )}
        <label>
          Descripción *
          <textarea
            name="description"
            defaultValue={initial?.description}
            required
            maxLength={2000}
            placeholder="Cuéntale a tus vecinos qué ofreces…"
          />
        </label>
        <label>
          Categoría *
          <select
            name="category"
            required
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
          >
            <option value="" disabled>
              Seleccionar categoría
            </option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
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
            {initial && !priceRanges.some((range) => range.label === initial.priceLabel) && (
              <option value={initial.priceLabel}>{initial.priceLabel} (rango guardado)</option>
            )}
          </select>
          <small className="range-help">
            Rango aproximado en soles. Cada importe pertenece a un único intervalo.
          </small>
        </label>
        <label>
          Ubicación pública aproximada
          <input
            name="location"
            maxLength={200}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
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
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy || !catalog.length}>
            {busy ? "Guardando…" : initial ? "Guardar cambios" : "Publicar servicio"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
