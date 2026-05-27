/**
 * settings.ts
 *
 * Plugin settings type definition and defaults.
 * PluginSettings structurally satisfies link-manager.ts Settings interface.
 */

export interface PluginSettings {
  /** Whether to apply carry-forward immediately or after a debounce delay */
  timing: "immediate" | "debounced";
  /** Debounce delay in milliseconds (only used when timing === "debounced") */
  debounceDelayMs: number;
  /** Don't match or insert links into YAML frontmatter */
  skipFrontmatter: boolean;
  /** Don't match or insert links inside `inline code` spans */
  skipInlineCode: boolean;
  /** Format for the inserted carried-forward link */
  linkFormat: "wikilink" | "markdown";
  /** Whether the plain-text search is case-sensitive */
  caseSensitive: boolean;
  /**
   * When caseSensitive is false and the found text has different capitalisation
   * than the note name, controls which form is inserted:
   *   "use-note-name"  → [[Cognitive load]]          (replaces with note name)
   *   "use-found-text" → [[Cognitive load|cognitive load]]  (alias preserves found casing)
   * Only relevant when caseSensitive is false.
   */
  caseInsensitiveReplacement: "use-note-name" | "use-found-text";
}

export const DEFAULT_SETTINGS: PluginSettings = {
  timing: "immediate",
  debounceDelayMs: 500,
  skipFrontmatter: true,
  skipInlineCode: true,
  linkFormat: "wikilink",
  caseSensitive: true,
  caseInsensitiveReplacement: "use-note-name",
};
