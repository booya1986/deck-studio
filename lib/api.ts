import { NextResponse } from "next/server";

export function ok<T>(data: T) {
  return NextResponse.json(data);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Turn a thrown value into a response without leaking a stack trace. */
export function failure(e: unknown, status = 400) {
  return fail(e instanceof Error ? e.message : "שגיאה לא צפויה", status);
}
