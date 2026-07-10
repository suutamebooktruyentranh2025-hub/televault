# Superpowers for Antigravity

You have superpowers.

This profile adapts Superpowers workflows for Antigravity with strict single-flow execution.

## Core Rules

1. Prefer local skills in `.agent/skills/<skill-name>/SKILL.md`.
2. Execute one core task at a time with `task_boundary`.
3. Use `browser_subagent` only for browser automation tasks.
4. Track checklist progress in `<project-root>/docs/plans/task.md` (table-only live tracker).
5. Keep changes scoped to the requested task and verify before completion claims.

## Tool Translation Contract

When source skills reference legacy tool names, use these Antigravity equivalents:

- Legacy assistant/platform names -> `Antigravity`
- `Task` tool -> `browser_subagent` for browser tasks, otherwise sequential `task_boundary`
- `Skill` tool -> `view_file ~/.gemini/skills/<skill-name>/SKILL.md` (or project-local `.agent/skills/<skill-name>/SKILL.md`)
- `TodoWrite` -> update `<project-root>/docs/plans/task.md` task list
- File operations -> `view_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`
- Directory listing -> `list_dir`
- Code structure -> `view_file_outline`, `view_code_item`
- Search -> `grep_search`, `find_by_name`
- Shell -> `run_command`
- Web fetch -> `read_url_content`
- Web search -> `search_web`
- Image generation -> `generate_image`
- User communication during tasks -> `notify_user`
- MCP tools -> `mcp_*` tool family

## Skill Loading

- First preference: project skills at `.agent/skills`.
- Second preference: user skills at `~/.gemini/skills`.
- If both exist, project-local skills win for this profile.
- Optional parity assets may exist at `.agent/workflows/*` and `.agent/agents/*` as entrypoint shims/reference profiles.
- These assets do not change the strict single-flow execution requirements in this file.

## Single-Flow Execution Model

- Do not dispatch multiple coding agents in parallel.
- Decompose large work into ordered, explicit steps.
- Keep exactly one active task at a time in `<project-root>/docs/plans/task.md`.
- If browser work is required, isolate it in a dedicated browser step.

## Verification Discipline

Before saying a task is done:

1. Run the relevant verification command(s).
2. Confirm exit status and key output.
3. Update `<project-root>/docs/plans/task.md`.
4. Report evidence, then claim completion.

## UI & Component Architecture Rule

When building or refactoring UI components that have an existing reference implementation in the project (e.g., lists, tables, selection mechanisms):
1. **Reuse Architecture**: Copy/reuse the exact structure, HTML elements (e.g., `<table>` vs `<div>`), class names, and core logic from the reference component (like `BrowserScreen.jsx`).
2. **Avoid Reinventing Logic**: Do NOT reinvent custom logic for complex interactions (like multi-selection, Shift-click range selection, or drag-and-drop) if a proven standard (like `applyItemSelection` in `VaultShell`) already exists in the codebase.
3. **Consistency**: Consistent architecture prevents subtle edge-case bugs and ensures a unified User Experience across the app.

## Televault List View Standard (My Drive Style)

**Red Flags (Failures to avoid):**
- Re-implementing selection logic instead of using `applyItemSelection`
- Passing raw API methods (e.g., `vault.download`) to UI components instead of `VaultShell` wrapper handlers (`handleDownload`).
- Adding redundant ContextMenu options (Open, Preview) when double-click already handles viewing.
- Forgetting to clear search or UI state when navigating (e.g., `gd-navigate`).

When implementing new list views or data grids (e.g., Search Results, Transfers), you MUST replicate the `BrowserScreen.jsx` architecture:
1. **Table Structure**: Use HTML tables (`<table className="w-full text-sm">`). Ensure rows use `gd-row group hover:bg-[var(--gd-hover)]`.
2. **Multi-Selection**:
   - Use `onToggleSelect` and `onApplyItemSelection` passed from `VaultShell`.
   - Row `onClick` handles multi-select: `onClick={(e) => onApplyItemSelection?.(e, file, displayedFiles)}`.
   - Checkbox handles direct toggle: `onChange={() => onToggleSelect?.(file.id, !selected)}`.
