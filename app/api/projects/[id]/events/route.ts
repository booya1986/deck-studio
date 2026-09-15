import { emitterFor, runningJob } from "@/lib/runner/runner";
import { tailRunEvents, type RunEvent } from "@/lib/store/runlog";
import { isValidProjectId } from "@/lib/store/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/** Replay the recent log, then stream live events for this project. */
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!isValidProjectId(id)) return new Response("not found", { status: 404 });
  const encoder = new TextEncoder();
  const emitter = emitterFor(id);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const onEvent = (e: RunEvent) => send("run", e);
      emitter.on("event", onEvent);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        emitter.off("event", onEvent);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", close);

      send("replay", { events: await tailRunEvents(id, 200), running: runningJob(id) });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
