import tsParser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		ignores: [
			"node_modules/**",
			"main.js",
			"test/**",
			"*.mjs",
			"package.json",
			"package-lock.json",
			"versions.json",
			"tsconfig.json",
		],
	},
	...tseslint.configs.recommendedTypeChecked.map(config => ({
		...config,
		files: ["src/**/*.ts"],
	})),
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: "./tsconfig.json",
				sourceType: "module",
			},
			globals: {
				activeDocument: "readonly",
				activeWindow: "readonly",
			},
		},
		rules: {
			"obsidianmd/commands/no-command-in-command-id": "error",
			"obsidianmd/commands/no-command-in-command-name": "error",
			"obsidianmd/commands/no-default-hotkeys": "error",
			"obsidianmd/commands/no-plugin-id-in-command-id": "error",
			"obsidianmd/commands/no-plugin-name-in-command-name": "error",
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/vault/iterate": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/editor-drop-paste": "error",
			"obsidianmd/hardcoded-config-path": "error",
			"obsidianmd/no-forbidden-elements": "error",
			"obsidianmd/no-global-this": "error",
			"obsidianmd/no-plugin-as-component": "error",
			"obsidianmd/no-sample-code": "error",
			"obsidianmd/no-tfile-tfolder-cast": "error",
			"obsidianmd/no-view-references-in-plugin": "error",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/object-assign": "error",
			"obsidianmd/platform": "error",
			"obsidianmd/prefer-file-manager-trash-file": "warn",
			"obsidianmd/prefer-instanceof": "error",
			"obsidianmd/prefer-get-language": "error",
			"obsidianmd/prefer-abstract-input-suggest": "error",
			"obsidianmd/prefer-window-timers": "error",
			"obsidianmd/prefer-active-doc": "error",
			"obsidianmd/regex-lookbehind": "error",
			"obsidianmd/sample-names": "error",
			"obsidianmd/no-unsupported-api": "error",
			"obsidianmd/validate-manifest": "error",
			"obsidianmd/validate-license": "error",
			"no-console": ["error", { allow: ["warn", "error", "debug"] }],
			"@typescript-eslint/no-unused-vars": ["error", {
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
			}],
		},
	},
];