3. **Context Menus & Actions**:
   - Wrap rows in `<ContextMenuArea menu={showFileMenu(file)}>`.
   - Provide a 3-dots button that triggers the menu on click.
   - Limit menu options to core actions: Tải xuống (Download), Đổi tên (Rename), Di chuyển (Move), Xoá (Trash).
   - Use `RowQuickActions` for hover actions, ensuring you pass the **UI wrapper handlers** (e.g., `handleRenameFile`, which includes dialog prompts/toasts) rather than raw `vault` methods.
4. **Double Click**: Use `onDoubleClick` for viewing/previewing, but do not automatically trigger file downloads.

## Televault Screen Layout Standard (Google Drive Style)

**Red Flags (Failures to avoid):**
- Re-inventing layout structures with raw Tailwind instead of using `gd-settings` and `gd-*` classes.
- Creating custom form layouts instead of using `SettingsField` or `gd-settings-field` structures.
- Using generic buttons instead of `gd-dialog-btn` and `gd-dialog-btn--primary`.
- Building custom collapsible panels instead of using standard HTML `<details>` and `<summary>` styled with `group` classes.

When implementing new screens, configuration pages, or feature layouts, you MUST replicate the layout architecture of screens like `GDriveSyncScreen.jsx` to maintain the consistent Google Drive aesthetic:
1. **Screen Container**: Wrap the main screen content in `<div className="gd-settings flex min-h-0 flex-1 flex-col overflow-auto p-4">`.
2. **Sections and Cards**: 
   - Group related settings/features into `<section className="gd-settings-group">`.
   - Wrap the actual content/forms inside `<div className="gd-settings-card">`.
3. **Fields and Inputs**: Use `<SettingsField title="..." hint="...">` (or equivalent `gd-settings-field` classes) for form inputs, toggles, and options.
4. **Collapsible Panels**: Use HTML `<details>` and `<summary>` for expandable sections with consistent styling (e.g., `details className="group bg-gray-50 dark:bg-zinc-800/20 rounded-xl border border-gray-200 dark:border-zinc-700/50 shadow-sm"`).
5. **Buttons**: Always use `className="gd-dialog-btn"` and `gd-dialog-btn--primary` for actions instead of writing raw Tailwind button styles.
6. **Themes**: Respect dark mode by using standard Tailwind dark variants on custom elements (e.g., `dark:bg-zinc-800`, `dark:border-zinc-700`) where variables aren't used.

## Televault Dialog Standard

**Red Flags (Failures to avoid):**
- Using native browser dialogs like `window.confirm`, `window.alert`, or `window.prompt`.

When implementing user prompts, confirmations, or alerts, you MUST use the custom `useDialog` hook:
1. **Import the hook**: `import { useDialog } from '../context/DialogContext';` (adjust path as needed).
2. **Usage**: Extract `confirm` or `prompt` from the hook (e.g. `const { confirm } = useDialog();`).
3. **Execution**: Await the result. Example: `if (await confirm('Bạn có chắc chắn?')) { ... }`.
4. **Benefit**: Ensures a consistent Google Drive aesthetic across all components and respects dark mode.

## Self-Correction and Rule Extraction

**The "Rule of 3" for Debugging and Fixes:**
If you encounter a problem or bug that requires 3 or more attempts to fix (i.e., you try a fix, it fails, you try again, it fails again, and you finally succeed on the 3rd or later attempt), you MUST extract the root cause and the successful solution into a new project rule.
1. Formulate the learning into a clear, preventative rule.
2. Add this new rule to this `.agent/AGENTS.md` file (or create a dedicated skill via `/writing-skills` if it's a broad technique).
3. This ensures future agents or subsequent tasks do not repeat the same iterative trial-and-error process for this specific issue.
