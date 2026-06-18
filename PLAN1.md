# Modern TUI Upgrade Plan

The goal is to enhance the `sql2js` TUI to feel like a premium, modern CLI tool (similar to Claude Code or Gemini CLI), while respecting the existing architectural constraint to avoid JSX build steps.

## Proposed Changes

### 1. Full Screen Mode (Alternate Screen Buffer)
- **Implementation:** We will use ANSI escape codes (`\x1b[?1049h` to enter, `\x1b[?1049l` to leave) to switch the terminal into the alternate screen buffer when the app mounts, and restore the original buffer when it unmounts.
- **Benefit:** This completely clears the screen while the app is running and restores the user's terminal history untouched when they exit, providing an immersive "app-like" experience.

### 2. Bigger Title
- **Implementation:** We will add `figlet` as a dependency.
- **Usage:** We will use `figlet.textSync('sql2js')` to generate a large ASCII art title, colored with our primary violet color from `theme.js`.

### 3. Interactive JSON File Selection
- **Implementation:** 
  - Add the `ink-select-input` dependency (the standard selection list for Ink).
  - Add a file scanning utility using `node:fs` and `node:path` that recursively finds all `.json` files in the current working directory and its children (excluding `node_modules` and `.git`).
  - Update the `data` mode in `app.js` to render the `SelectInput` component via `React.createElement`.
- **Benefit:** If the user boots `sql2js` without `-d`, they can simply use their up/down arrow keys to select a JSON file instead of typing the path manually.

## Verification Plan
1. Start `sql2js` without arguments and verify it opens in full screen with a large ASCII title.
2. Verify the arrow-key JSON file selector appears and correctly loads the chosen dataset.
3. Verify that pressing `Ctrl+C` or exiting cleanly restores the terminal to its previous state (leaving full screen mode).

> [!IMPORTANT]
> **User Review Required**
> Do you approve adding the `figlet` and `ink-select-input` dependencies, and does the plan for full-screen handling align with what you had in mind?
