import { Link } from "@tanstack/react-router";

// A record id, linked to that record on its card page.
export function Cite({ cite }: { cite: string }) {
  const [cardId, recordId] = cite.split("#");
  return (
    <Link className="cite" to="/cards/$cardId" params={{ cardId }} hash={recordId}>
      {cite}
    </Link>
  );
}
