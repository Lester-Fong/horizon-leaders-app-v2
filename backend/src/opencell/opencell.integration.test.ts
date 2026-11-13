import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseOpenCellService } from "./supabase-opencell-service.js";

const url=process.env.SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY; const suite=url&&key?describe:describe.skip;
suite("OpenCell API with local Supabase",()=>{const db=createClient<Database>(url??"http://127.0.0.1:54321",key??"missing",{auth:{autoRefreshToken:false,detectSessionInUrl:false,persistSession:false}});const users:string[]=[];const programmes:string[]=[];const visitors:string[]=[];const sessions:string[]=[];
 // OpenCell foreign keys are ON DELETE RESTRICT, so clean up children first: attendance, sessions, enrollments, programmes.
 afterEach(async()=>{if(programmes.length){const owned=await db.from("opencell_sessions").select("id").in("programme_id",programmes);if(owned.error)throw owned.error;const sessionIds=[...new Set([...sessions,...owned.data.map(row=>row.id)])];if(sessionIds.length){const attendance=await db.from("opencell_attendance").delete().in("session_id",sessionIds);if(attendance.error)throw attendance.error;const deletedSessions=await db.from("opencell_sessions").delete().in("id",sessionIds);if(deletedSessions.error)throw deletedSessions.error;}const enrollments=await db.from("opencell_enrollments").delete().in("programme_id",programmes);if(enrollments.error)throw enrollments.error;const deletedProgrammes=await db.from("opencell_programmes").delete().in("id",programmes.splice(0));if(deletedProgrammes.error)throw deletedProgrammes.error;}sessions.splice(0);if(visitors.length){await db.from("follow_ups").delete().in("visitor_id",visitors);await db.from("visitors").delete().in("id",visitors.splice(0));}for(const id of users.splice(0).reverse())await db.auth.admin.deleteUser(id);});
 async function profile(){const {data,error}=await db.auth.admin.createUser({email:`oc-${Date.now()}@example.test`,email_confirm:true,password:"OpenCell-Aa1!"});if(error||!data.user)throw error??new Error("user missing");users.push(data.user.id);await db.from("profiles").update({role:"leader"}).eq("id",data.user.id);return data.user.id;}
 it("supports shared management, dated attendance, and one active enrollment",async()=>{const actorId=await profile();const actor:HorizonActor={id:actorId,isActive:true,name:"OpenCell Leader",role:"leader"};const auth:AuthService={authenticate:async()=>({ok:true,actor})};const service=createSupabaseOpenCellService({serviceRoleKey:key!,supabaseUrl:url!});const app=createApp({authService:auth,openCellService:service});const api=(method:"get"|"post",path:string)=>request(app)[method](path).set("Authorization","Bearer oc-token");const created=await api("post","/api/opencell/programmes").send({name:"Foundations",description:null});expect(created.status).toBe(201);const programmeId=created.body.data.id;programmes.push(programmeId);const visitor=await db.from("visitors").insert({first_name:"Open",last_name:"Cell",status:"active"}).select("id").single();if(visitor.error)throw visitor.error;visitors.push(visitor.data.id);const enrolled=await api("post",`/api/opencell/programmes/${programmeId}/participants`).send({visitorId:visitor.data.id,enrolledOn:"2026-09-01"});expect(enrolled.status).toBe(201);const duplicate=await api("post",`/api/opencell/programmes/${programmeId}/participants`).send({visitorId:visitor.data.id,enrolledOn:"2026-09-01"});expect(duplicate.status).toBe(409);const session=await api("post",`/api/opencell/programmes/${programmeId}/sessions`).send({sessionDate:"2026-09-02",title:"Week 1",location:null,notes:null});expect(session.status).toBe(201);sessions.push(session.body.data.id);const marked=await api("post",`/api/opencell/programmes/${programmeId}/sessions/${session.body.data.id}/attendance`).send({visitorId:visitor.data.id});expect(marked.status).toBe(201);const finished=await api("post",`/api/opencell/programmes/${programmeId}/finish`).send();expect(finished.status).toBe(200);expect(finished.body.data.evaluations[0]).toMatchObject({qualified:true,attendedCount:1,eligibleSessionCount:1});});
 it("rejects attendance deletion through a different Programme than the Session's",async()=>{
  const actorId=await profile();
  const actor:HorizonActor={id:actorId,isActive:true,name:"OpenCell Leader",role:"leader"};
  const auth:AuthService={authenticate:async()=>({ok:true,actor})};
  const app=createApp({authService:auth,openCellService:createSupabaseOpenCellService({serviceRoleKey:key!,supabaseUrl:url!})});
  const api=(method:"post"|"delete",path:string)=>request(app)[method](path).set("Authorization","Bearer oc-token");
  const finishedProgramme=await api("post","/api/opencell/programmes").send({name:"Finished Source",description:null});
  const activeProgramme=await api("post","/api/opencell/programmes").send({name:"Active Other",description:null});
  expect(finishedProgramme.status).toBe(201);expect(activeProgramme.status).toBe(201);
  const finishedId=finishedProgramme.body.data.id as string;const activeId=activeProgramme.body.data.id as string;
  programmes.push(finishedId,activeId);
  const visitor=await db.from("visitors").insert({first_name:"Scoped",last_name:"Attendance",status:"active"}).select("id").single();
  if(visitor.error)throw visitor.error;visitors.push(visitor.data.id);
  expect((await api("post",`/api/opencell/programmes/${finishedId}/participants`).send({visitorId:visitor.data.id,enrolledOn:"2026-09-01"})).status).toBe(201);
  const session=await api("post",`/api/opencell/programmes/${finishedId}/sessions`).send({sessionDate:"2026-09-02",title:null,location:null,notes:null});
  expect(session.status).toBe(201);const sessionId=session.body.data.id as string;sessions.push(sessionId);
  expect((await api("post",`/api/opencell/programmes/${finishedId}/sessions/${sessionId}/attendance`).send({visitorId:visitor.data.id})).status).toBe(201);
  expect((await api("post",`/api/opencell/programmes/${finishedId}/finish`).send()).status).toBe(200);

  const crossProgramme=await api("delete",`/api/opencell/programmes/${activeId}/sessions/${sessionId}/attendance/${visitor.data.id}`);
  expect(crossProgramme.status).toBe(404);
  expect(crossProgramme.body.error.code).toBe("SESSION_NOT_FOUND");
  const ownProgramme=await api("delete",`/api/opencell/programmes/${finishedId}/sessions/${sessionId}/attendance/${visitor.data.id}`);
  expect(ownProgramme.status).toBe(409);
  expect(ownProgramme.body.error.code).toBe("PROGRAMME_FINISHED");
  const remaining=await db.from("opencell_attendance").select("visitor_id",{count:"exact",head:true}).eq("session_id",sessionId);
  if(remaining.error)throw remaining.error;
  expect(remaining.count).toBe(1);
 });
});
