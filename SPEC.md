# Motivation
Links are the foundation of what makes [[Obsidian]] so useful. But we don't link a concept every single time we reference it: most people follow a rule like "link the first occurrence of important references." [[Wikipedia]] seems to follow a similar rule. Trouble is, many of us frequently cut, extract and reorganize material while editing, and this makes it easy to accidentally drop the only linked reference to important concepts in your writing.

# Summary
This Obsidian plugin will help avoid accidentally removing the only link to a term that is referenced more than once in the note by watching for links that are removed from a note in edit operations (delete, cut, extract), and then "carrying the link forward" to the next occurrence of that string in the note.

For example, if I have a note that mentions "Claude Shannon" four times, but only the first occurrence is linked (i.e., `[[Claude Shannon]]`, and I happen to delete that particular line, then the note will lose its only proper link to the "Claude Shannon" note, and I may not realize it. Not good.

So the plugin should monitor deletions and extractions from the current note. When it sees that a link has been deleted, check the rest of the text to see if the title of the linked note appears exactly elsewhere in the note. If it does, change the *earliest remaining occurrence* of that same string into a link (whether it appears before the cursor position or after it). (That is, the new link could be placed earlier in the note than the position of the deletion that was just made, if "Claude Shannon" appears earlier in the note.)

# Rules
- Do not modify any text inside code blocks or `code fences`: only plain text is eligible.

# Tests
Generate several sensible tests that cover the conditions discussed above, as well as any other edge cases you can think of.