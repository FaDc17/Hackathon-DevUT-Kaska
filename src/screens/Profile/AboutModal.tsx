import { useEffect, useState } from "react";
import { Modal } from "../../components/common/CommonComponents";

export function AboutModal({
  value,
  onClose,
  onSave,
}: {
  value: string;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [about, setAbout] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Sobre mí"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await onSave(about.trim());
          } catch (error) {
            setError(error instanceof Error ? error.message : "No se pudo guardar la información.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="about-intro">
          Esta descripción será visible en tu perfil público. No incluyas direcciones ni datos
          sensibles.
        </p>
        <label>
          Descripción opcional
          <textarea
            value={about}
            onChange={(event) => setAbout(event.target.value.slice(0, 200))}
            maxLength={200}
            placeholder="Cuéntale un poco sobre ti a tu comunidad"
          />
          <span className="character-count">{about.length} / 200</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
