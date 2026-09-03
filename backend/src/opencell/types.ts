import type { HorizonActor } from "../auth/types.js";

export type OpenCellProgrammeStatus = "active" | "finished";
export interface OpenCellProgramme { id:string; name:string; description:string|null; status:OpenCellProgrammeStatus; createdByProfileId:string; finishedAt:string|null; createdAt:string; updatedAt:string; sessionCount:number; participantCount:number; }
export interface OpenCellSession { id:string; programmeId:string; sessionDate:string; title:string|null; location:string|null; notes:string|null; isCancelled:boolean; createdAt:string; updatedAt:string; attendanceCount:number; }
export interface OpenCellParticipant { visitorId:string; firstName:string; lastName:string; email:string|null; phone:string|null; visitorStatus:"active"|"converted"; enrolledOn:string; attendedCount:number; eligibleSessionCount:number; }
export interface OpenCellEvaluation { visitorId:string; visitorName:string; attendedCount:number; eligibleSessionCount:number; percentage:number|null; qualified:boolean; followUpOutcome:"created"|"suppressed"|null; }
export interface OpenCellFinishResult { programme:OpenCellProgramme; evaluations:OpenCellEvaluation[]; }
export interface OpenCellService {
  list(actor:HorizonActor, options:{search?:string; status:OpenCellProgrammeStatus|"all"}):Promise<OpenCellProgramme[]>;
  getById(actor:HorizonActor,id:string):Promise<OpenCellProgramme>;
  create(actor:HorizonActor,input:{name:string;description:string|null}):Promise<OpenCellProgramme>;
  update(actor:HorizonActor,id:string,input:{name?:string;description?:string|null}):Promise<OpenCellProgramme>;
  finish(actor:HorizonActor,id:string):Promise<OpenCellFinishResult>;
  listSessions(actor:HorizonActor,programmeId:string):Promise<OpenCellSession[]>;
  createSession(actor:HorizonActor,programmeId:string,input:{sessionDate:string;title:string|null;location:string|null;notes:string|null}):Promise<OpenCellSession>;
  updateSession(actor:HorizonActor,programmeId:string,sessionId:string,input:Partial<{sessionDate:string;title:string|null;location:string|null;notes:string|null}>):Promise<OpenCellSession>;
  cancelSession(actor:HorizonActor,programmeId:string,sessionId:string):Promise<OpenCellSession>;
  listParticipants(actor:HorizonActor,programmeId:string):Promise<OpenCellParticipant[]>;
  enroll(actor:HorizonActor,programmeId:string,visitorId:string,enrolledOn:string):Promise<OpenCellParticipant>;
  removeEnrollment(actor:HorizonActor,programmeId:string,visitorId:string):Promise<void>;
  listAttendance(actor:HorizonActor,programmeId:string,sessionId:string):Promise<{visitorId:string;present:boolean}[]>;
  addAttendance(actor:HorizonActor,programmeId:string,sessionId:string,visitorId:string):Promise<void>;
  removeAttendance(actor:HorizonActor,programmeId:string,sessionId:string,visitorId:string):Promise<void>;
}
export type OpenCellErrorCode = "OPENCELL_NOT_FOUND"|"OPENCELL_SERVICE_UNAVAILABLE"|"PROGRAMME_FINISHED"|"SESSION_NOT_FOUND"|"SESSION_HAS_ATTENDANCE"|"ALREADY_ENROLLED"|"ACTIVE_ENROLLMENT"|"VISITOR_NOT_FOUND"|"VISITOR_NOT_ACTIVE"|"ENROLLMENT_NOT_FOUND"|"ATTENDANCE_NOT_FOUND"|"NOT_ELIGIBLE"|"INVALID_INPUT";
export class OpenCellServiceError extends Error { constructor(readonly status:404|409|422|500,readonly code:OpenCellErrorCode,message:string){super(message);this.name="OpenCellServiceError";} }
