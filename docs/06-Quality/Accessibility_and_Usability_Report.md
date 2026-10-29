# Accessibility and usability report (issue #24)

Covers **NFR-6** (usability) and **NFR-7** (WCAG 2.1 AA) and test cases **TC-UX-01** and **TC-UX-02**.

## 1. Automated WCAG 2.1 AA check

**Tool:** axe-core 4.10 (the engine used by Lighthouse and Chrome DevTools), rule sets `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa`, run in Chromium at 1280 x 900 on the production build.

### First run: 1 issue found

| Rule | Impact | Where | Problem |
|---|---|---|---|
| `color-contrast` | serious | Header role label ("· User"), "Locked" label in the admin policy table | Light grey text (`slate-400`, 3.0:1) is below the required **4.5:1** contrast |

**Fix:** both labels changed to `slate-500` (4.8:1). Files: `client/src/components/Layout.tsx`,
`client/src/pages/AdminPoliciesPage.tsx`.

### Second run, after the fix: 0 violations

| Screen | Rules passed | Violations |
|---|---|---|
| Home | 13 | 0 |
| Log in | 24 | 0 |
| Register | 25 | 0 |
| Register, with validation errors shown | 25 | 0 |
| Consent dashboard | 22 | 0 |
| Consent history | 23 | 0 |
| Privacy policy | 21 | 0 |
| Admin: policy versions | 22 | 0 |
| Admin: new draft form | 25 | 0 |

Already in place from earlier issues: every form field has a `<label>`; errors are linked with
`aria-describedby` and marked `aria-invalid`; alerts use `role="alert"` and success messages
`role="status"` (read out by screen readers); buttons have descriptive names such as
"Grant consent for Marketing e-mails"; the page language is set; decorative icons are hidden.

**How to repeat it:** open a page in Chrome → **F12** → **Lighthouse** → tick *Accessibility* → **Analyze**.

## 2. Keyboard-only test

Done with the keyboard only (Tab, Shift+Tab, Enter), no mouse:

1. Log in page: Tab reaches *E-mail* → *Password*, Enter submits → the dashboard opens. ✅
2. Dashboard: Tab order is header links → *Privacy policy* → *My history* → each card's button. ✅
3. Enter on **Grant** saves the consent and the confirmation "Consent granted for … under policy v1.0" is announced. ✅
4. Every focused element shows a visible focus ring. ✅

Result: **pass**. All user tasks can be done without a mouse.

## 3. Usability task test (NFR-6: 5 first-time users)

**Task:** "Log in as user@demo.com / Demo@12345 and give consent for *Usage analytics*. Then withdraw it."
**Target:** at least 4 of 5 people succeed **within 1 minute** and **at most 3 clicks after login**, without help.
After login the task needs **1 click** (Grant), and 1 more to withdraw.

| # | Participant (classmate) | Time (s) | Clicks after login | Needed help? | Success |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

**Result:** _ of 5 succeeded → NFR-6 **pass / fail** _(fill in after the test)_

Notes / problems noticed by participants:

-
