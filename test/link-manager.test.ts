/**
 * link-manager.test.ts
 *
 * Unit tests for the pure link-management logic.
 * No Obsidian API — runs entirely with Vitest.
 */

import { describe, it, expect } from "vitest";
import {
  extractWikiLinks,
  diffDroppedTargets,
  computeCarryForwardEdits,
  findPlainTextOccurrences,
  computeSkipRanges,
  formatLink,
  getBasename,
  getSearchTerm,
  DEFAULT_SETTINGS,
} from "../src/link-manager";
import type { Settings } from "../src/link-manager";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Apply a set of non-overlapping edits to `text`, working back-to-front */
function applyEdits(
  text: string,
  edits: Array<{ from: number; to: number; insert: string }>
): string {
  const sorted = [...edits].sort((a, b) => b.from - a.from);
  let result = text;
  for (const edit of sorted) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  }
  return result;
}

const S: Settings = { ...DEFAULT_SETTINGS };

// ─── extractWikiLinks ─────────────────────────────────────────────────────────

describe("extractWikiLinks", () => {
  it("parses a simple wikilink", () => {
    const links = extractWikiLinks("See [[Claude Shannon]] for details.");
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Claude Shannon");
    expect(links[0].displayText).toBe("Claude Shannon");
    expect(links[0].raw).toBe("[[Claude Shannon]]");
  });

  it("parses an aliased wikilink", () => {
    const links = extractWikiLinks("See [[Claude Shannon|CS]] for details.");
    expect(links[0].target).toBe("Claude Shannon");
    expect(links[0].displayText).toBe("CS");
  });

  it("parses a path-qualified wikilink", () => {
    const links = extractWikiLinks("See [[People/Claude Shannon]] here.");
    expect(links[0].target).toBe("People/Claude Shannon");
    expect(links[0].displayText).toBe("Claude Shannon");
  });

  it("parses an embed (![[...]])", () => {
    const links = extractWikiLinks("![[image.png]]");
    expect(links[0].target).toBe("image.png");
  });

  it("records correct start/end offsets", () => {
    const text = "foo [[Bar]] baz";
    const links = extractWikiLinks(text);
    expect(links[0].start).toBe(4);
    expect(links[0].end).toBe(11);
    expect(text.slice(links[0].start, links[0].end)).toBe("[[Bar]]");
  });

  it("returns empty array when no links present", () => {
    expect(extractWikiLinks("just plain text")).toHaveLength(0);
  });
});

// ─── getBasename / getSearchTerm ─────────────────────────────────────────────

describe("getBasename", () => {
  it("returns full name when no path separator", () => {
    expect(getBasename("Claude Shannon")).toBe("Claude Shannon");
  });
  it("returns the last component of a path", () => {
    expect(getBasename("People/Researchers/Claude Shannon")).toBe(
      "Claude Shannon"
    );
  });
});

describe("getSearchTerm", () => {
  it("delegates to getBasename", () => {
    expect(getSearchTerm("Folder/Note")).toBe("Note");
    expect(getSearchTerm("Simple")).toBe("Simple");
  });
});

// ─── diffDroppedTargets ───────────────────────────────────────────────────────

describe("diffDroppedTargets", () => {
  it("detects a target that went from 1 → 0 occurrences", () => {
    const before = "[[Claude Shannon]] was a mathematician.";
    const after = "Claude Shannon was a mathematician.";
    expect(diffDroppedTargets(before, after)).toContain("Claude Shannon");
  });

  it("does not report a target that still has a remaining link", () => {
    const before =
      "[[Claude Shannon]] and [[Claude Shannon]] were mentioned.";
    const after = "Claude Shannon and [[Claude Shannon]] were mentioned.";
    expect(diffDroppedTargets(before, after)).toHaveLength(0);
  });

  it("ignores heading-qualified links", () => {
    const before = "[[Note#Section]] is interesting.";
    const after = "Note#Section is interesting.";
    expect(diffDroppedTargets(before, after)).toHaveLength(0);
  });

  it("handles simultaneous deletion of multiple distinct targets", () => {
    const before =
      "[[Claude Shannon]] and [[Shannon–Weaver model]] are related.";
    const after = "Claude Shannon and Shannon–Weaver model are related.";
    const dropped = diffDroppedTargets(before, after);
    expect(dropped).toContain("Claude Shannon");
    expect(dropped).toContain("Shannon–Weaver model");
  });

  it("returns empty array when no links were deleted", () => {
    const doc =
      "[[Claude Shannon]] studied information theory.";
    expect(diffDroppedTargets(doc, doc)).toHaveLength(0);
  });
});

