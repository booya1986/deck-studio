"use client";

import { useEffect, useRef } from "react";
import type { RunEvent } from "@/lib/store/runlog";
import { STAGE_LABEL } from "@/lib/ui/labels";

const TYPE_STYLE: Record<RunEvent["type"], string> = {
  init: "text-ink-3",
  text: "text-ink",
  tool: "text-brand",
  subagent: "text-brand",
  progress: "text-ink-3",
  result: "text-ok",
  error: "text-err",
};

/** One line of text for a run event, shared with the running-stage card. */
export function describeEvent(e: RunEvent): string {
  return line(e);
}

function line(e: RunEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case "init":
      return `התחלה · ${String(p.model ?? "")}`;
    case "text":
      return String(p.text ?? "");
    case "tool":
      return (Array.isArray(p) ? p : [])
        .map((t) => {
          const tool = t as { name?: string; summary?: string };
          return tool.summary ? `${tool.name}: ${tool.summary}` : String(tool.name ?? "");
        })
        .join(" · ");
    case "result":
      return `הסתיים · ${Number(p.numTurns ?? 0)} סבבים · $${Number(p.costUsd ?? 0).toFixed(3)}`;
    case "error":
      return String(p.message ?? p.reason ?? JSON.stringify(p));
    default:
      return Object.entries(p ?? {})
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ");
  }
}

export function RunLog({ events }: { events: RunEvent[] }) {
  // Scroll the log box itself. scrollIntoView scrolled the whole page to the
  // bottom on every event, hiding the stage header and its approve button.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [events.length]);

  if (!events.length) {
    return <p className="p-4 text-sm text-ink-3">אין עדיין פעילות.</p>;
  }

  return (
    <div ref={boxRef} className="max-h-72 overflow-y-auto px-4 py-3 text-sm">
      {events.map((e, i) => (
        <div key={`${e.ts}-${i}`} className="flex gap-3 border-b border-line py-1.5 last:border-0">
          <span className="ltr shrink-0 text-xs text-ink-3">{e.ts.slice(11, 19)}</span>
          <span className="shrink-0 text-xs text-ink-3">{STAGE_LABEL[e.stage]}</span>
          <span
            className={`min-w-0 flex-1 break-words ${TYPE_STYLE[e.type]} ${e.type === "text" ? "line-clamp-3" : ""} ${e.type === "tool" ? "ltr" : ""}`}
            title={e.type === "text" ? line(e) : undefined}
          >
            {line(e)}
          </span>
        </div>
      ))}
    </div>
  );
}
