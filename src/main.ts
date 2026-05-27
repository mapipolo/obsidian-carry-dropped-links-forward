/**
 * main.ts
 *
 * Plugin entry point. Registers the editor extension and settings tab.
 */

import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { createCarryLinksExtension } from "./editor-extension";
import { PluginSettings, DEFAULT_SETTINGS } from "./settings";

export default class CarryDroppedLinksPlugin extends Plugin {
  settings!: PluginSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register the CodeMirror extension that watches for dropped links
    this.registerEditorExtension(
      createCarryLinksExtension(() => this.settings)
    );

    // Add settings tab
    this.addSettingTab(new CarryDroppedLinksSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class CarryDroppedLinksSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CarryDroppedLinksPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Carry Dropped Links Forward" });

    // ── Timing ────────────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Timing")
      .setDesc(
        "Whether to carry the link forward immediately on each edit, or wait " +
          "until you stop typing."
      )
      .addDropdown((drop) =>
        drop
          .addOption("immediate", "Immediate")
          .addOption("debounced", "Debounced")
          .setValue(this.plugin.settings.timing)
          .onChange(async (value) => {
            this.plugin.settings.timing = value as "immediate" | "debounced";
            await this.plugin.saveSettings();
            // Refresh to show/hide debounce delay field
            this.display();
          })
      );

    if (this.plugin.settings.timing === "debounced") {
      new Setting(containerEl)
        .setName("Debounce delay (ms)")
        .setDesc(
          "How many milliseconds to wait after the last edit before acting. " +
            "Default: 500."
        )
        .addText((text) =>
          text
            .setPlaceholder("500")
            .setValue(String(this.plugin.settings.debounceDelayMs))
            .onChange(async (value) => {
              const n = parseInt(value, 10);
              if (!isNaN(n) && n >= 0) {
                this.plugin.settings.debounceDelayMs = n;
                await this.plugin.saveSettings();
              }
            })
        );
    }

    // ── Link format ───────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Link format")
      .setDesc(
        "The format used when inserting a carried-forward link."
      )
      .addDropdown((drop) =>
        drop
          .addOption("wikilink", "Wikilink  [[Note]]")
          .addOption("markdown", "Markdown  [Note](Note)")
          .setValue(this.plugin.settings.linkFormat)
          .onChange(async (value) => {
            this.plugin.settings.linkFormat = value as "wikilink" | "markdown";
            await this.plugin.saveSettings();
          })
      );

    // ── Case sensitivity ──────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Case-sensitive search")
      .setDesc(
        'When enabled, "Claude Shannon" only matches text with that exact ' +
          'capitalisation. When disabled, "claude shannon" is also matched.'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.caseSensitive)
          .onChange(async (value) => {
            this.plugin.settings.caseSensitive = value;
            await this.plugin.saveSettings();
            // Refresh to show/hide the dependent replacement setting
            this.display();
          })
      );

    if (!this.plugin.settings.caseSensitive) {
      new Setting(containerEl)
        .setName("Case-insensitive replacement style")
        .setDesc(
          "When the found text has different capitalisation than the note name, " +
            "controls how the link is inserted.\n\n" +
            "Use note name — [[Cognitive load]] (replaces with the note's name)\n" +
            "Preserve found text — [[Cognitive load|cognitive load]] (alias keeps the text as written)"
        )
        .addDropdown((drop) =>
          drop
            .addOption("use-note-name", "Use note name")
            .addOption("use-found-text", "Preserve found text (alias)")
            .setValue(this.plugin.settings.caseInsensitiveReplacement)
            .onChange(async (value) => {
              this.plugin.settings.caseInsensitiveReplacement = value as
                | "use-note-name"
                | "use-found-text";
              await this.plugin.saveSettings();
            })
        );
    }

    // ── Skip zones ────────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Skip zones" });
    containerEl.createEl("p", {
      text:
        "Fenced code blocks are always skipped. The options below are additional " +
        "zones where the plugin will neither search for occurrences nor insert links.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Skip YAML frontmatter")
      .setDesc("Do not insert links into the --- frontmatter block.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.skipFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.skipFrontmatter = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Skip inline code")
      .setDesc("Do not insert links inside `inline code` backtick spans.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.skipInlineCode)
          .onChange(async (value) => {
            this.plugin.settings.skipInlineCode = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
