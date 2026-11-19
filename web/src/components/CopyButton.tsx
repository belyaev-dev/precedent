import { useState } from "react";

export function CopyButton({ text, label = "Copy", className = "copy" }: { text: string; label?: string; className?: string }) {
  const [shown, setShown] = useState(label);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setShown("Copied");
    } catch {
      setShown("Copy failed");
    }
    setTimeout(() => setShown(label), 1500);
  };
  return (
    <button className={className} type="button" onClick={copy}>
      {shown}
    </button>
  );
}
