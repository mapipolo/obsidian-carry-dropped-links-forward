# Carry Dropped Links Forward

An [Obsidian](https://obsidian.md) plugin that keeps your notes properly linked as you edit them.

Most people follow a "link on first mention" rule: only the first occurrence of a concept gets a `[[wikilink]]`. But this makes it easy to accidentally delete the only linked occurrence of a concept.

Whenever you delete or cut text that contained a `[[link]]`, the plugin checks whether any links to that same note were lost. If so, it automatically promotes the earliest remaining plain-text occurrence of that term into a link, whether that's earlier or later in the note than where the deletion happened.

**Example:** You have four mentions of "Claude Shannon" in a note, but only the first is a `[[Claude Shannon]]` link. You delete that line. The plugin immediately turns the next occurrence of "Claude Shannon" into `[[Claude Shannon]]`, so your note stays connected.

The plugin never touches text inside code blocks, existing links, or markdown hyperlinks. YAML frontmatter and inline code are also skipped by default.

## Installation

### Manual installation

1. Download the latest release from the [Releases page](../../releases) — you need `main.js` and `manifest.json`
2. In your vault, create the folder `.obsidian/plugins/obsidian-carry-dropped-links-forward/`
3. Copy `main.js` and `manifest.json` into that folder
4. Restart Obsidian (or reload plugins via **Settings → Community plugins → Reload plugins**)
5. Enable the plugin under **Settings → Community plugins**

### Build from source

Requires [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/mapipolo/obsidian-carry-dropped-links-forward
cd obsidian-carry-dropped-links-forward
npm install --legacy-peer-deps
npm run build
```

Then copy `main.js` and `manifest.json` into your vault's plugin folder as described above.

## Settings

Open **Settings → Carry Dropped Links Forward** to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| **Timing** | Immediate | Apply the carry-forward as soon as you edit, or wait until you stop typing (debounced). |
| **Debounce delay** | 500 ms | How long to wait after the last keystroke before acting. Only shown when timing is set to Debounced. |
| **Case-sensitive search** | On | When on, `Claude Shannon` only matches text with that exact capitalisation. |
| **Case-insensitive replacement style** | Use note name | Only shown when case-sensitive search is off. Controls whether the inserted link uses the note's name (`[[Cognitive load]]`) or preserves the found casing as an alias (`[[Cognitive load\|cognitive load]]`). |
| **Skip YAML frontmatter** | On | Don't insert links into the `---` frontmatter block. |
| **Skip inline code** | On | Don't insert links inside `` `inline code` `` spans. |

> **Link format** is not a separate setting — the plugin respects your vault-wide choice under **Settings → Files and Links → Use \[\[Wikilinks\]\]** automatically.

Fenced code blocks (` ``` ` and `~~~`) are always skipped and are not configurable.

## Behaviour details

- **Aliased links** — if you delete `[[Claude Shannon|CS]]`, the plugin searches for the target note name ("Claude Shannon"), not the display alias.
- **Path-qualified links** — if you delete `[[People/Claude Shannon]]`, the plugin searches for the basename ("Claude Shannon") and restores the full path in the inserted link.
- **Multiple links in one cut** — if a cut removes two different links, each is handled independently; both terms get a carry-forward if plain-text occurrences exist.
- **Heading links** — links like `[[Note#Section]]` are currently not carried forward (the plain-text form is ambiguous). This may be addressed in a future release.
- **Undo** — the carry-forward insertion is a normal editor transaction. Press `Ctrl/Cmd+Z` once to undo the insertion; press again to undo the original deletion.

## Development

```bash
npm run dev       # watch mode (builds main.js on every save)
npm test          # run the test suite
npm run build     # production build
```

Tests cover the pure link-management logic in `src/link-manager.ts` and run without any Obsidian API dependency.

## License

[MIT](LICENSE)
