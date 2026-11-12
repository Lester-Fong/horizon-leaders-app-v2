// Hand-written refinements layered on top of the generated `database.types.ts`.
// Regenerate that file with `npm run supabase:types`; never edit it by hand.
//
// The Supabase type generator types every SQL function argument as non-null,
// and an argument with `default null` only becomes optional (`?: string`), not
// nullable. The RPC arguments below legitimately accept SQL NULL, but cannot be
// given SQL defaults: either a later parameter has no default, or an implicit
// default would weaken an optimistic-concurrency check. So their nullability is
// declared here instead.
import type { Database as GeneratedDatabase } from "./database.types.js";

type GeneratedFunctions = GeneratedDatabase["public"]["Functions"];

type WithNullableArgs<
  FunctionName extends keyof GeneratedFunctions,
  NullableArgName extends keyof GeneratedFunctions[FunctionName]["Args"],
> = Omit<GeneratedFunctions[FunctionName], "Args"> & {
  Args: Omit<GeneratedFunctions[FunctionName]["Args"], NullableArgName> & {
    [ArgName in NullableArgName]: GeneratedFunctions[FunctionName]["Args"][ArgName] | null;
  };
};

type NullableArgFunctions = {
  convert_visitor_to_member: WithNullableArgs<
    "convert_visitor_to_member",
    "p_expected_life_group_id" | "p_life_group_id"
  >;
  create_follow_up_if_absent: WithNullableArgs<
    "create_follow_up_if_absent",
    "p_member_id" | "p_visitor_id"
  >;
  dashboard_member_demographics: WithNullableArgs<"dashboard_member_demographics", "p_life_group_id">;
  dashboard_sunday_attendance: WithNullableArgs<"dashboard_sunday_attendance", "p_life_group_id">;
  set_visitor_life_group: WithNullableArgs<
    "set_visitor_life_group",
    "p_expected_life_group_id" | "p_life_group_id"
  >;
};

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<GeneratedFunctions, keyof NullableArgFunctions> & NullableArgFunctions;
  };
};
