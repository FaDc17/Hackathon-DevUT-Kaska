import { useEffect, useState } from "react";
import { LocationPicker } from "../../components/map/KuskaMap";
import { districtCenter, roundPoint } from "../../utils/geo";
import type { LatLng } from "../../utils/geo";
import type { FormEvent } from "react";
import { Icon, Modal } from "../../components/common/CommonComponents";
import type { Post, User } from "../../types";
import { persistSelectedImage } from "../../services/images";

export function CreatePost({
  user,
  onClose,
  onPublish,
  initial,
}: {
  user: User;
  onClose: () => void;
  onPublish: (p: Post) => Promise<void>;
  initial?: Post;
}) {
  const [error, setError] = useState("");
  const [location, setLocation] = useState(initial?.location || user.district);
  const [point, setPoint] = useState<LatLng | null>(
    initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [draftId] = useState(() => initial?.id ?? crypto.randomUUID());
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    if (
      !String(fd.get("title") || "").trim() ||
      !String(fd.get("description") || "").trim() ||
      !fd.get("category")
    )
      return setError("Completa los campos obligatorios.");
    const newId = draftId;
    const coords = point ? roundPoint(point) : null;
    setBusy(true);
    setError("");
    try {
      const image = file ? await persistSelectedImage(file) : initial?.image;
      await onPublish({
        ...initial,
        id: newId,
        owner: user.name,
        ownerId: user.id,
        title: String(fd.get("title")).trim(),
        description: String(fd.get("description")).trim(),
        category: String(fd.get("category")) as Post["category"],
        typeId: initial?.category === String(fd.get("category")) ? initial?.typeId : undefined,
        district: user.district,
        districtId: user.districtId,
        location: String(fd.get("location")),
        lat: coords?.lat,
        lng: coords?.lng,
        image,
        createdAt: initial?.createdAt ?? Date.now(),
        mine: true,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar la publicación.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={initial ? "Editar publicación" : "Crear publicación"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack-form" onSubmit={submit}>
        <label>
          Título *
          <input
            name="title"
            defaultValue={initial?.title}
            required
            maxLength={150}
            placeholder="¿Qué quieres compartir?"
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
            placeholder="Explica brevemente la situación…"
          />
        </label>
        <fieldset>
          <legend>Categoría *</legend>
          <div className="choice-row post-choices">
            {["Necesito", "Emergencia", "Solidaridad"].map((x) => (
              <label key={x}>
                <input
                  type="radio"
                  name="category"
                  value={x}
                  defaultChecked={initial?.category === x}
                  required
                />
                <span>{x}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Ubicación aproximada
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
            kind="community"
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Guardando…" : initial ? "Guardar cambios" : "Publicar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
