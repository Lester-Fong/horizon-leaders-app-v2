export interface NamedRecord {
  id: string
  isActive: boolean
  name: string
}

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase('en')
}

/**
 * The first record whose name matches `name` (trimmed, case-insensitive),
 * ignoring the record being edited. A blank name never matches. Used only for
 * a non-blocking warning: duplicate names remain allowed.
 */
export function findDuplicateName<T extends NamedRecord>(
  name: string,
  records: readonly T[],
  excludeId?: string,
): T | null {
  const normalized = normalizeName(name)
  if (!normalized) return null
  return (
    records.find(
      (record) => record.id !== excludeId && normalizeName(record.name) === normalized,
    ) ?? null
  )
}

export function duplicateNameWarning(recordType: string, match: NamedRecord) {
  return `A ${recordType} named “${match.name}”${match.isActive ? '' : ' (archived)'} already exists. You can still save.`
}
