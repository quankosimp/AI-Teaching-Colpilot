import { z } from "zod";
import { Id, Timestamp } from "./domain.js";

export const EventType = z.enum([
  "session.started",
  "session.ended",
  "activity.changed",
  "member.join_requested",
  "member.admitted",
  "member.updated",
  "board.updated",
  "annotation.created",
  "quick_check.opened",
  "quick_check.closed",
  "quick_check.responded",
  "submission.created",
  "chat.message",
  "reaction.updated",
  "evidence.created",
  "claim.reviewed",
  "review.reopened",
]);
// Notifications carry identifiers only; clients read actor-projected resources.
export const EventPayload = z.strictObject({
  resourceId: Id.optional(),
  activityId: Id.optional(),
  version: z.number().int().positive().optional(),
});
export const RealtimeEnvelope = z.strictObject({
  eventId: Id,
  sessionId: Id,
  seq: z.number().int().positive(),
  type: EventType,
  occurredAt: Timestamp,
  actorId: Id,
  payload: EventPayload,
});
export type RealtimeEnvelope = z.infer<typeof RealtimeEnvelope>;
export const EventVisibility = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("public") }),
  z.strictObject({ scope: z.literal("teacher") }),
  z.strictObject({ scope: z.literal("student"), studentId: Id }),
]);
export const ClassroomReconnect = z.strictObject({
  sessionId: Id,
  lastEventSeq: z.number().int().nonnegative(),
});
export type ClassroomReconnect = z.infer<typeof ClassroomReconnect>;
export const ResyncRequired = z.strictObject({
  type: z.literal("room.resync_required"),
  sessionId: Id,
  lastEventSeq: z.number().int().nonnegative(),
});

export function canReceiveEvent(
  actor:
    | { role: "teacher"; teacherId: string }
    | {
        role: "student";
        teacherId: string;
        sessionId: string;
        studentId: string;
      },
  event: {
    teacherId: string;
    sessionId: string;
    visibility: z.infer<typeof EventVisibility>;
    type: z.infer<typeof EventType>;
  },
): boolean {
  if (actor.teacherId !== event.teacherId) return false;
  if (actor.role === "teacher") return true;
  if (actor.sessionId !== event.sessionId) return false;
  if (
    [
      "evidence.created",
      "claim.reviewed",
      "review.reopened",
      "member.join_requested",
    ].includes(event.type)
  )
    return false;
  if (event.visibility.scope === "teacher") return false;
  if (event.visibility.scope === "student")
    return event.visibility.studentId === actor.studentId;
  // Response/submission notifications must be targeted, never broadcast to peers.
  return !["quick_check.responded", "submission.created"].includes(event.type);
}