// ─── computeSkipRanges ────────────────────────────────────────────────────────

describe("computeSkipRanges — fenced code blocks", () => {
  it("skips a backtick fenced code block", () => {
    const text = "before\n```\nClaude Shannon\n```\nafter";
    const ranges = computeSkipRanges(text, S);
    const pos = text.indexOf("Claude Shannon");
    const inSkip = ranges.some((r) => r.start <= pos && pos < r.end);
    expect(inSkip).toBe(true);
  });

  it("skips a tilde fenced code block", () => {
    const text = "~~~\nClaude Shannon\n~~~";
    const ranges = computeSkipRanges(text, S);
    const pos = text.indexOf("Claude Shannon");
    const inSkip = ranges.some((r) => r.start <= pos && pos < r.end);
    expect(inSkip).toBe(true);
  });
});

describe("computeSkipRanges — frontmatter", () => {
  it("skips YAML frontmatter by default", () => {
    const text = "---\ntitle: Claude Shannon\n---\nBody text here.";
    const ranges = computeSkipRanges(text, S);
    const pos = text.indexOf("Claude Shannon");
    const inSkip = ranges.some((r) => r.start <= pos && pos < r.end);
    expect(inSkip).toBe(true);
  });

  it("does not skip frontmatter when skipFrontmatter is false", () => {
    const settings: Settings = { ...S, skipFrontmatter: false };
    const text = "---\ntitle: Claude Shannon\n---\nBody text here.";
    const ranges = computeSkipRanges(text, settings);
    const pos = text.indexOf("Claude Shannon");
    const inSkip = ranges.some(
      (r) => r.start <= pos && pos < r.end && r.start === 0
    );
    expect(inSkip).toBe(false);
  });

  it("ignores --- that is not at position 0", () => {
    const text = "Some text.\n---\ntitle: Claude Shannon\n---\n";
    const ranges = computeSkipRanges(text, S);
    const pos = text.indexOf("Claude Shannon");
    // There should be no frontmatter range because the --- is not at position 0
    const fmRange = ranges.find((r) => r.start === 0);
    expect(fmRange).toBeUndefined();
  });
});

describe("computeSkipRanges — inline code", () => {
  it("skips inline code when skipInlineCode is true", () => {
    const settings: Settings = { ...S, skipInlineCode: true };
    const text = "See `Claude Shannon` for details.";
    const ranges = computeSkipRanges(text, settings);
    const pos = text.indexOf("Claude Shannon");
    const inSkip = ranges.some((r) => r.start <= pos && pos < r.end);
    expect(inSkip).toBe(true);
  });

  it("does not skip inline code when skipInlineCode is false", () => {
    const settings: Settings = { ...S, skipInlineCode: false };
    const text = "See `Claude Shannon` for details.";
    const ranges = computeSkipRanges(text, settings);
    const pos = text.indexOf("Claude Shannon");
    // The code span range should not be present
    const codeSpanRange = ranges.find(
      (r) => r.start <= pos && pos < r.end && r.start === text.indexOf("`")
    );
    expect(codeSpanRange).toBeUndefined();
  });
});

describe("computeSkipRanges — existing links", () => {
  it("skips text inside an existing wikilink", () => {
    const text = "[[Claude Shannon - Early Life]] is about Claude Shannon.";
    const ranges = computeSkipRanges(text, S);
    // Position 2 is inside the wikilink
    const inSkip = ranges.some((r) => r.start <= 2 && 2 < r.end);
    expect(inSkip).toBe(true);
  });

  it("skips text inside a markdown hyperlink", () => {
    const text = "[Claude Shannon](http://example.com) was a mathematician.";
    const ranges = computeSkipRanges(text, S);
    const pos = text.indexOf("Claude Shannon");
    const inSkip = ranges.some((r) => r.start <= pos && pos < r.end);
    expect(inSkip).toBe(true);
  });
});

