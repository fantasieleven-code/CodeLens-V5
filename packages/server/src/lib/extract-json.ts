/**
 * Robust JSON extraction from LLM output.
 * Ported from HireFlow's debate.js extractJSON().
 *
 * Three-pass strategy:
 *   1. Markdown code block extraction
 *   2. Balanced brace matching (largest last)
 *   3. Aggressive cleanup (control chars, trailing commas)
 */

export interface ExtractResult<T = unknown> {
  success: boolean;
  data: T | null;
  raw?: string;
}

export function extractJSON<T = unknown>(text: string): ExtractResult<T> {
  // Pass 1: Markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return { success: true, data: JSON.parse(codeBlockMatch[1].trim()) };
    } catch {
      // fallthrough
    }
  }

  // Pass 2: Balanced brace matching
  let depth = 0;
  let start = -1;
  const candidates: string[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1));
      }
    }
  }

  // Try largest candidate first (most likely to be the complete response)
  for (let j = candidates.length - 1; j >= 0; j--) {
    try {
      return { success: true, data: JSON.parse(candidates[j]) };
    } catch {
      // continue
    }
  }

  // Pass 3: Aggressive cleanup
  try {
    const cleaned = text.replace(/[\x00-\x1F\x7F]/g, ' ');
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s !== -1 && e > s) {
      const jsonStr = cleaned
        .slice(s, e + 1)
        .replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas
      return { success: true, data: JSON.parse(jsonStr) };
    }
  } catch {
    // fallthrough
  }

  return { success: false, data: null, raw: text.slice(0, 500) };
}
