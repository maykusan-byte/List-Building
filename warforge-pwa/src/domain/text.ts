const WINDOWS_1252_BYTES: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f
};

const MOJIBAKE_SEQUENCE = /(?:Ã[\u0080-\u00ff]|Â[\u0080-\u00ff]|â[\u0080-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]{2})/g;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function decodeWindows1252AsUtf8(value: string): string | null {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return null;
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }
    const byte = WINDOWS_1252_BYTES[codePoint];
    if (byte === undefined) return null;
    bytes.push(byte);
  }

  try {
    return utf8Decoder.decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

/** Repairs isolated UTF-8 text that was decoded once as Windows-1252. */
export function repairMojibake(value: string): string {
  if (!value.includes('Ã') && !value.includes('Â') && !value.includes('â')) return value;
  return value.replace(MOJIBAKE_SEQUENCE, (encoded) => decodeWindows1252AsUtf8(encoded) ?? encoded);
}

/** Repairs JSON string values in place while keeping the source file unchanged. */
export function repairImportedText(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (typeof entry === 'string') value[index] = repairMojibake(entry);
      else repairImportedText(entry);
    });
    return;
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    Object.entries(record).forEach(([key, entry]) => {
      if (typeof entry === 'string') record[key] = repairMojibake(entry);
      else repairImportedText(entry);
    });
  }
}