describe("computeSkipRanges — raw URLs (issue #1)", () => {
  it("skips a term that appears inside a bare https URL", () => {
    const text =
      "Repo: https://github.com/mapipolo/obsidian-carry-dropped-links-forward";
    const ranges = computeSkipRanges(text, S);
    const pos = text.indexOf("github");
    const inSkip = ranges.some((r) => r.start <= pos && pos < r.end);
    expect(inSkip).toBe(true);
  });

  it("skips a term inside a www-style URL", () => {
    const text = "See www.example.com/Claude%20Shannon for more.";
    const ranges = computeSkipRanges(text, S);
    const pos = text.indexOf("Claude");
    const inSkip = ranges.some((r) => r.start <= pos && pos < r.end);
    expect(inSkip).toBe(true);
  });
});

// ─── findPlainTextOccurrences ─────────────────────────────────────────────────

describe("findPlainTextOccurrences", () => {
  it("finds all occurrences of a simple term", () => {
    const text =
      "Claude Shannon studied information theory. Claude Shannon was influential.";
    const positions = findPlainTextOccurrences(text, "Claude Shannon", [], true);
    expect(positions).toHaveLength(2);
  });

  it("skips occurrences inside skip ranges", () => {
    const text = "```\nClaude Shannon\n```\nClaude Shannon";
    const codeStart = text.indexOf("```");
    const skipRanges = [{ start: codeStart, end: text.indexOf("\nClaude Shannon", codeStart + 3) + 15 }];
    const positions = findPlainTextOccurrences(text, "Claude Shannon", skipRanges, true);
    expect(positions).toHaveLength(1);
    // The only found position should be the one after the code block
    expect(positions[0]).toBeGreaterThan(20);
  });

  it("is case-sensitive by default", () => {
    const text = "claude shannon Claude Shannon CLAUDE SHANNON";
    const positions = findPlainTextOccurrences(text, "Claude Shannon", [], true);
    expect(positions).toHaveLength(1);
    expect(text.slice(positions[0], positions[0] + 14)).toBe("Claude Shannon");
  });

  it("is case-insensitive when caseSensitive is false", () => {
    const text = "claude shannon Claude Shannon CLAUDE SHANNON";
    const positions = findPlainTextOccurrences(text, "Claude Shannon", [], false);
    expect(positions).toHaveLength(3);
  });

  it("matches a term immediately followed by an apostrophe (boundary on punctuation)", () => {
    const text = "Claude Shannon's work was important.";
    const positions = findPlainTextOccurrences(text, "Claude Shannon", [], true);
    expect(positions).toHaveLength(1);
  });

  it("does not match a term embedded inside a larger word (word-boundary enforcement)", () => {
    const text = "The Category page lists every Cat.";
    const positions = findPlainTextOccurrences(text, "Cat", [], true);
    // "Cat" inside "Category" is skipped; only the standalone "Cat" matches.
    expect(positions).toHaveLength(1);
    expect(text.slice(positions[0], positions[0] + 3)).toBe("Cat");
    expect(positions[0]).toBe(text.lastIndexOf("Cat"));
  });

  it("returns empty array when term not found", () => {
    expect(findPlainTextOccurrences("unrelated text", "Claude Shannon", [], true)).toHaveLength(0);
  });
});

// ─── computeCarryForwardEdits — core scenarios ────────────────────────────────

describe("computeCarryForwardEdits — basic carry-forward", () => {
  it("links the earliest remaining plain-text occurrence after deletion", () => {
    // "after" doc: the link has been deleted, plain text remains
    const afterDoc =
      "Claude Shannon studied information theory. " +
      "Claude Shannon was very influential.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("[[Claude Shannon]]");
    // Should link the FIRST occurrence
    expect(result.indexOf("[[Claude Shannon]]")).toBe(0);
  });

  it("carries backward — links an occurrence that is earlier than the deletion point", () => {
    // The first occurrence is at position 0, which is before where a link might
    // have been deleted (e.g., the link was in a later sentence)
    const afterDoc =
      "Claude Shannon was born in 1916. " +
      "The work of Claude Shannon on information theory was groundbreaking.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    // The earliest occurrence is at the start — link it regardless of where the deletion was
    expect(edits[0].from).toBe(0);
  });
});

