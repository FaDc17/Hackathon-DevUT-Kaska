import { useEffect, useState } from "react";
import { Stars, Modal } from "../../components/common/CommonComponents";
import type { Review, User } from "../../types";

export function ReviewModal({
  user,
  onClose,
  onPublish,
}: {
  user: User;
  onClose: () => void;
  onPublish: (r: Review) => Promise<void>;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftId] = useState(() => crypto.randomUUID());
  return (
    <Modal
      title="Escribir reseña"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="review-form">
        <p>¿Cómo fue tu experiencia con este servicio?</p>
        <Stars value={stars} interactive onChange={setStars} />
        <label>
          Tu comentario
          <textarea
            value={comment}
            maxLength={1000}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comparte una opinión útil y respetuosa…"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="secondary-button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              if (!stars || !comment.trim()) {
                setError("Selecciona estrellas y escribe un comentario.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await onPublish({
                  id: draftId,
                  user: user.name,
                  userId: user.id,
                  stars,
                  comment,
                  date: "Ahora",
                });
              } catch (error) {
                setError(error instanceof Error ? error.message : "No se pudo guardar la reseña.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Publicar reseña
          </button>
        </div>
      </div>
    </Modal>
  );
}
