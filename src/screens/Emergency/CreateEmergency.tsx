import { useRef, useState } from "react";
import { LocationPicker } from "../../components/map/KuskaMap";
import { districtCenter, roundPoint } from "../../utils/geo";
import type { LatLng } from "../../utils/geo";
import type { FormEvent } from "react";
import { Icon, Modal } from "../../components/common/CommonComponents";
import type { Post, User } from "../../types";
import { persistSelectedImage } from "../../services/images";

export function CreateEmergency({
  user,
  onClose,
  onPublish,
}: {
  user: User;
  onClose: () => void;
  onPublish: (p: Post) => Promise<void> | void;
}) {
  const [error, setError] = useState("");
  const [location, setLocation] = useState(user.district);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [file, setFile] = useState<File>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [draftId] = useState(() => crypto.randomUUID());
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get("title") || "").trim() || !String(fd.get("description") || "").trim())
      return setError("El título y la descripción son obligatorios.");
    const newId = draftId;
    const coords = point ? roundPoint(point) : null;
    if (saving) return;
    if (
      file &&
      (file.size > 5 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    ) {
      return setError("Elige una foto JPG, PNG o WebP de hasta 5 MB.");
    }
    setSaving(true);
    setError("");
    try {
      const image = file ? await persistSelectedImage(file, newId) : undefined;
      await onPublish({
        id: newId,
        owner: user.name,
        ownerId: user.id,
        title: String(fd.get("title")).trim(),
        description: String(fd.get("description")).trim(),
        category: "Emergencia",
        district: user.district,
        districtId: user.districtId,
        location: String(fd.get("location")),
        lat: coords?.lat,
        lng: coords?.lng,
        createdAt: Date.now(),
        mine: true,
        image,
      });
    } catch {
      setError("No pudimos guardar la alerta. Inténtalo nuevamente.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Reportar emergencia"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <div className="emergency-label">
        <Icon name="alert" />
        EMERGENCIA
      </div>
      <div className="safety-note">
        <Icon name="alert" />
        <p>Publicar aquí no reemplaza llamar a las autoridades si existe peligro inmediato.</p>
      </div>
      <form className="stack-form" onSubmit={submit}>
        <label>
          Título *
          <input
            name="title"
            required
            maxLength={150}
            disabled={saving}
            placeholder="Describe la alerta en pocas palabras"
          />
        </label>
        <label className="upload-box">
          <Icon name="camera" />
          <span>Agregar evidencia fotográfica</span>
          <small>
            {file?.name || "Opcional. JPG, PNG o WebP de hasta 5 MB, sin exponer personas."}
          </small>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (
                file &&
                (file.size > 5 * 1024 * 1024 ||
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type))
              ) {
                setError("Elige una foto JPG, PNG o WebP de hasta 5 MB.");
                event.target.value = "";
                setFile(undefined);
                return;
              }
              setFile(file);
              setError("");
            }}
          />
        </label>
        {file && (
          <button
            type="button"
            className="secondary-button"
            disabled={saving}
            onClick={() => {
              setFile(undefined);
              setError("");
              if (fileInput.current) fileInput.current.value = "";
            }}
          >
            Quitar fotografía
          </button>
        )}
        <label>
          Descripción *
          <textarea
            name="description"
            required
            maxLength={2000}
            disabled={saving}
            placeholder="Brinda información útil y segura…"
          />
        </label>
        <label>
          Ubicación aproximada
          <input
            name="location"
            maxLength={200}
            disabled={saving}
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
            kind="emergency"
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button className="danger-button" disabled={saving}>
            {saving ? "Guardando…" : "Publicar alerta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