describe("computeCarryForwardEdits — no action needed", () => {
  it("produces no edits when there are no plain-text occurrences", () => {
    const afterDoc = "Information theory is fascinating.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(0);
  });

  it("produces no edits when the only occurrences are already links", () => {
    // If remaining occurrences are inside [[...]], they'll be in skip ranges
    const afterDoc =
      "See [[Claude Shannon]] and [[Claude Shannon]] for details.";
    // If diffDroppedTargets says "Claude Shannon" was dropped, but it still
    // appears as [[Claude Shannon]] in the doc, those are in skip ranges.
    // findPlainTextOccurrences won't find them.
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(0);
  });
});

describe("computeCarryForwardEdits — skip zones", () => {
  it("skips occurrence in a code fence and uses the next one", () => {
    const afterDoc =
      "```\nClaude Shannon\n```\n\nClaude Shannon was a mathematician.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    // The linked occurrence should be outside the code fence
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("[[Claude Shannon]] was a mathematician.");
  });

  it("skips occurrence in frontmatter and uses the next one", () => {
    const afterDoc =
      "---\ntitle: Claude Shannon\n---\n\nClaude Shannon studied entropy.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    // Frontmatter occurrence should be untouched; body occurrence should be linked
    expect(result).toContain("title: Claude Shannon");
    expect(result).toContain("[[Claude Shannon]] studied entropy.");
  });

  it("skips occurrence in inline code when skipInlineCode is true", () => {
    const settings: Settings = { ...S, skipInlineCode: true };
    const afterDoc =
      "The symbol `Claude Shannon` represents... Claude Shannon himself.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], settings);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("`Claude Shannon`");          // inline code unchanged
    expect(result).toContain("[[Claude Shannon]] himself"); // body occurrence linked
  });

  it("links occurrence in inline code when skipInlineCode is false", () => {
    const settings: Settings = { ...S, skipInlineCode: false };
    const afterDoc = "See `Claude Shannon` in the docs.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], settings);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("[[Claude Shannon]]");
  });

  it("skips occurrence inside an existing wikilink", () => {
    // [[Claude Shannon - Early Life]] contains "Claude Shannon" but must not be touched
    const afterDoc =
      "[[Claude Shannon - Early Life]] discusses Claude Shannon's contributions.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    // The existing wikilink must be unchanged
    expect(result).toContain("[[Claude Shannon - Early Life]]");
    // The plain-text occurrence should be linked
    expect(result).toContain("[[Claude Shannon]]'s contributions");
  });

  it("skips occurrence inside a markdown hyperlink", () => {
    const afterDoc =
      "[Claude Shannon](http://example.com) was a mathematician. " +
      "Claude Shannon developed information theory.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    // Markdown link must be untouched
    expect(result).toContain("[Claude Shannon](http://example.com)");
    // The plain-text occurrence should be linked
    expect(result).toContain("[[Claude Shannon]] developed information theory.");
  });
});

// ─── computeCarryForwardEdits — aliased links ─────────────────────────────────

describe("computeCarryForwardEdits — aliased links", () => {
  it("searches for the target name when an aliased link is dropped", () => {
    // Deleted link was [[Claude Shannon|CS]]; plain text "Claude Shannon" remains
    const afterDoc =
      "Claude Shannon did groundbreaking work.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("[[Claude Shannon]]");
  });

  it("produces no edits when only the alias display text appears (not the target name)", () => {
    // Dropped link was [[Claude Shannon|CS]], but the doc only contains "CS"
    const afterDoc = "CS did groundbreaking work.";
    // "Claude Shannon" doesn't appear — no match
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(0);
  });
});

// ─── computeCarryForwardEdits — path-qualified links ─────────────────────────

