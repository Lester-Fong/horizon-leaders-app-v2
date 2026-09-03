import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AuthService } from "../auth/types.js";
import type { OpenCellService } from "../opencell/types.js";

const id="11111111-1111-4111-8111-111111111111";
const programme={id,name:"Foundations",description:null,status:"active" as const,createdByProfileId:"22222222-2222-4222-8222-222222222222",finishedAt:null,createdAt:"2026-09-01T00:00:00Z",updatedAt:"2026-09-01T00:00:00Z",sessionCount:0,participantCount:0};
const auth:AuthService={authenticate:vi.fn(async token=>token==="token"?{ok:true,actor:{id:programme.createdByProfileId,isActive:true,name:"Leader",role:"leader"}}:{ok:false,error:{status:401,code:"UNAUTHENTICATED",message:"Sign in required."}})};
function service():OpenCellService{return {list:vi.fn(async()=>[programme]),getById:vi.fn(async()=>programme),create:vi.fn(async()=>programme),update:vi.fn(async()=>programme),finish:vi.fn(async()=>({programme,evaluations:[]})),listSessions:vi.fn(async()=>[]),createSession:vi.fn(async()=>({id,programmeId:id,sessionDate:"2026-09-01",title:null,location:null,notes:null,isCancelled:false,createdAt:programme.createdAt,updatedAt:programme.updatedAt,attendanceCount:0})),updateSession:vi.fn(),cancelSession:vi.fn(),listParticipants:vi.fn(async()=>[]),enroll:vi.fn(),removeEnrollment:vi.fn(),listAttendance:vi.fn(async()=>[]),addAttendance:vi.fn(),removeAttendance:vi.fn()};}
describe("OpenCell routes",()=>{it("allows either authenticated role to list and validates programme input",async()=>{const s=service();const app=createApp({authService:auth,openCellService:s});const listed=await request(app).get("/api/opencell/programmes").set("Authorization","Bearer token");expect(listed.status).toBe(200);expect(listed.body.data).toHaveLength(1);const invalid=await request(app).post("/api/opencell/programmes").set("Authorization","Bearer token").send({description:"missing name"});expect(invalid.status).toBe(400);});});
