import { z } from "zod";
import { StageId } from "./project";

export const CommentTarget = z.object({
  kind: z.enum(["general", "section", "slide"]),
  /** section id or slide number as string */
  ref: z.string().optional(),
});

export const Comment = z.object({
  id: z.string(),
  stage: StageId,
  iteration: z.number().int().nonnegative(),
  target: CommentTarget,
  text: z.string().min(1),
  createdAt: z.string(),
  resolvedInIteration: z.number().int().optional(),
});
export type Comment = z.infer<typeof Comment>;

export const CommentsFile = z.object({ comments: z.array(Comment) });
export type CommentsFile = z.infer<typeof CommentsFile>;