describe("computeCarryForwardEdits — path-qualified links", () => {
  it("searches for basename and inserts full path in wikilink", () => {
    const afterDoc = "Note is discussed here. Note has more detail.";
    const edits = computeCarryForwardEdits(afterDoc, ["Folder/Note"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    // Should insert the full path wikilink
    expect(result).toContain("[[Folder/Note]]");
    // Should use the earliest occurrence (position 0)
    expect(result.indexOf("[[Folder/Note]]")).toBe(0);
  });
});

// ─── computeCarryForwardEdits — multiple links scenario ──────────────────────

describe("computeCarryForwardEdits — multiple links", () => {
  it("carries forward only one link when multiple copies of the same target are dropped at once", () => {
    // Both [[Claude Shannon]] links are gone; one plain-text occurrence remains
    const afterDoc = "Claude Shannon was important.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    // We only drop one link (per spec: earliest remaining occurrence, singular)
    expect(edits).toHaveLength(1);
  });

  it("carries forward two different links dropped in one edit", () => {
    // Both [[Claude Shannon]] and [[Shannon–Weaver model]] were deleted in one cut
    const afterDoc =
      "Claude Shannon developed the Shannon–Weaver model in the 20th century.";
    const edits = computeCarryForwardEdits(
      afterDoc,
      ["Claude Shannon", "Shannon–Weaver model"],
      S
    );
    expect(edits).toHaveLength(2);
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("[[Claude Shannon]]");
    expect(result).toContain("[[Shannon–Weaver model]]");
  });

  it("handles dropping a link when another link to the same target still exists", () => {
    // Before: two [[Claude Shannon]] links. One is deleted. One remains.
    // diffDroppedTargets should return nothing, so no edits expected.
    // This tests the full pipeline integration.
    const before =
      "[[Claude Shannon]] and [[Claude Shannon]] were mentioned.";
    const after = "Claude Shannon and [[Claude Shannon]] were mentioned.";
    const dropped = diffDroppedTargets(before, after);
    expect(dropped).toHaveLength(0);
    const edits = computeCarryForwardEdits(after, dropped, S);
    expect(edits).toHaveLength(0);
  });
});

// ─── computeCarryForwardEdits — format settings ───────────────────────────────

describe("computeCarryForwardEdits — link format", () => {
  it("inserts a wikilink by default", () => {
    const afterDoc = "Claude Shannon was a mathematician.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], {
      ...S,
      linkFormat: "wikilink",
    });
    expect(edits[0].insert).toBe("[[Claude Shannon]]");
  });

  it("inserts a markdown link when linkFormat is 'markdown'", () => {
    const afterDoc = "Claude Shannon was a mathematician.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], {
      ...S,
      linkFormat: "markdown",
    });
    expect(edits[0].insert).toBe("[Claude Shannon](Claude Shannon)");
  });

  it("uses basename in markdown link display text for path-qualified links", () => {
    const afterDoc = "Note has more detail.";
    const edits = computeCarryForwardEdits(afterDoc, ["Folder/Note"], {
      ...S,
      linkFormat: "markdown",
    });
    expect(edits[0].insert).toBe("[Note](Folder/Note)");
  });
});

// ─── computeCarryForwardEdits — case sensitivity ──────────────────────────────

describe("computeCarryForwardEdits — case sensitivity", () => {
  it("does not match lowercase text when caseSensitive is true", () => {
    const afterDoc = "claude shannon was a mathematician.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], {
      ...S,
      caseSensitive: true,
    });
    expect(edits).toHaveLength(0);
  });

  it("matches lowercase text when caseSensitive is false", () => {
    const afterDoc = "claude shannon was a mathematician.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], {
      ...S,
      caseSensitive: false,
    });
    expect(edits).toHaveLength(1);
    // The inserted link uses the original target (proper capitalisation)
    expect(edits[0].insert).toBe("[[Claude Shannon]]");
  });
});

// ─── formatLink — caseInsensitiveReplacement ──────────────────────────────────

describe("formatLink — caseInsensitiveReplacement", () => {
  it("uses note name when casing matches (no alias needed)", () => {
    const settings: Settings = { ...S, caseSensitive: false, caseInsensitiveReplacement: "use-found-text" };
    expect(formatLink("Cognitive load", settings, "Cognitive load")).toBe("[[Cognitive load]]");
  });

  it("use-note-name: ignores matched text casing, inserts plain [[target]]", () => {
    const settings: Settings = { ...S, caseSensitive: false, caseInsensitiveReplacement: "use-note-name" };
    expect(formatLink("Cognitive load", settings, "cognitive load")).toBe("[[Cognitive load]]");
  });

  it("use-found-text: produces aliased wikilink when casing differs", () => {
    const settings: Settings = { ...S, caseSensitive: false, caseInsensitiveReplacement: "use-found-text" };
    expect(formatLink("Cognitive load", settings, "cognitive load")).toBe("[[Cognitive load|cognitive load]]");
  });

  it("use-found-text: markdown format uses matched text as display", () => {
    const settings: Settings = { ...S, caseSensitive: false, caseInsensitiveReplacement: "use-found-text", linkFormat: "markdown" };
    expect(formatLink("Cognitive load", settings, "cognitive load")).toBe("[cognitive load](Cognitive load)");
  });

  it("use-found-text: path-qualified link produces correct alias wikilink", () => {
    const settings: Settings = { ...S, caseSensitive: false, caseInsensitiveReplacement: "use-found-text" };
    // target basename is "Cognitive load"; found as "cognitive load"
    expect(formatLink("Concepts/Cognitive load", settings, "cognitive load")).toBe("[[Concepts/Cognitive load|cognitive load]]");
  });
});

