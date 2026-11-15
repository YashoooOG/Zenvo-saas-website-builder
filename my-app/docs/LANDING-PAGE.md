# Landing page and appearance

Stage 4 introduces Zenvo's public marketing page. Its visual direction comes
from a studio's client roster: restrained blue accents, neutral surfaces, Geist
type, client initials, and a workspace preview. The layout has a single focal
preview, editorial feature rows, a workflow, native FAQ disclosures, and account
entry links. Design review used the installed unslop skill.

## How it works

The page remains a Server Component. Interactive navigation, preview tabs, and
appearance controls are small Client Components. The preview is illustrative:
it switches among clients, projects, and websites but does not write database
records or imply those features are already operational.

`ThemeProvider` uses next-themes to set the document's light/dark class and
persist the choice under `zenvo-theme`. System mode follows the device setting.
The document suppresses the expected hydration difference for that class;
appearance controls wait until mounted before displaying the resolved choice.
Shared CSS tokens also theme account pages and Clerk components.

## Repeatable manual checks

1. Open the homepage at desktop and 390px/320px widths. Check for overflow.
2. Select light and dark appearance; reload and navigate to sign-in. Confirm the
   choice persists and labels and inputs remain legible. Return to system mode.
3. Switch preview tabs using clicks, arrow keys, Home, and End. Confirm only the
   selected panel appears and keyboard focus follows the selected tab.
4. Open the mobile menu, press Escape, and confirm focus returns to its button.
   Reopen it and select Platform; confirm the menu closes and the anchor changes.
5. Open FAQ disclosures and follow account entry links. Check browser errors.

Automated verification: `bun run lint`, `bun run typecheck`, `bun run build`,
and `bun run test:auth` against the running production preview. These checks do
not establish that the later agency, builder, or billing stages are complete.
