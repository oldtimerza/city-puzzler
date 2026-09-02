# itch.io Playtest Release

## Build And Package

Run:

```bash
npm run package:itch
```

This produces `miniopolis-itch.zip`. Its root contains `index.html`, the `assets/` directory, and `THIRD_PARTY_NOTICES.md`; upload the ZIP unchanged to itch.io.

## itch.io Settings

1. Create an HTML5 browser project.
2. Upload `miniopolis-itch.zip` and select "This file will be played in the browser".
3. Start with an embed size of `1180 x 900`. The game adapts to narrower viewports.
4. Mark the project as a draft or restricted playtest until feedback is collected.

## Playtest Checks

- Load the game in itch.io's embedded frame and confirm no browser-console errors.
- Start Free play on both board sizes with the available Factory counts.
- Complete Tutorial lessons in order, refresh, and confirm progress persists.
- Use "Reset tutorial progress" before onboarding tests.
- Test pointer input on desktop and touch input at a narrow viewport.
- Verify rule cards, dependency links, red missing-requirement slashes, completion notice, refresh, and Show solution.

## Store Page

Include a one-sentence premise, controls, current version, Factory difficulty explanation, screenshots, and a feedback contact or issue link.
