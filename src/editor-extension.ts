import { ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Annotation, Transaction } from "@codemirror/state";
import { computeCarryForwardEdits, diffDroppedTargets } from "./link-manager";
import type { Settings } from "./link-manager";

/**
 * All settings the extension needs: the carry-forward logic settings (Settings)
 * plus the timing fields that live in PluginSettings.  Defined here so
 * editor-extension.ts doesn't need to import from settings.ts.
 */
export interface ExtensionSettings extends Settings {
  timing: "immediate" | "debounced";
  debounceDelayMs: number;
}

/**
 * Annotation used to tag carry-forward transactions so the plugin can
 * distinguish them from user edits and avoid re-entrancy.
 */
const carryForwardAnnotation = Annotation.define<boolean>();

/**
 * Create a CodeMirror ViewPlugin that watches for dropped links and carries
 * them forward.
 *
 * @param getSettings  Getter function so the plugin always uses current settings
 *                     without needing to rebuild the extension on every change.
 */
export function createCarryLinksExtension(
  getSettings: () => ExtensionSettings
) {
  return ViewPlugin.fromClass(
    class {
      /** True while we are dispatching a carry-forward transaction */
      private isInserting = false;
      /** Debounce timer handle */
      private debounceTimer: number | null = null;
      /** Document snapshot at the start of a debounce burst */
      private burstStartDoc = "";

      update(update: ViewUpdate): void {
        if (!update.docChanged) return;

        // Ignore our own carry-forward transactions to prevent re-entrancy
        if (
          update.transactions.some((tr) =>
            tr.annotation(carryForwardAnnotation)
          )
        ) {
          return;
        }

        // Never fire during undo or redo — the plugin would immediately re-apply
        // the carry-forward that the user just undid, making undo impossible.
        if (
          update.transactions.some((tr) => {
            const ue = tr.annotation(Transaction.userEvent);
            return typeof ue === "string" && (
              ue === "undo" || ue === "redo" ||
              ue.startsWith("undo.") || ue.startsWith("redo.")
            );
          })
        ) {
          return;
        }

        // Also skip if we're mid-insertion (belt-and-suspenders guard)
        if (this.isInserting) return;

        const settings = getSettings();
        const oldDoc = update.startState.doc.toString();
        const newDoc = update.state.doc.toString();

        if (settings.timing === "immediate") {
          this.applyCarryForward(update, oldDoc, newDoc);
        } else {
          // Debounce: record the doc at the start of a new edit burst,
          // then wait for edits to settle before acting.
          if (this.debounceTimer === null) {
            // First edit in this burst — snapshot the pre-edit state
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

      private applyCarryForward(
        update: ViewUpdate,
        oldDoc: string,
        newDoc: string
      ): void {
        const settings = getSettings();
        const droppedTargets = diffDroppedTargets(oldDoc, newDoc);
        if (droppedTargets.length === 0) return;

        const edits = computeCarryForwardEdits(newDoc, droppedTargets, settings);
        if (edits.length === 0) return;

        // Defer the dispatch to the next task so we're outside the current
        // CM update cycle, preventing synchronous re-entrant updates.
        this.isInserting = true;
        window.setTimeout(() => {
          try {
            update.view.dispatch({
              changes: edits.map((e) => ({
                from: e.from,
                to: e.to,
                insert: e.insert,
              })),
              annotations: carryForwardAnnotation.of(true),
            });
          } finally {
            this.isInserting = false;
          }
        }, 0);
      }
    }
  );
}
