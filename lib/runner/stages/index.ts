import type { StageId } from "@/lib/schema/project";
import type { StageModule } from "./types";
import { designSystemStage } from "./design-system";
import { outlineStage } from "./outline";
import { researchStage } from "./research";
import { buildStage } from "./build";
import { qaStage } from "./qa";

const MODULES: Partial<Record<StageId, StageModule>> = {
  design_system: designSystemStage,
  outline: outlineStage,
  research: researchStage,
  build: buildStage,
  qa: qaStage,
};

export function stageModule(stage: StageId): StageModule {
  const m = MODULES[stage];
  if (!m) throw new Error(`השלב ${stage} עדיין לא ממומש`);
  return m;
}

export { designSystemStage };
