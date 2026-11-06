import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../server/app.js";
import { db, loadConfig } from "../../../server/context.js";
import { StudentRoomViewModel } from "../../../contracts/ui.js";

test("lesson content persists optional timings and source page; student receives public text only", {
  skip: process.env.RUN_LESSON_INTEGRATION !== "1",
}, async () => {
  // This suite must never target the user's working database.
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.port, "55433");
  assert.equal(database.pathname, "/copilot_lesson_20261106");
  const config = loadConfig();
  const server = createApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const call = async (path: string, token = "", method = "GET", data?: unknown, ver?: number) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1${path}`, {
      method, headers: { Origin: config.origin, "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(), ...(token ? {Authorization:`Bearer ${token}`} : {}),
        ...(ver ? {"If-Match-Version":String(ver)} : {}) },
      ...(data ? {body:JSON.stringify(data)} : {}),
    });
    const body = await response.json(); return {status:response.status,body};
  };
  try {
    const login = await call("/auth/mock", "", "POST", {account:"teacher-a"});
    const token = login.body.accessToken;
    const other = (await call("/auth/mock", "", "POST", {account:"teacher-b"})).body.accessToken;
    const student = (await call("/students", token)).body.students[0];
    const material = await db.material.create({data:{teacherId:student.teacherId,title:"Two page source",subject:"English",grade:"9",topic:"Reading",level:"CoBan",kind:"PDF",description:"",source:"test",
      MaterialVersion_materialId_items:{create:{version:1,pages:[],uploadStatus:"ready"}}}});
    let result = await call("/sessions",token,"POST",{studentIds:[student.id],title:"Lesson content test",goal:"PRIVATE GOAL",sharedGoal:"Read",date:"2026-11-06",time:"19:00",duration:60,tools:{board:true,upload:true,chat:true,check:true}});
    assert.equal(result.status,201); let session=result.body.session;
    const base={title:"Read and answer",description:"PUBLIC: Find the evidence.",teacherNotes:"PRIVATE ANSWER KEY",duration:null,type:"LuyenTap",materialId:material.id,materialVersion:1,materialStartPage:1,sourceEvidenceIds:[],sourceClaimRefs:[]};
    assert.equal((await call(`/sessions/${session.id}/activities`,other,"PUT",[base],session.version)).status,403);
    assert.equal((await call(`/sessions/${session.id}/activities`,token,"PUT",[{...base,materialStartPage:-1}],session.version)).status,400);
    result=await call(`/sessions/${session.id}/activities`,token,"PUT",[base,{...base,title:"Pasted task",materialId:null,materialVersion:null,materialStartPage:0}],session.version);
    assert.equal(result.status,200); assert.equal(result.body.durationExceeded,false);
    session=(await call(`/sessions/${session.id}`,token)).body.session;
    const [first,second]=session.Activity_sessionId_items;
    assert.equal(first.duration,null);assert.equal(first.materialStartPage,1);assert.equal(first.teacherNotes,base.teacherNotes);
    assert.equal((await call(`/sessions/${session.id}/activities`,token,"PUT",[base],session.version-1)).status,409);
    const invite=await call(`/sessions/${session.id}/invites`,token,"POST",{studentId:student.id});
    const joined=await call("/room/join-request","","POST",{token:invite.body.rawToken,name:"Learner",consent:true});
    assert.equal(joined.status,200);
    assert.equal((await call(`/sessions/${session.id}/start`,token,"POST",{})).status,200);
    assert.equal((await call(`/sessions/${session.id}/members/${joined.body.memberId}/admit`,token,"POST",{})).status,200);
    let state=(await call(`/room/state?sessionId=${session.id}`,token)).body;
    assert.equal(state.session.materialPage,1);
    await call(`/sessions/${session.id}/classroom`,token,"PATCH",{currentActivityId:second.id},state.session.version);
    state=(await call(`/room/state?sessionId=${session.id}`,token)).body;
    assert.equal(state.session.materialPage,0);
    const guest=(await call("/room/state",joined.body.accessToken)).body;
    assert.equal(StudentRoomViewModel.safeParse(guest).success,true);
    assert.equal(guest.activities[0].description,base.description);
    assert.ok(!JSON.stringify(guest).includes("PRIVATE ANSWER KEY"));
    assert.ok(!JSON.stringify(guest).includes("PRIVATE GOAL"));
  } finally { server.close(); await once(server,"close"); await db.$disconnect(); }
});
