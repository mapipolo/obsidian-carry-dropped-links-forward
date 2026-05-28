/*
  Carry Dropped Links Forward — Obsidian Plugin
  Bundled by esbuild. Source: https://github.com/mapipolo/obsidian-carry-dropped-links-forward
*/
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CarryDroppedLinksPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/editor-extension.ts
var import_view = require("@codemirror/view");
var import_state = require("@codemirror/state");

// src/link-manager.ts
function extractWikiLinks(text) {
  const results = [];
  const re = /!?\[\[([^[\]]+)\]\]/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const inner = match[1];
    const start = match.index;
    const end = start + raw.length;
    const pipeIdx = inner.indexOf("|");
    const target = pipeIdx >= 0 ? inner.slice(0, pipeIdx).trim() : inner.trim();
    const displayText = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : getBasename(target);
    results.push({ target, displayText, raw, start, end });
  }
  return results;
}
function getBasename(target) {
  const slash = target.lastIndexOf("/");
  return slash >= 0 ? target.slice(slash + 1) : target;
}
function getSearchTerm(target) {
  return getBasename(target);
}
function computeSkipRanges(text, settings) {
  const ranges = [];
  for (const re of [
    /^(`{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm,
    /^(~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm
  ]) {
    let m;
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  if (settings.skipFrontmatter) {
    const fmRe = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
    const fmMatch = fmRe.exec(text);
    if (fmMatch && fmMatch.index === 0) {
      ranges.push({ start: 0, end: fmMatch[0].length });
    }
  }
  if (settings.skipInlineCode) {
    const codeRe = /`[^`\n]+`/g;
    let m;
    while ((m = codeRe.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  {
    let i = 0;
    while (i < text.length - 1) {
      if (text[i] === "[" && text[i + 1] === "[") {
        const spanStart = i >= 1 && text[i - 1] === "!" ? i - 1 : i;
        let j = i + 2;
        let spanEnd = -1;
        while (j < text.length) {
          if (text[j] === "]" && j + 1 < text.length && text[j + 1] === "]") {
            spanEnd = j + 2;
            break;
          }
          if (text[j] === "[" || text[j] === "\n") {
            spanEnd = j;
            break;
          }
          j++;
        }
        if (spanEnd === -1) spanEnd = text.length;
        ranges.push({ start: spanStart, end: spanEnd });
        i = spanEnd;
      } else {
        i++;
      }
    }
  }
  {
    const re = /\]\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const closePos = m.index;
      if (ranges.some((r) => r.start <= closePos && closePos < r.end)) continue;
      let start = closePos;
      while (start > 0 && text[start - 1] !== "[" && text[start - 1] !== "]" && text[start - 1] !== "\n") {
        start--;
      }
      ranges.push({ start, end: closePos + 2 });
    }
  }
  {
    const re = /\[([^[\]]*)\]\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return ranges;
}
function isInSkipRange(pos, length, ranges) {
  const end = pos + length;
  for (const r of ranges) {
    if (pos < r.end && end > r.start) return true;
  }
  return false;
}
function findPlainTextOccurrences(text, searchTerm, skipRanges, caseSensitive) {
  if (!searchTerm) return [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? searchTerm : searchTerm.toLowerCase();
  const positions = [];
  let searchFrom = 0;
  while (searchFrom <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, searchFrom);
    if (idx === -1) break;
    if (!isInSkipRange(idx, needle.length, skipRanges)) {
      positions.push(idx);
    }
    searchFrom = idx + 1;
  }
  return positions;
}
function diffDroppedTargets(beforeText, afterText) {
  var _a;
  const countByTarget = (text) => {
    var _a2;
    const counts = /* @__PURE__ */ new Map();
    for (const link of extractWikiLinks(text)) {
      if (link.target.includes("#")) continue;
      counts.set(link.target, ((_a2 = counts.get(link.target)) != null ? _a2 : 0) + 1);
    }
    return counts;
  };
  const before = countByTarget(beforeText);
  const after = countByTarget(afterText);
  const dropped = [];
  for (const [target, count] of before) {
    if (count > 0 && ((_a = after.get(target)) != null ? _a : 0) === 0) {
      dropped.push(target);
    }
  }
  return dropped;
}
function formatLink(target, settings, matchedText) {
  const basename = getBasename(target);
  const useFoundText = !settings.caseSensitive && settings.caseInsensitiveReplacement === "use-found-text" && matchedText !== void 0 && matchedText !== basename;
  if (settings.linkFormat === "wikilink") {
    return useFoundText ? `[[${target}|${matchedText}]]` : `[[${target}]]`;
  }
  const displayText = useFoundText ? matchedText : basename;
  return `[${displayText}](${target})`;
}
function computeCarryForwardEdits(afterText, droppedTargets, settings) {
  const skipRanges = computeSkipRanges(afterText, settings);
  const edits = [];
  const usedRanges = [];
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
    const pos = occurrences[0];
    const matchedText = afterText.slice(pos, pos + searchTerm.length);
    const linkText = formatLink(target, settings, matchedText);
    edits.push({ from: pos, to: pos + searchTerm.length, insert: linkText });
    usedRanges.push({ start: pos, end: pos + searchTerm.length });
  }
  return edits;
}

// src/editor-extension.ts
var carryForwardAnnotation = import_state.Annotation.define();
function createCarryLinksExtension(getSettings) {
  return import_view.ViewPlugin.fromClass(
    class {
      constructor() {
        /** True while we are dispatching a carry-forward transaction */
        this.isInserting = false;
        /** Debounce timer handle */
        this.debounceTimer = null;
        /** Document snapshot at the start of a debounce burst */
        this.burstStartDoc = "";
      }
      update(update) {
        if (!update.docChanged) return;
        if (update.transactions.some(
          (tr) => tr.annotation(carryForwardAnnotation)
        )) {
          return;
        }
        if (update.transactions.some((tr) => {
          const ue = tr.annotation(import_state.Transaction.userEvent);
          return typeof ue === "string" && (ue === "undo" || ue === "redo" || ue.startsWith("undo.") || ue.startsWith("redo."));
        })) {
          return;
        }
        if (this.isInserting) return;
        const settings = getSettings();
        const oldDoc = update.startState.doc.toString();
        const newDoc = update.state.doc.toString();
        if (settings.timing === "immediate") {
          this.applyCarryForward(update, oldDoc, newDoc);
        } else {
          if (this.debounceTimer === null) {
            this.burstStartDoc = oldDoc;
          } else {
            window.clearTimeout(this.debounceTimer);
          }
          this.debounceTimer = window.setTimeout(() => {
            this.debounceTimer = null;
            const currentDoc = update.view.state.doc.toString();
            this.applyCarryForward(update, this.burstStartDoc, currentDoc);
          }, settings.debounceDelayMs);
        }
      }
      applyCarryForward(update, oldDoc, newDoc) {
        const settings = getSettings();
        const droppedTargets = diffDroppedTargets(oldDoc, newDoc);
        if (droppedTargets.length === 0) return;
        const edits = computeCarryForwardEdits(newDoc, droppedTargets, settings);
        if (edits.length === 0) return;
        this.isInserting = true;
        window.setTimeout(() => {
          try {
            update.view.dispatch({
              changes: edits.map((e) => ({
                from: e.from,
                to: e.to,
                insert: e.insert
              })),
              annotations: carryForwardAnnotation.of(true)
            });
          } finally {
            this.isInserting = false;
          }
        }, 0);
      }
    }
  );
}

// src/settings.ts
var DEFAULT_SETTINGS = {
  timing: "immediate",
  debounceDelayMs: 500,
  skipFrontmatter: true,
  skipInlineCode: true,
  caseSensitive: true,
  caseInsensitiveReplacement: "use-note-name"
};

// src/main.ts
var CarryDroppedLinksPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.registerEditorExtension(
      createCarryLinksExtension(() => ({
        ...this.settings,
        linkFormat: this.app.vault.getConfig("useMarkdownLinks") === true ? "markdown" : "wikilink"
      }))
    );
    this.addSettingTab(new CarryDroppedLinksSettingTab(this.app, this));
  }
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var CarryDroppedLinksSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Timing").setDesc(
      "Whether to carry the link forward immediately on each edit, or wait until you stop typing."
    ).addDropdown(
      (drop) => drop.addOption("immediate", "Immediate").addOption("debounced", "Debounced").setValue(this.plugin.settings.timing).onChange(async (value) => {
        this.plugin.settings.timing = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.timing === "debounced") {
      new import_obsidian.Setting(containerEl).setName("Debounce delay (ms)").setDesc(
        "How many milliseconds to wait after the last edit before acting. Default: 500."
      ).addText(
        (text) => text.setPlaceholder("500").setValue(String(this.plugin.settings.debounceDelayMs)).onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n >= 0) {
            this.plugin.settings.debounceDelayMs = n;
            await this.plugin.saveSettings();
          }
        })
      );
    }
    new import_obsidian.Setting(containerEl).setName("Case-sensitive search").setDesc(
      'When looking to reapply a link, look only for strings with exactly the same case as the deleted link. When off, deleting a link "[[Python]]" will cause the first occurrence of the string "python" to be linkified.'
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
        this.plugin.settings.caseSensitive = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (!this.plugin.settings.caseSensitive) {
      new import_obsidian.Setting(containerEl).setName("Case-insensitive replacement style").setDesc(
        "Controls how the new link should appear if its text is cased differently than the deleted link."
      ).addDropdown(
        (drop) => drop.addOption("use-note-name", "Use note name").addOption("use-found-text", "Preserve text case").setValue(this.plugin.settings.caseInsensitiveReplacement).onChange(async (value) => {
          this.plugin.settings.caseInsensitiveReplacement = value;
          await this.plugin.saveSettings();
        })
      );
    }
    new import_obsidian.Setting(containerEl).setHeading().setName("Skip zones");
    containerEl.createEl("p", {
      text: "Fenced code blocks are always skipped. The options below are additional zones where the plugin will neither search for occurrences nor insert links.",
      cls: "setting-item-description"
    });
    new import_obsidian.Setting(containerEl).setName("Skip YAML frontmatter").setDesc("Do not insert links into the --- frontmatter block.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.skipFrontmatter).onChange(async (value) => {
        this.plugin.settings.skipFrontmatter = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Skip inline code").setDesc("Do not insert links inside `inline code` backtick spans.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.skipInlineCode).onChange(async (value) => {
        this.plugin.settings.skipInlineCode = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
