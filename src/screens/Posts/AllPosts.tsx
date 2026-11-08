import { Header, PostCard } from "../../components/common/CommonComponents";
import { EmptyState } from "../Home/EmptyState";
import type { Post } from "../../types";

export function AllPosts({
  posts,
  openPost,
  back,
  more, loading, loadMore,
}: {
  posts: Post[];
  openPost: (id: string | number) => void;
  back: () => void;
  more?: boolean; loading?: boolean; loadMore?: () => void;
}) {
  return (
    <section className="page">
      <Header title="Todas las publicaciones" kicker="COMUNIDAD" onBack={back} />
      <div className="list-summary community">
        <span>{posts.length}</span>
        <p>Necesidades, alertas y acciones solidarias compartidas por tus vecinos.</p>
      </div>
      <div className="card-list">
        {posts.length ? (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onClick={() => openPost(post.id)} />
          ))
        ) : (
          <EmptyState text="Todavía no hay publicaciones comunitarias." />
        )}
      </div>
      {more && <button className="show-all-button" disabled={loading} onClick={loadMore}>{loading ? "Cargando…" : "Cargar más"}</button>}
    </section>
  );
}
