export const SPECIAL_CHAR_GROUPS = [
  {
    name: 'Vowels with háček',
    chars: ['ǎ', 'ě', 'ǐ', 'ǒ', 'ǔ', 'ʉ̌', 'ɛ̌', 'ɔ̌'],
  },
  {
    name: 'Vowels with acute',
    chars: ['á', 'é', 'í', 'ó', 'ú', 'ʉ́', 'ɛ́', 'ɔ́'],
  },
  {
    name: 'Vowels with grave',
    chars: ['à', 'è', 'ì', 'ò', 'ù', 'ʉ̀', 'ɛ̀', 'ɔ̀'],
  },
  {
    name: 'Vowels with circumflex',
    chars: ['â', 'ê', 'î', 'ô', 'û', 'ʉ̂', 'ɛ̂', 'ɔ̂'],
  },
  {
    name: 'Base IPA vowels',
    chars: ['ɛ', 'ʉ', 'ɔ'],
  },
];

/**
 * Hotkey replacement scheme.
 *
 * Tone marks (typed AFTER the base letter):
 *   `  + vowel → háček      (a` → ǎ)
 *   '  + vowel → acute      (a' → á)
 *   \  + vowel → grave      (a\ → à)
 *   ^  + vowel → circumflex (a^ → â)
 *
 * Base IPA letters (mnemonic: 6 = "expanded" letter):
 *   e6 → ɛ
 *   u6 → ʉ
 *   o6 → ɔ
 *
 * For accented IPA letters: combine both:
 *   e6` → ɛ̌
 *   u6' → ʉ́
 *   o6\ → ɔ̀
 */

interface HotkeyRule {
  match: string; // sequence to match in input
  replace: string; // what to replace it with
}

export const HOTKEY_RULES: HotkeyRule[] = [
  // Base IPA (must match before tone-mark combinations)
  { match: 'e6', replace: 'ɛ' },
  { match: 'u6', replace: 'ʉ' },
  { match: 'o6', replace: 'ɔ' },
  { match: 'E6', replace: 'Ɛ' },
  { match: 'U6', replace: 'Ʉ' },
  { match: 'O6', replace: 'Ɔ' },

  // Tone marks on regular vowels
  { match: 'a`', replace: 'ǎ' }, { match: 'A`', replace: 'Ǎ' },
  { match: 'e`', replace: 'ě' }, { match: 'E`', replace: 'Ě' },
  { match: 'i`', replace: 'ǐ' }, { match: 'I`', replace: 'Ǐ' },
  { match: 'o`', replace: 'ǒ' }, { match: 'O`', replace: 'Ǒ' },
  { match: 'u`', replace: 'ǔ' }, { match: 'U`', replace: 'Ǔ' },

  { match: "a'", replace: 'á' }, { match: "A'", replace: 'Á' },
  { match: "e'", replace: 'é' }, { match: "E'", replace: 'É' },
  { match: "i'", replace: 'í' }, { match: "I'", replace: 'Í' },
  { match: "o'", replace: 'ó' }, { match: "O'", replace: 'Ó' },
  { match: "u'", replace: 'ú' }, { match: "U'", replace: 'Ú' },

  { match: 'a\\', replace: 'à' }, { match: 'A\\', replace: 'À' },
  { match: 'e\\', replace: 'è' }, { match: 'E\\', replace: 'È' },
  { match: 'i\\', replace: 'ì' }, { match: 'I\\', replace: 'Ì' },
  { match: 'o\\', replace: 'ò' }, { match: 'O\\', replace: 'Ò' },
  { match: 'u\\', replace: 'ù' }, { match: 'U\\', replace: 'Ù' },

  { match: 'a^', replace: 'â' }, { match: 'A^', replace: 'Â' },
  { match: 'e^', replace: 'ê' }, { match: 'E^', replace: 'Ê' },
  { match: 'i^', replace: 'î' }, { match: 'I^', replace: 'Î' },
  { match: 'o^', replace: 'ô' }, { match: 'O^', replace: 'Ô' },
  { match: 'u^', replace: 'û' }, { match: 'U^', replace: 'Û' },

  // Tone marks on IPA letters (must come after base IPA rules)
  { match: 'ɛ`', replace: 'ɛ̌' }, { match: 'ʉ`', replace: 'ʉ̌' }, { match: 'ɔ`', replace: 'ɔ̌' },
  { match: "ɛ'", replace: 'ɛ́' }, { match: "ʉ'", replace: 'ʉ́' }, { match: "ɔ'", replace: 'ɔ́' },
  { match: 'ɛ\\', replace: 'ɛ̀' }, { match: 'ʉ\\', replace: 'ʉ̀' }, { match: 'ɔ\\', replace: 'ɔ̀' },
  { match: 'ɛ^', replace: 'ɛ̂' }, { match: 'ʉ^', replace: 'ʉ̂' }, { match: 'ɔ^', replace: 'ɔ̂' },
];

/**
 * Apply hotkey replacements to text, returning new text and new cursor position.
 * Only checks the characters immediately before the cursor.
 */
export function applyHotkeys(
  text: string,
  cursorPos: number,
): { text: string; cursorPos: number } {
  for (const rule of HOTKEY_RULES) {
    const startPos = cursorPos - rule.match.length;
    if (startPos < 0) continue;
    const candidate = text.slice(startPos, cursorPos);
    if (candidate === rule.match) {
      const newText = text.slice(0, startPos) + rule.replace + text.slice(cursorPos);
      const newCursorPos = startPos + rule.replace.length;
      return { text: newText, cursorPos: newCursorPos };
    }
  }
  return { text, cursorPos };
}
