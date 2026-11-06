import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ClassSchedule,
  nextOccurrences,
  pickOpenTarget,
  vnNowTime,
  vnToday,
} from "../../../contracts/classes.js";

test("nextOccurrences lists the coming weekdays in order", () => {
  // 2026-11-06 is a Friday (5). Thursday = 4, Saturday = 6.
  assert.deepEqual(nextOccurrences([4], "19:30", "2026-11-06", 3), [
    "2026-11-12",
    "2026-11-19",
    "2026-11-26",
  ]);
  assert.deepEqual(nextOccurrences([6, 0], "09:00", "2026-11-06", 3), [
    "2026-11-07",
    "2026-11-08",
    "2026-11-14",
  ]);
});

test("nextOccurrences keeps today only while the start time is ahead", () => {
  assert.deepEqual(nextOccurrences([5], "19:30", "2026-11-06", 1, "18:00"), ["2026-11-06"]);
  assert.deepEqual(nextOccurrences([5], "19:30", "2026-11-06", 1, "20:00"), ["2026-11-13"]);
});

test("nextOccurrences returns nothing for an empty schedule", () => {
  assert.deepEqual(nextOccurrences([], "19:30", "2026-11-06", 3), []);
});

test("ClassSchedule rejects bad days and times", () => {
  assert.equal(ClassSchedule.safeParse({ days: [7], time: "19:30" }).success, false);
  assert.equal(ClassSchedule.safeParse({ days: [], time: "19:30" }).success, false);
  assert.equal(ClassSchedule.safeParse({ days: [1], time: "25:00" }).success, false);
  assert.equal(ClassSchedule.safeParse({ days: [1, 4], time: "07:05" }).success, true);
});

test("pickOpenTarget prefers a live session, then today's scheduled one", () => {
  const today = "2026-11-06";
  assert.deepEqual(
    pickOpenTarget(
      [
        { id: "a", status: "scheduled", date: today, time: "19:00" },
        { id: "b", status: "live", date: "2026-11-05", time: "19:00" },
      ],
      today,
    ),
    { kind: "rejoin", sessionId: "b" },
  );
  assert.deepEqual(
    pickOpenTarget(
      [
        { id: "late", status: "scheduled", date: today, time: "20:00" },
        { id: "early", status: "draft", date: today, time: "08:00" },
        { id: "old", status: "ended", date: today, time: "07:00" },
      ],
      today,
    ),
    { kind: "start", sessionId: "early" },
  );
});

test("pickOpenTarget creates a session when nothing fits today", () => {
  assert.deepEqual(
    pickOpenTarget(
      [
        { id: "x", status: "scheduled", date: "2026-11-12", time: "19:30" },
        { id: "y", status: "ended", date: "2026-11-06", time: "08:00" },
      ],
      "2026-11-06",
    ),
    { kind: "create" },
  );
});

test("vnToday and vnNowTime use Vietnam time", () => {
  const at = new Date("2026-11-06T17:30:00Z"); // 00:30 on 7/11 in Vietnam
  assert.equal(vnToday(at), "2026-11-07");
  assert.equal(vnNowTime(at), "00:30");
});