describe("computeCarryForwardEdits — caseInsensitiveReplacement end-to-end", () => {
  it("use-note-name: replaces found text with plain [[target]]", () => {
    // Note: "Cognitive load". Found: "cognitive load" (different case).
    const afterDoc = "with that increase in cognitive load comes an attendant...";
    const edits = computeCarryForwardEdits(afterDoc, ["Cognitive load"], {
      ...S,
      caseSensitive: false,
      caseInsensitiveReplacement: "use-note-name",
    });
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("[[Cognitive load]]");
    expect(result).not.toContain("|");
  });

  it("use-found-text: replaces found text with aliased [[target|found]]", () => {
    const afterDoc = "with that increase in cognitive load comes an attendant...";
    const edits = computeCarryForwardEdits(afterDoc, ["Cognitive load"], {
      ...S,
      caseSensitive: false,
      caseInsensitiveReplacement: "use-found-text",
    });
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("[[Cognitive load|cognitive load]]");
  });
});

// ─── computeCarryForwardEdits — exact substring matching ─────────────────────

describe("computeCarryForwardEdits — substring matching", () => {
  it("matches 'Claude Shannon' within 'Claude Shannon's contributions'", () => {
    const afterDoc = "Claude Shannon's contributions were enormous.";
    const edits = computeCarryForwardEdits(afterDoc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    expect(result).toContain("[[Claude Shannon]]'s contributions");
  });
});

// ─── Bug fixes: partial wikilinks (Bug 2) ────────────────────────────────────
//
// When the user backspaces into a [[link]] from the right, the text passes
// through broken states like [[Claude Shannon] and [[Claude Shannon.
// The plugin must not treat these as "dropped links that need carry-forward"
// by accidentally finding the term inside the broken syntax.

describe("partial wikilink skip ranges — backspace from right", () => {
  it("skips term inside [[Term] — one closing bracket removed", () => {
    // Simulates: user has [[Claude Shannon]] and deletes the last ]
    const doc = "[[Claude Shannon] and more text.";
    const edits = computeCarryForwardEdits(doc, ["Claude Shannon"], S);
    // "Claude Shannon" is inside broken [[Claude Shannon] — must not be linked
    expect(edits).toHaveLength(0);
  });

  it("skips term inside [[Term — both closing brackets removed", () => {
    const doc = "[[Claude Shannon and more text.";
    const edits = computeCarryForwardEdits(doc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(0);
  });

  it("still links a plain-text occurrence on another line when partial link is present", () => {
    // Broken link on line 1; plain text on line 2 — only the plain text should be linked.
    // Partial wikilinks stop at newlines (they can't span lines), so the scanner
    // only marks line 1 as off-limits.
    const doc =
      "[[Claude Shannon\n" +
      "Claude Shannon developed information theory.";
    const edits = computeCarryForwardEdits(doc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(doc, edits);
    // The broken [[ at the start must be untouched
    expect(result.startsWith("[[Claude Shannon\n")).toBe(true);
    // The plain-text occurrence should be linked
    expect(result).toContain("[[Claude Shannon]] developed information theory.");
  });
});

describe("partial wikilink skip ranges — delete from left (orphan ]])", () => {
  it("skips term before orphan ]] — one opening bracket removed", () => {
    // Simulates: user has [[Claude Shannon]] and deletes the first [
    const doc = "[Claude Shannon]] and more text.";
    const edits = computeCarryForwardEdits(doc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(0);
  });

  it("skips term before orphan ]] — both opening brackets removed", () => {
    const doc = "Claude Shannon]] and more text.";
    const edits = computeCarryForwardEdits(doc, ["Claude Shannon"], S);
    expect(edits).toHaveLength(0);
  });
});

describe("computeSkipRanges — partial wikilink ranges", () => {
  it("covers [[Term] in a skip range", () => {
    const text = "[[Claude Shannon] rest of text";
    const ranges = computeSkipRanges(text, S);
    const termPos = text.indexOf("Claude Shannon");
    const covered = ranges.some((r) => r.start <= termPos && termPos < r.end);
    expect(covered).toBe(true);
  });

  it("covers [[Term (no brackets) in a skip range", () => {
    const text = "[[Claude Shannon rest of text";
    const ranges = computeSkipRanges(text, S);
    const termPos = text.indexOf("Claude Shannon");
    const covered = ranges.some((r) => r.start <= termPos && termPos < r.end);
    expect(covered).toBe(true);
  });

  it("covers Term]] (orphan close) in a skip range", () => {
    const text = "Claude Shannon]] rest of text";
    const ranges = computeSkipRanges(text, S);
    const termPos = text.indexOf("Claude Shannon");
    const covered = ranges.some((r) => r.start <= termPos && termPos < r.end);
    expect(covered).toBe(true);
  });

  it("still correctly handles a complete [[Term]] in a skip range", () => {
    const text = "[[Claude Shannon]] rest of text";
    const ranges = computeSkipRanges(text, S);
    const termPos = text.indexOf("Claude Shannon");
    const covered = ranges.some((r) => r.start <= termPos && termPos < r.end);
    expect(covered).toBe(true);
  });
});

// ─── Bug fix: raw URLs (issue #1) ─────────────────────────────────────────────
//
// A dropped link's term must never be carried forward onto an occurrence that
// lives inside a raw URL (e.g. "github" inside https://github.com/...).

describe("computeCarryForwardEdits — raw URLs", () => {
  it("produces no edit when the only occurrence is inside a raw URL (issue #1)", () => {
    const afterDoc =
      "Check the repo at https://github.com/mapipolo/obsidian-carry-dropped-links-forward.";
    // Case-insensitive so the lowercase "github" in the URL is even a candidate.
    const edits = computeCarryForwardEdits(afterDoc, ["GitHub"], {
      ...S,
      caseSensitive: false,
    });
    expect(edits).toHaveLength(0);
  });

  it("skips the URL occurrence and links a later plain-text occurrence", () => {
    const afterDoc =
      "See https://github.com/mapipolo/repo for the GitHub project.";
    const edits = computeCarryForwardEdits(afterDoc, ["GitHub"], S);
    expect(edits).toHaveLength(1);
    const result = applyEdits(afterDoc, edits);
    // The URL must remain untouched...
    expect(result).toContain("https://github.com/mapipolo/repo");
    // ...and the genuine plain-text occurrence should be linked.
    expect(result).toContain("[[GitHub]] project");
  });

  it("does not linkify a partial-word match (word-boundary enforcement)", () => {
    // "Cat" must not be carried forward onto "Category".
    const afterDoc = "The Category index is large.";
    const edits = computeCarryForwardEdits(afterDoc, ["Cat"], S);
    expect(edits).toHaveLength(0);
  });
});

// ─── Spec example end-to-end ──────────────────────────────────────────────────

describe("spec example — four occurrences, first linked, first deleted", () => {
  it("promotes the second occurrence when the first linked occurrence is deleted", () => {
    const before =
      "[[Claude Shannon]] was born in 1916. " +
      "Claude Shannon studied at MIT. " +
      "The work of Claude Shannon influenced computing. " +
      "Claude Shannon received many awards.";

    // Simulate deleting the first line (which contained the only link)
    const after =
      "Claude Shannon studied at MIT. " +
      "The work of Claude Shannon influenced computing. " +
      "Claude Shannon received many awards.";

    const dropped = diffDroppedTargets(before, after);
    expect(dropped).toContain("Claude Shannon");

    const edits = computeCarryForwardEdits(after, dropped, S);
    expect(edits).toHaveLength(1);

    const result = applyEdits(after, edits);
    // The first remaining occurrence should now be a link
    expect(result.startsWith("[[Claude Shannon]]")).toBe(true);
    // The other occurrences should remain as plain text
    expect(result).toContain("The work of Claude Shannon influenced");
    expect(result).toContain("Claude Shannon received many awards");
  });
});
