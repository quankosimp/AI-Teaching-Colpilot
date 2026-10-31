import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeData } from '../src/product/demo';
import { baselineSeed, pickMaterials } from '../src/product/model';
import { canStudentAct } from '../src/product/permissions';

test('new sessions receive one invite per member without reviving revoked links', () => {
  const data = normalizeData(structuredClone({ ...baselineSeed, version: 2 as const }));
  const session = data.sessions[0];
  const invite = data.invites.find(i => i.sessionId === session.id && i.studentId === session.studentId)!;
  assert.ok(invite);
  invite.revoked = true;
  const next = normalizeData(data);
  assert.equal(next.invites.filter(i => i.sessionId === session.id && i.studentId === session.studentId).length, 1);
  assert.equal(next.invites.find(i => i.id === invite.id)?.revoked, true);
});

test('student actions require a live session, joined member and valid token', () => {
  const data = normalizeData(structuredClone({ ...baselineSeed, version: 2 as const }));
  const session = data.sessions[0];
  const member = data.members.find(m => m.sessionId === session.id && m.studentId === session.studentId)!;
  const invite = data.invites.find(i => i.sessionId === session.id && i.studentId === session.studentId)!;
  member.state = 'joined';
  assert.equal(canStudentAct(data, session.id, member.studentId, undefined, invite.token), false);
  session.status = 'live';
  assert.equal(canStudentAct(data, session.id, member.studentId, undefined, invite.token), true);
  invite.revoked = true;
  assert.equal(canStudentAct(data, session.id, member.studentId, undefined, invite.token), false);
});

test('recommendations use only approved claims belonging to the student', () => {
  const student = structuredClone(baselineSeed.students[0]);
  const material = { ...baselineSeed.materials[0], subject: student.subject, grade: student.grade, topic: 'xyzunique', title: 'xyzunique' };
  const claim = { ...baselineSeed.claims[0], studentId: student.id, text: 'xyzunique', status: 'pending' as const };
  const score = pickMaterials(student, [material], [claim])[0].score;
  assert.equal(pickMaterials(student, [material], [{ ...claim, status: 'approved', studentId: 'other' }])[0].score, score);
  assert.ok(pickMaterials(student, [material], [{ ...claim, status: 'approved' }])[0].score > score);
});
