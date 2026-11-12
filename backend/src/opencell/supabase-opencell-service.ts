import { createClient } from "@supabase/supabase-js";

import { churchDate } from "../config/church-date.js";
import type { Database, Tables } from "../types/database.types.js";
import {
  OpenCellServiceError,
  type OpenCellEvaluation,
  type OpenCellParticipant,
  type OpenCellProgramme,
  type OpenCellService,
  type OpenCellSession,
} from "./types.js";

interface SupabaseOpenCellServiceConfig {
  serviceRoleKey: string;
  supabaseUrl: string;
}

interface ProgrammeCounts {
  sessionCount: number;
  participantCount: number;
}

type ProgrammeRow = Tables<"opencell_programmes">;
type SessionRow = Tables<"opencell_sessions">;

const PROGRAMME_COLUMNS =
  "id,name,description,status,created_by_profile_id,finished_at,created_at,updated_at";
const SESSION_COLUMNS =
  "id,programme_id,session_date,title,location,notes,is_cancelled,created_at,updated_at";
const ENROLLMENT_WITH_VISITOR_COLUMNS =
  "programme_id,visitor_id,enrolled_on,visitors(id,first_name,last_name,email,phone,status)";

function serviceUnavailable() {
  return new OpenCellServiceError(
    500,
    "OPENCELL_SERVICE_UNAVAILABLE",
    "OpenCell data is temporarily unavailable.",
  );
}

function openCellNotFound() {
  return new OpenCellServiceError(404, "OPENCELL_NOT_FOUND", "OpenCell record was not found.");
}

function programmeReadOnly() {
  return new OpenCellServiceError(
    409,
    "PROGRAMME_FINISHED",
    "Finished OpenCell Programmes are read-only.",
  );
}

function alreadyEnrolled() {
  return new OpenCellServiceError(
    409,
    "ALREADY_ENROLLED",
    "This Visitor is already enrolled in the Programme.",
  );
}

function mapProgramme(
  row: ProgrammeRow,
  sessionCount = 0,
  participantCount = 0,
): OpenCellProgramme {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdByProfileId: row.created_by_profile_id,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sessionCount,
    participantCount,
  };
}

function mapSession(row: SessionRow, attendanceCount = 0): OpenCellSession {
  return {
    id: row.id,
    programmeId: row.programme_id,
    sessionDate: row.session_date,
    title: row.title,
    location: row.location,
    notes: row.notes,
    isCancelled: row.is_cancelled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attendanceCount,
  };
}

function mapEvaluations(evaluations: unknown): OpenCellEvaluation[] {
  if (!Array.isArray(evaluations)) return [];
  // The finish RPC returns its evaluation rows as untyped JSON whose shape is
  // defined by the database function, so the generated types cannot express it.
  return evaluations as OpenCellEvaluation[];
}

function enrollmentOutcomeError(outcome: string) {
  switch (outcome) {
    case "programme_not_found":
      return openCellNotFound();
    case "programme_finished":
      return programmeReadOnly();
    case "visitor_not_found":
      return new OpenCellServiceError(404, "VISITOR_NOT_FOUND", "Visitor was not found.");
    case "visitor_not_active":
      return new OpenCellServiceError(422, "VISITOR_NOT_ACTIVE", "Only active Visitors may enroll.");
    case "already_enrolled":
      return alreadyEnrolled();
    case "active_enrollment":
      return new OpenCellServiceError(
        409,
        "ACTIVE_ENROLLMENT",
        "This Visitor is enrolled in another active Programme.",
      );
    default:
      return undefined;
  }
}

function enrollmentRemovalError(outcome: string) {
  switch (outcome) {
    case "removed":
      return undefined;
    case "programme_not_found":
      return openCellNotFound();
    case "programme_finished":
      return programmeReadOnly();
    case "enrollment_not_found":
      return new OpenCellServiceError(404, "ENROLLMENT_NOT_FOUND", "Enrollment was not found.");
    case "attendance_exists":
      return new OpenCellServiceError(
        409,
        "SESSION_HAS_ATTENDANCE",
        "Attendance exists; this historical enrollment cannot be removed.",
      );
    default:
      return serviceUnavailable();
  }
}

