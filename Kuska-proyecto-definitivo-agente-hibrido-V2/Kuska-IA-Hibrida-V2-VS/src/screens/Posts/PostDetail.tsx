import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../components/common/CommonComponents";
import { timeAgo } from "../../components/common/CommonComponents";
import { DemoMap } from "../Map/DemoMap";
import type { Comment, Post, User } from "../../types";

export function PostDetail({
  post,
  user,
  back,
  onComment,
  openProfile,
}: {
  post: Post;
  user: User;
  back: () => void;
  onComment: (comment: Comment) => void;
  openProfile: (id: string | undefined, name: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = comment.trim();
    if (!clean) {
      setCommentError("Escribe un comentario antes de publicar.");
      return;
    }
    onComment({
      id: Date.now(),
      user: user.name,
      userId: user.id,
      content: clean,
      createdAt: Date.now(),
    });
    setComment("");
    setCommentError("");
  };
  return (
    <section className="detail-page community-detail">
      <div className={`community-cover ${post.category.toLowerCase()}`}>
        {post.image ? (
          <img src={post.image} alt="" />
        ) : (
          <Icon name={post.category === "Emergencia" ? "alert" : "heart"} size={52} />
        )}
        <button className="floating-back" onClick={back}>
          <Icon name="back" />
        </button>
      </div>
      <div className="detail-content">
        <div className="row between">
          <span className={`chip ${post.category.toLowerCase()}`}>
            {post.category.toUpperCase()}
          </span>
          <span className="time">{timeAgo(post.createdAt)}</span>
        </div>
        <h1>{post.title}</h1>
        <button
          className="provider provider-link"
          onClick={() => openProfile(post.ownerId, post.owner)}
        >
          <div className="avatar small">{post.owner.charAt(0)}</div>
          <div>
            <small>Publicado por</small>
            <strong>{post.owner}</strong>
          </div>
        </button>
        <div className="detail-section">
          <h2>Descripción</h2>
          <p>{post.description}</p>
        </div>
        <div className="detail-section">
          <h2>Ubicación aproximada</h2>
          <p className="location">
            <Icon name="pin" size={17} />
            {post.location}
          </p>
          <DemoMap single />
        </div>
        {post.category === "Emergencia" && (
          <div className="safety-note">
            <Icon name="alert" />
            <p>
              Esta alerta comunitaria es informativa. Contacta directamente a las autoridades si
              existe peligro inmediato.
            </p>
          </div>
        )}
        <div className="detail-section comments-section">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">CONVERSACIÓN VECINAL</span>
              <h2>Comentarios</h2>
            </div>
            <span>{post.comments?.length || 0}</span>
          </div>
          {post.comments?.length ? (
            <div className="comment-list">
              {post.comments.map((item) => (
                <article className="comment-card" key={item.id}>
                  <div className="comment-avatar">{item.user.charAt(0).toUpperCase()}</div>
                  <div>
                    <div className="row between">
                      <button
                        className="author-link"
                        onClick={() => openProfile(item.userId, item.user)}
                      >
                        {item.user}
                      </button>
                      <span>{timeAgo(item.createdAt)}</span>
                    </div>
                    <p>{item.content}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="comments-empty">Todavía no hay comentarios. Sé el primero en comentar.</p>
          )}
          <form className="comment-form" onSubmit={submitComment}>
            <label htmlFor="community-comment">Escribe un comentario...</label>
            <textarea
              id="community-comment"
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                if (commentError) setCommentError("");
              }}
              placeholder="Comparte información útil y respetuosa"
            />
            {commentError && <span className="field-error">{commentError}</span>}
            <button className="primary-button">Comentar</button>
          </form>
        </div>
      </div>
    </section>
  );
}
