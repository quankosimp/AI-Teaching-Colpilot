import { test } from "node:test";
import { strict as assert } from "node:assert";
import { normalizeData } from "../src/product/demo";
import { baselineSeed, pickMaterials } from "../src/product/model";
import { canStudentAct } from "../src/product/permissions";

test("new sessions receive one invite per member without reviving revoked links", () => {
  const data = normalizeData(
    structuredClone({ ...baselineSeed, version: 2 as const }),
  );
  const session = data.sessions[0];
  const invite = data.invites.find(
    (i) => i.sessionId === session.id && i.studentId === session.studentId,
  )!;
  assert.ok(invite);
  invite.revoked = true;
  const next = normalizeData(data);
  assert.equal(
    next.invites.filter(
      (i) => i.sessionId === session.id && i.studentId === session.studentId,
    ).length,
    1,
  );
  assert.equal(next.invites.find((i) => i.id === invite.id)?.revoked, true);
});

test("student actions require a live session, joined member and valid token", () => {
  const data = normalizeData(
    structuredClone({ ...baselineSeed, version: 2 as const }),
  );
  const session = data.sessions[0];
  const member = data.members.find(
    (m) => m.sessionId === session.id && m.studentId === session.studentId,
  )!;
  const invite = data.invites.find(
    (i) => i.sessionId === session.id && i.studentId === session.studentId,
  )!;
  member.state = "joined";
  assert.equal(
    canStudentAct(data, session.id, member.studentId, undefined, invite.token),
    false,
  );
  session.status = "live";
  assert.equal(
    canStudentAct(data, session.id, member.studentId, undefined, invite.token),
    true,
  );
  invite.revoked = true;
  assert.equal(
    canStudentAct(data, session.id, member.studentId, undefined, invite.token),
    false,
  );
});

test("recommendations use only approved claims belonging to the student", () => {
  const student = structuredClone(baselineSeed.students[0]);
  const material = {
    ...baselineSeed.materials[0],
    subject: student.subject,
    grade: student.grade,
    topic: "xyzunique",
    title: "xyzunique",
  };
  student.gaps = ["xyzunique"];
  student.strengths = [];
  student.goal = "";
  const manualScore = pickMaterials(student, [material])[0].score;
  student.gaps = [];
  assert.ok(manualScore > pickMaterials(student, [material])[0].score);
  const claim = {
    ...baselineSeed.claims[0],
    studentId: student.id,
    text: "xyzunique",
    status: "pending" as const,
  };
  const score = pickMaterials(student, [material], [claim])[0].score;
  assert.equal(
    pickMaterials(
      student,
      [material],
      [{ ...claim, status: "approved", studentId: "other" }],
    )[0].score,
    score,
  );
  assert.equal(
    pickMaterials(student, [material], [{ ...claim, status: "rejected" }])[0]
      .score,
    score,
  );
  assert.deepEqual(
    pickMaterials(
      student,
      [material],
      [{ ...claim, status: "approved" }],
    )[0].sources.map((c) => c.id),
    [claim.id],
  );
  assert.ok(
    pickMaterials(student, [material], [{ ...claim, status: "approved" }])[0]
      .score > score,
  );
});

test("evidence changes invalidate only approved dependent claims and reopen their reviews; no-op preserves data", async () => {
  const { updateEvidence } = await import("../src/product/reviewLogic");
  const data = normalizeData(
    structuredClone({ ...baselineSeed, version: 2 as const }),
  );
  const evidence = data.evidence[0];
  const session = data.sessions.find((s) => s.id === evidence.sessionId)!;
  session.status = "reviewed";
  const claim = {
    ...baselineSeed.claims[0],
    id: "linked",
    sessionId: session.id,
    evidenceIds: [evidence.id],
    status: "approved" as const,
  };
  const unrelated = { ...claim, id: "unrelated", evidenceIds: ["another"] };
  const pending = { ...claim, id: "pending", status: "pending" as const };
  data.claims = [claim, unrelated, pending];
  assert.equal(
    updateEvidence(
      data,
      evidence.id,
      ` ${evidence.detail} `,
      evidence.support || "Chưa rõ",
      "now",
    ),
    data,
  );
  const changed = updateEvidence(
    data,
    evidence.id,
    evidence.detail,
    "Được hướng dẫn",
    "now",
  );
  assert.equal(changed.claims[0].status, "pending");
  assert.equal(changed.claims[1].status, "approved");
  assert.equal(changed.claims[2].status, "pending");
  assert.equal(
    changed.sessions.find((s) => s.id === session.id)?.status,
    "ended",
  );
  assert.equal(
    data.sessions.find((s) => s.id === session.id)?.status,
    "reviewed",
  );
  assert.deepEqual(changed.submissions, data.submissions);
});

test("review can finish with zero or rejected claims, but not pending claims", async () => {
  const { completeReview } = await import("../src/product/reviewLogic");
  const data = normalizeData(
    structuredClone({ ...baselineSeed, version: 2 as const }),
  );
  const session = data.sessions[0];
  session.status = "ended";
  data.claims = [];
  const completed = completeReview(data, session.id);
  assert.equal(
    completed.sessions.find((s) => s.id === session.id)?.status,
    "reviewed",
  );
  assert.equal(completed.claims.length, 0);
  const claim = {
    ...baselineSeed.claims[0],
    sessionId: session.id,
    status: "rejected" as const,
  };
  data.claims = [claim];
  assert.equal(completeReview(data, session.id).sessions[0].status, "reviewed");
  data.claims = [{ ...claim, status: "pending" }];
  assert.equal(completeReview(data, session.id), data);
});
