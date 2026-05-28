// ─── Types ────────────────────────────────────────────────────────────────────

export interface WikiLink {
  /** The note path target, e.g. "Claude Shannon" or "Folder/Note" */
  target: string;
  /** The display text shown to the reader (basename if no alias) */
  displayText: string;
  /** Full raw text including delimiters, e.g. "[[Claude Shannon|CS]]" */
  raw: string;
  /** Start character offset (inclusive) of [[ in the document */
  start: number;
  /** End character offset (exclusive) — just past ]] */
  end: number;
}

/** A [start, end) character range to exclude from scanning/replacement */
export interface Range {
  start: number;
  end: number;
}

/** A pending text replacement to carry a link forward */
export interface CarryForwardEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * The subset of plugin settings consumed by pure link-manager logic.
 * PluginSettings (in settings.ts) structurally satisfies this interface.
 */
export interface Settings {
  skipFrontmatter: boolean;
  skipInlineCode: boolean;
  linkFormat: "wikilink" | "markdown";
  caseSensitive: boolean;
  /**
   * When caseSensitive is false and the found text has different capitalisation
   * than the note name, controls which form is inserted.
   * Only meaningful when caseSensitive is false.
   */
  caseInsensitiveReplacement: "use-note-name" | "use-found-text";
}

export const DEFAULT_SETTINGS: Settings = {
  skipFrontmatter: true,
  skipInlineCode: true,
  linkFormat: "wikilink",
  caseSensitive: true,
  caseInsensitiveReplacement: "use-note-name",
};

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Extract all [[wikilinks]] and ![[embeds]] from a document.
 *
 * Handles:
 *   [[Target]]
 *   [[Target|Display alias]]
 *   [[Folder/Target]]
 *   ![[embed.png]]
 *
 * Heading-qualified links ([[Note#Section]]) are returned but their `target`
 * will contain a `#` — callers that need to skip them should check for that.
 */
export function extractWikiLinks(text: string): WikiLink[] {
  const results: WikiLink[] = [];
  // Match [[ followed by anything except [ or ], then ]]
  // The leading ! (for embeds) is included in raw but not in inner content
  const re = /!?\[\[([^[\]]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const inner = match[1]; // content between [[ and ]]
    const start = match.index;
    const end = start + raw.length;

    // Split on | to separate target from optional display alias
    const pipeIdx = inner.indexOf("|");
    const target =
      pipeIdx >= 0 ? inner.slice(0, pipeIdx).trim() : inner.trim();
    const displayText =
      pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : getBasename(target);

    results.push({ target, displayText, raw, start, end });
  }

  return results;
}

/**
 * Return the basename (last path component) of a link target.
 * e.g. "Folder/Note" → "Note",  "Claude Shannon" → "Claude Shannon"
 */
export function getBasename(target: string): string {
  const slash = target.lastIndexOf("/");
  return slash >= 0 ? target.slice(slash + 1) : target;
}

/**
 * The plain-text string we search for when a given target link is dropped.
 * Uses the basename so that path-qualified links like [[Folder/Note]] search
 * for "Note" rather than "Folder/Note".
 */
export function getSearchTerm(target: string): string {
  return getBasename(target);
}

// ─── Skip Range Computation ───────────────────────────────────────────────────

/**
 * Build the list of character ranges that the plugin must not touch.
 *
 * Always skipped (non-configurable):
 *   • Fenced code blocks (``` and ~~~)
 *   • Existing [[wikilinks]] and ![[embeds]]
 *   • Existing [markdown](hyperlinks)
 *
 * Configurable (on by default):
 *   • YAML frontmatter (skipFrontmatter)
 *   • Inline `code` spans (skipInlineCode)
 */
export function computeSkipRanges(text: string, settings: Settings): Range[] {
  const ranges: Range[] = [];

  // ── Fenced code blocks ────────────────────────────────────────────────────
  // Matches both ``` and ~~~ fences (backreference ensures opening/closing
  // fence markers are the same length).
  for (const re of [
    /^(`{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm,
    /^(~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  // ── YAML frontmatter ──────────────────────────────────────────────────────
  if (settings.skipFrontmatter) {
    const fmRe = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
    const fmMatch = fmRe.exec(text);
    // Only treat as frontmatter when it starts at the very beginning of the file
    if (fmMatch && fmMatch.index === 0) {
      ranges.push({ start: 0, end: fmMatch[0].length });
    }
  }

  // ── Inline code spans ─────────────────────────────────────────────────────
  if (settings.skipInlineCode) {
    // Single-backtick spans; does not cross line boundaries
    const codeRe = /`[^`\n]+`/g;
    let m: RegExpExecArray | null;
    while ((m = codeRe.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  // ── Wikilinks, embeds, and broken/partial wikilink syntax ────────────────
  //
  // We must skip not just complete [[links]] but also partial ones left behind
  // mid-edit — e.g. [[Claude Shannon] (one ] removed) or [[Claude Shannon (both
  // ] removed).  A naive regex requiring ]] would miss these and let the plugin
  // re-wrap the content that the cursor is still inside.
  //
  // Strategy: scan for every [[ (or ![[) occurrence and mark the span from
  // there to the matching ]], or to the next [ / newline if ]] is absent.
  // A secondary pass then catches orphan ]] left behind when [[ was deleted
  // (e.g. the user deleted [[ forward-by-character from the left side).
  {
    let i = 0;
    while (i < text.length - 1) {
      // Detect [[ possibly preceded by ! for embeds
      if (text[i] === "[" && text[i + 1] === "[") {
        const spanStart = i >= 1 && text[i - 1] === "!" ? i - 1 : i;
        // Advance past [[
        let j = i + 2;
        // Find the closing ]] — but stop at any nested [ or newline (wikilinks
        // cannot span lines and cannot be nested).
        let spanEnd = -1;
        while (j < text.length) {
          if (text[j] === "]" && j + 1 < text.length && text[j + 1] === "]") {
            spanEnd = j + 2; // include the closing ]]
            break;
          }
          if (text[j] === "[" || text[j] === "\n") {
            spanEnd = j; // broken link ends here
            break;
          }
          j++;
        }
        if (spanEnd === -1) spanEnd = text.length; // link runs to end of doc
        ranges.push({ start: spanStart, end: spanEnd });
        i = spanEnd; // jump past the entire span
      } else {
        i++;
      }
    }
  }

  // ── Orphan closing brackets: content]] (the [[ was deleted forward) ───────
  // When the user deletes [[ from the left of [[Target]], the remaining
  // text is Target]] — the ]] is not covered by the [[ scan above.
  // Find each ]] not already inside a range and extend a skip region backwards
  // to cover the preceding non-bracket text.
  {
    const re = /\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const closePos = m.index;
      // If already inside an existing range, nothing to do
      if (ranges.some((r) => r.start <= closePos && closePos < r.end)) continue;
      // Walk backwards to find the start of the "orphaned" content
      let start = closePos;
      while (
        start > 0 &&
        text[start - 1] !== "[" &&
        text[start - 1] !== "]" &&
        text[start - 1] !== "\n"
      ) {
        start--;
      }
      ranges.push({ start, end: closePos + 2 });
    }
  }

  // ── Existing markdown hyperlinks ──────────────────────────────────────────
  {
    // Matches [display text](url-or-path); does not handle nested brackets
    const re = /\[([^[\]]*)\]\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  return ranges;
}

/**
 * Return true if the span [pos, pos+length) overlaps with any range in the list.
 */
export function isInSkipRange(
  pos: number,
  length: number,
  ranges: Range[]
): boolean {
  const end = pos + length;
  for (const r of ranges) {
    if (pos < r.end && end > r.start) return true;
  }
  return false;
}

// ─── Occurrence Finding ───────────────────────────────────────────────────────

/**
 * Find all plain-text occurrences of `searchTerm` in `text`, skipping any
 * position that overlaps a range in `skipRanges`.
 *
 * Returns start positions in ascending order.
 */
export function findPlainTextOccurrences(
  text: string,
  searchTerm: string,
  skipRanges: Range[],
  caseSensitive: boolean
): number[] {
  if (!searchTerm) return [];

  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? searchTerm : searchTerm.toLowerCase();
  const positions: number[] = [];

  let searchFrom = 0;
  while (searchFrom <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, searchFrom);
    if (idx === -1) break;
    if (!isInSkipRange(idx, needle.length, skipRanges)) {
      positions.push(idx);
    }
    searchFrom = idx + 1; // advance by 1 to allow overlapping matches (unlikely but safe)
  }

  return positions;
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Compare two document snapshots and return the link targets that went from
 * at least one occurrence to zero occurrences.
 *
 * Heading-qualified links ([[Note#Section]]) are always ignored — their
 * "plain text form" is ambiguous and they are out of scope for v1.
 */
export function diffDroppedTargets(
  beforeText: string,
  afterText: string
): string[] {
  const countByTarget = (text: string): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const link of extractWikiLinks(text)) {
      if (link.target.includes("#")) continue; // skip heading links
      counts.set(link.target, (counts.get(link.target) ?? 0) + 1);
    }
    return counts;
  };

  const before = countByTarget(beforeText);
  const after = countByTarget(afterText);

  const dropped: string[] = [];
  for (const [target, count] of before) {
    if (count > 0 && (after.get(target) ?? 0) === 0) {
      dropped.push(target);
    }
  }
  return dropped;
}

// ─── Link Formatting ──────────────────────────────────────────────────────────

/**
 * Build the link string to insert, respecting the user's linkFormat and
 * caseInsensitiveReplacement settings.
 *
 * @param target       The note path (e.g. "Cognitive load" or "Folder/Note")
 * @param settings     Plugin settings
 * @param matchedText  The actual text found in the document (may differ in case
 *                     from the note name when caseSensitive is false)
 *
 * Examples (wikilink format):
 *   target="Cognitive load", matchedText="Cognitive load"  → [[Cognitive load]]
 *   target="Cognitive load", matchedText="cognitive load",
 *     caseInsensitiveReplacement="use-note-name"           → [[Cognitive load]]
 *   target="Cognitive load", matchedText="cognitive load",
 *     caseInsensitiveReplacement="use-found-text"          → [[Cognitive load|cognitive load]]
 */
export function formatLink(
  target: string,
  settings: Settings,
  matchedText?: string
): string {
  const basename = getBasename(target);

  // Determine the display text: use found casing only when the user opted in,
  // case-insensitive mode is active, and the casing actually differs.
  const useFoundText =
    !settings.caseSensitive &&
    settings.caseInsensitiveReplacement === "use-found-text" &&
    matchedText !== undefined &&
    matchedText !== basename;

  if (settings.linkFormat === "wikilink") {
    return useFoundText ? `[[${target}|${matchedText}]]` : `[[${target}]]`;
  }

  // Markdown format
  const displayText = useFoundText ? matchedText : basename;
  return `[${displayText}](${target})`;
}

// ─── Edit Generation ──────────────────────────────────────────────────────────

/**
 * For each dropped target, find the earliest eligible plain-text occurrence
 * in `afterText` and generate a carry-forward replacement edit.
 *
 * Rules:
 *  - Skip any occurrence that is in a skip range (code fence, frontmatter, etc.)
 *  - Skip any occurrence that is already a link (handled by skip ranges)
 *  - If no eligible occurrence exists for a target, produce no edit for it
 *  - If multiple targets are dropped in one operation, each is handled
 *    independently; already-claimed positions are not reused
 *
 * @param afterText    Document text AFTER the user's deletion
 * @param droppedTargets  Link targets with zero remaining [[links]] in afterText
 * @param settings     Plugin settings
 */
export function computeCarryForwardEdits(
  afterText: string,
  droppedTargets: string[],
  settings: Settings
): CarryForwardEdit[] {
  const skipRanges = computeSkipRanges(afterText, settings);
  const edits: CarryForwardEdit[] = [];
  // Track character ranges already claimed by an earlier edit in this batch
  const usedRanges: Range[] = [];

  for (const target of droppedTargets) {
    const searchTerm = getSearchTerm(target);
    const allSkip = [...skipRanges, ...usedRanges];
    const occurrences = findPlainTextOccurrences(
      afterText,
      searchTerm,
      allSkip,
      settings.caseSensitive
    );

    if (occurrences.length === 0) continue;

    const pos = occurrences[0]; // earliest eligible position
    // Capture the exact text at the match site — may differ in case from the
    // note name when caseSensitive is false.
    const matchedText = afterText.slice(pos, pos + searchTerm.length);
    const linkText = formatLink(target, settings, matchedText);

    edits.push({ from: pos, to: pos + searchTerm.length, insert: linkText });
    // Reserve the original text range so subsequent targets don't overlap
    usedRanges.push({ start: pos, end: pos + searchTerm.length });
  }

  return edits;
}