export function createSupabaseOpenCellService({
  serviceRoleKey,
  supabaseUrl,
}: SupabaseOpenCellServiceConfig): OpenCellService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function getProgrammeRow(programmeId: string) {
    const { data, error } = await supabase
      .from("opencell_programmes")
      .select(PROGRAMME_COLUMNS)
      .eq("id", programmeId)
      .maybeSingle();
    if (error) throw serviceUnavailable();
    if (!data) throw openCellNotFound();
    return data;
  }

  async function getActiveProgrammeRow(programmeId: string) {
    const programme = await getProgrammeRow(programmeId);
    if (programme.status !== "active") throw programmeReadOnly();
    return programme;
  }

  async function getSessionRow(programmeId: string, sessionId: string) {
    const { data, error } = await supabase
      .from("opencell_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", sessionId)
      .eq("programme_id", programmeId)
      .maybeSingle();
    if (error) throw serviceUnavailable();
    if (!data) {
      throw new OpenCellServiceError(404, "SESSION_NOT_FOUND", "Session was not found.");
    }
    return data;
  }

  async function countSessionAttendance(sessionId: string) {
    const { count, error } = await supabase
      .from("opencell_attendance")
      .select("session_id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (error) throw serviceUnavailable();
    return count ?? 0;
  }

  async function countByProgramme(programmeIds: string[]) {
    const countsByProgramme = new Map<string, ProgrammeCounts>();
    if (!programmeIds.length) return countsByProgramme;

    const [{ data: sessionRows }, { data: enrollmentRows }] = await Promise.all([
      supabase.from("opencell_sessions").select("programme_id").in("programme_id", programmeIds),
      supabase.from("opencell_enrollments").select("programme_id").in("programme_id", programmeIds),
    ]);
    for (const programmeId of programmeIds) {
      countsByProgramme.set(programmeId, { sessionCount: 0, participantCount: 0 });
    }
    for (const row of sessionRows ?? []) {
      const counts = countsByProgramme.get(row.programme_id);
      if (counts) counts.sessionCount++;
    }
    for (const row of enrollmentRows ?? []) {
      const counts = countsByProgramme.get(row.programme_id);
      if (counts) counts.participantCount++;
    }
    return countsByProgramme;
  }

  async function listEnrollmentsWithVisitors(programmeId: string) {
    const { data, error } = await supabase
      .from("opencell_enrollments")
      .select(ENROLLMENT_WITH_VISITOR_COLUMNS)
      .eq("programme_id", programmeId);
    if (error) throw serviceUnavailable();
    return data ?? [];
  }

  async function listParticipants(programmeId: string): Promise<OpenCellParticipant[]> {
    await getProgrammeRow(programmeId);
    const enrollments = await listEnrollmentsWithVisitors(programmeId);
    const { data: sessionData, error } = await supabase
      .from("opencell_sessions")
      .select("id,session_date,is_cancelled")
      .eq("programme_id", programmeId);
    if (error) throw serviceUnavailable();
    const sessions = sessionData ?? [];
    const sessionIds = sessions.map((session) => session.id);
    const { data: attendanceData } = sessionIds.length
      ? await supabase
          .from("opencell_attendance")
          .select("session_id,visitor_id")
          .in("session_id", sessionIds)
      : { data: [] };
    const attendance = attendanceData ?? [];

    return enrollments.map((enrollment) => {
      const visitor = Array.isArray(enrollment.visitors)
        ? enrollment.visitors[0]
        : enrollment.visitors;
      const eligibleSessions = sessions.filter(
        (session) => !session.is_cancelled && session.session_date >= enrollment.enrolled_on,
      );
      const attendedSessionIds = new Set(
        attendance
          .filter((record) => record.visitor_id === enrollment.visitor_id)
          .map((record) => record.session_id),
      );
      return {
        visitorId: enrollment.visitor_id,
        firstName: visitor?.first_name ?? "Visitor",
        lastName: visitor?.last_name ?? "",
        email: visitor?.email ?? null,
        phone: visitor?.phone ?? null,
        visitorStatus: visitor?.status ?? "active",
        enrolledOn: enrollment.enrolled_on,
        attendedCount: eligibleSessions.filter((session) => attendedSessionIds.has(session.id))
          .length,
        eligibleSessionCount: eligibleSessions.length,
      };
    });
  }

  return {
    async list(_actor, options) {
      let query = supabase
        .from("opencell_programmes")
        .select(PROGRAMME_COLUMNS)
        .order("created_at", { ascending: false });
      if (options.status !== "all") query = query.eq("status", options.status);
      const { data, error } = await query;
      if (error) throw serviceUnavailable();

      const programmes = data ?? [];
      const search = options.search?.toLocaleLowerCase();
      const matchingProgrammes = search
        ? programmes.filter((programme) => programme.name.toLocaleLowerCase().includes(search))
        : programmes;
      const countsByProgramme = await countByProgramme(
        matchingProgrammes.map((programme) => programme.id),
      );
      return matchingProgrammes.map((programme) => {
        const counts = countsByProgramme.get(programme.id);
        return mapProgramme(programme, counts?.sessionCount ?? 0, counts?.participantCount ?? 0);
      });
    },

    async getById(_actor, programmeId) {
      return mapProgramme(await getProgrammeRow(programmeId));
    },

    async create(actor, input) {
      const { data, error } = await supabase
        .from("opencell_programmes")
        .insert({
          name: input.name,
          description: input.description,
          created_by_profile_id: actor.id,
        })
        .select(PROGRAMME_COLUMNS)
        .single();
      if (error) throw serviceUnavailable();
      return mapProgramme(data);
    },

    async update(_actor, programmeId, input) {
      await getActiveProgrammeRow(programmeId);
      const { data, error } = await supabase
        .from("opencell_programmes")
        .update(input)
        .eq("id", programmeId)
        .select(PROGRAMME_COLUMNS)
        .single();
      if (error) throw serviceUnavailable();
      return mapProgramme(data);
    },

    async finish(_actor, programmeId) {
      const { data, error } = await supabase.rpc("finish_opencell_programme", {
        p_programme_id: programmeId,
      });
      if (error) throw serviceUnavailable();
      const result = data?.[0];
      if (!result) throw serviceUnavailable();
      if (result.outcome === "programme_not_found") throw openCellNotFound();
      if (result.outcome === "already_finished") {
        throw new OpenCellServiceError(
          409,
          "PROGRAMME_FINISHED",
          "This Programme has already been finished.",
        );
      }
      if (result.outcome !== "finished") throw serviceUnavailable();

      const programme = await getProgrammeRow(programmeId);
      return {
        programme: mapProgramme(programme),
        evaluations: mapEvaluations(result.evaluations),
      };
    },

    async listSessions(_actor, programmeId) {
      await getProgrammeRow(programmeId);
      const { data, error } = await supabase
        .from("opencell_sessions")
        .select(SESSION_COLUMNS)
        .eq("programme_id", programmeId)
        .order("session_date")
        .order("id");
      if (error) throw serviceUnavailable();

      const sessions = data ?? [];
      const sessionIds = sessions.map((session) => session.id);
      const { data: attendance } = sessionIds.length
        ? await supabase
            .from("opencell_attendance")
            .select("session_id")
            .in("session_id", sessionIds)
        : { data: [] };
      const attendanceBySession = new Map<string, number>();
      for (const record of attendance ?? []) {
        attendanceBySession.set(
          record.session_id,
          (attendanceBySession.get(record.session_id) ?? 0) + 1,
        );
      }
      return sessions.map((session) =>
        mapSession(session, attendanceBySession.get(session.id) ?? 0),
      );
    },

    async createSession(_actor, programmeId, input) {
      await getActiveProgrammeRow(programmeId);
      const { data, error } = await supabase
        .from("opencell_sessions")
        .insert({
          programme_id: programmeId,
          session_date: input.sessionDate,
          title: input.title,
          location: input.location,
          notes: input.notes,
        })
        .select(SESSION_COLUMNS)
        .single();
      if (error) throw serviceUnavailable();
      return mapSession(data);
    },

    async updateSession(_actor, programmeId, sessionId, input) {
      await getActiveProgrammeRow(programmeId);
      const currentSession = await getSessionRow(programmeId, sessionId);
      const isChangingDate =
        input.sessionDate !== undefined && input.sessionDate !== currentSession.session_date;
      if (isChangingDate && (await countSessionAttendance(sessionId)) > 0) {
        throw new OpenCellServiceError(
          409,
          "SESSION_HAS_ATTENDANCE",
          "Remove attendance before changing the Session date.",
        );
      }

      const sessionUpdate = {
        ...(input.sessionDate !== undefined ? { session_date: input.sessionDate } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      };
      const { data, error } = await supabase
        .from("opencell_sessions")
        .update(sessionUpdate)
        .eq("id", sessionId)
        .select(SESSION_COLUMNS)
        .single();
      if (error) throw serviceUnavailable();
      return mapSession(data);
    },

    async cancelSession(_actor, programmeId, sessionId) {
      await getActiveProgrammeRow(programmeId);
      await getSessionRow(programmeId, sessionId);
      if ((await countSessionAttendance(sessionId)) > 0) {
        throw new OpenCellServiceError(
          409,
          "SESSION_HAS_ATTENDANCE",
          "Correct attendance before cancelling this Session.",
        );
      }
      const { data, error } = await supabase
        .from("opencell_sessions")
        .update({ is_cancelled: true })
        .eq("id", sessionId)
        .select(SESSION_COLUMNS)
        .single();
      if (error) throw serviceUnavailable();
      return mapSession(data);
    },

    async listParticipants(_actor, programmeId) {
      return listParticipants(programmeId);
    },

    async enroll(actor, programmeId, visitorId, enrolledOn) {
      const { data, error } = await supabase.rpc("enroll_opencell_visitor", {
        p_programme_id: programmeId,
        p_visitor_id: visitorId,
        p_enrolled_on: enrolledOn || churchDate(),
        p_enrolled_by_profile_id: actor.id,
      });
      if (error?.code === "23505") throw alreadyEnrolled();
      if (error) throw serviceUnavailable();
      const result = data?.[0];
      if (!result) throw serviceUnavailable();
      const outcomeError = enrollmentOutcomeError(result.outcome);
      if (outcomeError) throw outcomeError;

      const participants = await listParticipants(programmeId);
      const participant = participants.find((candidate) => candidate.visitorId === visitorId);
      if (!participant) throw serviceUnavailable();
      return participant;
    },

    async removeEnrollment(_actor, programmeId, visitorId) {
      const { data: outcome, error } = await supabase.rpc("remove_opencell_enrollment", {
        p_programme_id: programmeId,
        p_visitor_id: visitorId,
      });
      if (error) throw serviceUnavailable();
      const outcomeError = enrollmentRemovalError(outcome);
      if (outcomeError) throw outcomeError;
    },

    async listAttendance(_actor, programmeId, sessionId) {
      await getSessionRow(programmeId, sessionId);
      const { data, error } = await supabase
        .from("opencell_attendance")
        .select("visitor_id")
        .eq("session_id", sessionId);
      if (error) throw serviceUnavailable();
      const presentVisitorIds = new Set((data ?? []).map((record) => record.visitor_id));
      const participants = await listParticipants(programmeId);
      return participants.map((participant) => ({
        visitorId: participant.visitorId,
        present: presentVisitorIds.has(participant.visitorId),
      }));
    },

    async addAttendance(_actor, programmeId, sessionId, visitorId) {
      await getActiveProgrammeRow(programmeId);
      const currentSession = await getSessionRow(programmeId, sessionId);
      if (currentSession.is_cancelled) {
        throw new OpenCellServiceError(
          409,
          "NOT_ELIGIBLE",
          "Cancelled Sessions do not accept attendance.",
        );
      }
      const participants = await listParticipants(programmeId);
      const participant = participants.find((candidate) => candidate.visitorId === visitorId);
      if (!participant) {
        throw new OpenCellServiceError(422, "NOT_ELIGIBLE", "Visitor is not enrolled in this Programme.");
      }
      if (!participant.enrolledOn || currentSession.session_date < participant.enrolledOn) {
        throw new OpenCellServiceError(422, "NOT_ELIGIBLE", "Visitor was enrolled after this Session.");
      }

      const { error } = await supabase
        .from("opencell_attendance")
        .insert({ session_id: sessionId, visitor_id: visitorId });
      if (error?.code === "23505") return;
      if (error?.code === "23514") {
        throw new OpenCellServiceError(422, "NOT_ELIGIBLE", "Visitor is not eligible for this Session.");
      }
      if (error) throw serviceUnavailable();
    },

    async removeAttendance(_actor, programmeId, sessionId, visitorId) {
      await getActiveProgrammeRow(programmeId);
      const { data, error } = await supabase
        .from("opencell_attendance")
        .delete()
        .eq("session_id", sessionId)
        .eq("visitor_id", visitorId)
        .select("visitor_id")
        .maybeSingle();
      if (error) throw serviceUnavailable();
      if (!data) {
        throw new OpenCellServiceError(404, "ATTENDANCE_NOT_FOUND", "Attendance was not found.");
      }
    },
  };
}
