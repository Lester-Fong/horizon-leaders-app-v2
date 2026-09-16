function safeFilenamePart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'member'
}

export function memberQrFilename(firstName: string, lastName: string) {
  return `${safeFilenamePart(`${firstName}-${lastName}`)}-qr.png`
}
