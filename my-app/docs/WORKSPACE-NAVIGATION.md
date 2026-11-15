# Workspace navigation and dialogs (Stage 8)

The agency layout now provides a persistent sidebar, current-agency context,
searchable agency switcher, and mobile navigation. Links point to implemented
agency listing, creation, and settings routes. Client sub-account navigation
will be added alongside sub-accounts in Stage 11.

## Server and client responsibilities

The server layout calls `requireWorkspaceUser()` and `listOwnedAgencies()` behind
a Suspense boundary. Only IDs, names, and logo URLs are passed to the client
shell. The client resolves the current agency by an exact URL segment match
against this authorized list. Unknown IDs never create a scoped settings link.

The sidebar is not an authorization boundary. Settings reads and all mutations
still check the active owner on the server. An ADMIN membership alone does not
grant access in this stage; role-based navigation will follow the Stage 9 policy.
Next.js retains layouts across navigation, so creation, updates, and logo changes
invalidate the `/agency` layout to refresh the agency list and branding.

## Shared dialogs

`src/components/ui/dialog.tsx` wraps the installed Base UI Dialog primitive with
a consistent title, description, backdrop, close button, and scrollable popup.
The workspace dialog context coordinates the switcher and mobile menu. It keeps
one dialog open at a time, restores focus to its initiating button, and ties open
state to the current pathname. Following a navigation link closes the dialog;
opening the switcher again resets its search. Dialog state does not remount the
page or its business form.

Base UI provides modal focus containment, Escape dismissal, and background
interaction blocking. The switcher uses ordinary links with current-agency
labels; there is no simulated listbox or custom arrow-key behavior. Tab, Shift+Tab,
Enter, and Escape follow native link and dialog conventions.

The desktop sidebar becomes a mobile navigation button below 800px. The mobile
context bar has a separate switch-agency action. Long names wrap, dialog content
scrolls within the viewport, and navigation links expose `aria-current="page"`.

## Verification commands

```powershell
bun run test:agencies
bun run lint
bun run build
# With the preview running:
$env:AUTH_TEST_BASE_URL = 'http://localhost:3108'
bun run test:auth
```

Use the disposable Clerk fixture workflow in [agency notes](AGENCIES.md) for
browser checks. Exercise empty and populated switchers, search/no matches,
switching, rename refresh, keyboard dismissal/focus return, mobile menus, and
unknown agency rejection. Remove local fixture records before its Clerk identity.

These checks passed on November 15, 2026 with two disposable agencies. Desktop
light and mobile dark layouts were inspected; 390px and 320px widths had no
horizontal overflow. Tab and Shift+Tab wrapped within the dialog, Escape
restored the initiating button, search reset on reopening, and an unsaved city
field survived opening and closing the switcher. Creating and renaming agencies
updated the retained layout. No browser console errors were recorded. Fixtures
were removed after sign-out.

References: [Base UI Dialog](https://base-ui.com/react/components/dialog),
[Next.js layouts](https://nextjs.org/docs/app/getting-started/layouts-and-pages),
[layout revalidation](https://nextjs.org/docs/app/api-reference/functions/revalidatePath).
