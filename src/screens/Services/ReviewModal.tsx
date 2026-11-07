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
  onPublish: (r: Review) => void;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal title="Escribir reseña" onClose={onClose}>
      <div className="review-form">
        <p>¿Cómo fue tu experiencia con este servicio?</p>
        <Stars value={stars} interactive onChange={setStars} />
        <label>
          Tu comentario
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comparte una opinión útil y respetuosa…"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-button"
            onClick={() =>
              stars && comment.trim()
                ? onPublish({
                    id: Date.now(),
                    user: user.name,
                    userId: user.id,
                    stars,
                    comment,
                    date: "Ahora",
                  })
                : setError("Selecciona estrellas y escribe un comentario.")
            }
          >
            Publicar reseña
          </button>
        </div>
      </div>
    </Modal>
  );
}
