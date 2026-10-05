import type { Member, MemberSummary } from "./types.js";

export function toMemberSummary(member: Member): MemberSummary {
  return {
    address: member.address,
    birthDate: member.birthDate,
    createdAt: member.createdAt,
    email: member.email,
    firstName: member.firstName,
    gender: member.gender,
    id: member.id,
    isActive: member.isActive,
    lastName: member.lastName,
    lifeGroup: member.lifeGroup,
    phone: member.phone,
    updatedAt: member.updatedAt,
  };
}
