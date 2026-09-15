"use client";

import { useState } from "react";
import type { Comment } from "@/lib/schema/comments";
import type { StageId } from "@/lib/schema/project";
import { api } from "@/lib/ui/client";

export function CommentComposer({
  projectId, stage, target, placeholder, onAdded, compact,
}: {
  projectId: string;
  stage: StageId;
  target: Comment["target"];
  placeholder: string;
  onAdded: () => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      await api.addComment(projectId, stage, value, target);
      setText("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "flex gap-2" : "grid gap-2"}>
      <textarea
        className="field min-h-[64px] resize-y"
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <div>
        <button className="btn btn-ghost" onClick={submit} disabled={busy || !text.trim()}>
          הוסף הערה
        </button>
      </div>
    </div>
  );
}

export function CommentList({
  projectId, comments, onChanged,
}: {
  projectId: string;
  comments: Comment[];
  onChanged: () => void;
}) {
  if (!comments.length) return null;
  return (
    <ul className="grid gap-2">
      {comments.map((c) => (
        <li key={c.id} className="flex items-start gap-3 rounded-lg bg-warn-soft px-3 py-2 text-sm">
          <span className="mt-0.5 shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-2">
            {c.target.kind === "general" ? "כללי" : `${c.target.kind === "slide" ? "שקף" : "פרק"} ${c.target.ref}`}
          </span>
          <span className="min-w-0 flex-1">{c.text}</span>
          <button
            className="shrink-0 text-xs text-ink-3 hover:text-err"
            onClick={async () => {
              await api.deleteComment(projectId, c.id);
              onChanged();
            }}
          >
            מחק
          </button>
        </li>
      ))}
    </ul>
  );
}
