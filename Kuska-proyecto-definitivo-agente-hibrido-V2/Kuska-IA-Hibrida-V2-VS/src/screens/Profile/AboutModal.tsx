import { useEffect, useState } from "react";
import { Modal } from "../../components/common/CommonComponents";

export function AboutModal({
  value,
  onClose,
  onSave,
}: {
  value: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [about, setAbout] = useState(value);
  return (
    <Modal title="Sobre mí" onClose={onClose}>
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(about.trim());
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
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
