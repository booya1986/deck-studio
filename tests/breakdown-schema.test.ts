import { describe, expect, it } from "vitest";
import { Slide } from "@/lib/schema/breakdown";

const slide = (type: string) => ({
  n: 1, sectionId: "s1", layout: "timeline", title: "t", keyMessage: "m", body: [],
  visual: { type, spec: "ציר זמן" }, speakerNotes: "", claimIds: [], confidence: 1,
});

describe("breakdown visual type", () => {
  it("maps a layout name used as a visual type to its drawing", () => {
    expect(Slide.parse(slide("timeline")).visual.type).toBe("svg_diagram");
    expect(Slide.parse(slide("Graph")).visual.type).toBe("chart");
  });

  it("still rejects a type with no clear meaning", () => {
    expect(Slide.safeParse(slide("hologram")).success).toBe(false);
  });
});
