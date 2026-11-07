import { Icon } from "../../components/common/CommonComponents";

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <span>
        <Icon name="heart" />
      </span>
      <p>{text}</p>
    </div>
  );
}
