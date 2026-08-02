/**
 * COMMUNITY LIBRARY — Apps Script backend
 * -----------------------------------------------------
 * SETUP:
 * 1. Open your Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Delete any starter code, paste this whole file in.
 * 4. Update SHEET_ID below if this script is NOT bound to the sheet
 *    (if you opened it via Extensions > Apps Script from inside the
 *    sheet, you can leave SHEET_ID as '' — it will use the active sheet).
 * 5. Run `setupSheets` from the editor (select it in the function
 *    dropdown, click Run). This creates the Books, Transactions, Admins,
 *    Approvals, and User List tabs with the right headers. Approve the
 *    permissions prompt. Safe to run again any time (e.g. after pasting
 *    in an updated version of this file) — it only creates whatever's
 *    missing and never clears a tab that already has data in it.
 * 6. Fill in the "User List" tab: one row per person, columns Class,
 *    Name, Parent1, Parent2. This is the roster everyone signs in
 *    against — there is no separate password, and no email/phone
 *    stored at all. A row with both Parent columns blank is treated as
 *    signing in for themself (e.g. staff/admins); a row with a Parent1
 *    and/or Parent2 name is a child, and typing that guardian's own
 *    name signs in as the parent, with the option to pick a specific
 *    child (or themself) each time they borrow. (If you have an
 *    existing sheet from before this schema, run `migrateUserListSchema`
 *    once instead of retyping everything — see that function's comment.)
 * 7. Add admin approvers: in the Admins tab, add one row per admin with
 *    their email in column A — this must be the exact same email as
 *    that admin's row in User List, since that's what they'll sign in
 *    with.
 * 8. Run `installApprovalTrigger` once from the editor. This lets the
 *    script notice when an admin changes a cell in the Approvals tab.
 * 9. Share the Sheet directly with each admin's Google account (Editor
 *    access). Admin approval enforcement (when approving via the Sheet
 *    itself, not the web app) identifies approvers by their signed-in
 *    Google email, so it will not work if the sheet is shared via an
 *    "anyone with the link can edit" link instead of named accounts.
 * 10. Deploy > New deployment > type: Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 11. Copy the Web app URL — paste it into index.html's DEFAULT_API_URL
 *    constant (there's no in-app Settings screen; the URL is hardcoded).
 * 12. Add your books: run addBook manually a few times, OR just type
 *    rows directly into the Books tab (ItemID / Title / Author),
 *    leave Status blank — the app treats blank Status as Available. The
 *    Group column (right after Author) is optional and not something
 *    the app's own "Add books" form ever asks for — it's meant to be
 *    filled in (or bulk-edited) directly in the Sheet, from the
 *    dropdown described in step 13's BookGroups row, purely so an admin
 *    can see borrowing trends by category later (Shelf tab in the app
 *    can filter by it). If you have an existing Books tab from before
 *    this column existed, run `migrateBooksAddGroupColumn_` once first
 *    — see that function's comment.
 * 13. Run `setupConfigSheet` once. This creates a Config tab (Key/Value
 *    columns) pre-filled with a LoanDays row (default 14), a
 *    MaxBorrowItems row (default 4), an AdminSecret row (default
 *    "changeme" — change this immediately, it's the shared admin
 *    passcode), a SiteAccessCode row (default "changeme-site-code" —
 *    change this immediately too, see "HOW SITE ACCESS WORKS" below), a
 *    SiteAccessTTLHours row (default 24), a SiteUrl row (your GitHub
 *    Pages URL, e.g. https://youruser.github.io/library-app/ — update
 *    it if you ever move the app to a different URL), a
 *    PatronLoginEnabled row (default TRUE — set to FALSE to hide the
 *    patron sign-in search box from the landing page entirely, leaving
 *    only Admin login, for a rollout where only admins use the app at
 *    first; this is a UI-level toggle only, not a security boundary,
 *    same as the rest of the app's client-side role gating), and a
 *    BookGroups row (default "Fiction, Non-fiction, Picture Books,
 *    Reference" — a comma-separated list that becomes both the Books
 *    tab's Group column dropdown and the app's Shelf-tab Group filter;
 *    edit it any time, then run the 📚 Library menu's "Refresh book
 *    Group dropdown" item to update the Sheet-side dropdown to match).
 *    Edit any of these any time — the app reads this tab on every load,
 *    so there's no code change or redeploy needed to update them.
 *    Changing LoanDays changes the default due date for future
 *    approvals only, not books already borrowed. Changing
 *    MaxBorrowItems changes how many books someone can have Borrowed or
 *    Pending at once before new borrow requests are rejected.
 * 14. Reload the Google Sheet tab in your browser. A "📚 Library" menu
 *    appears next to Help — use its "Print QR labels" item any time to
 *    generate a printable label sheet (title, item ID, and a scannable
 *    QR code per book) right from the Sheet. This does not require the
 *    web app at all, and is the only place labels are printed from —
 *    the scanner app itself only shows a single label right after
 *    adding one book. Select one or more rows in the Books tab first
 *    (click-drag the row numbers, or ctrl/cmd-click to select several)
 *    to print labels for just those books — handy when you've added a
 *    few new ones and don't want to reprint the whole catalog. With
 *    nothing meaningfully selected, it prints every book.
 * 15. Once you've changed SiteAccessCode to something real, use the same
 *    "📚 Library" menu's "Print site access QR code" item, print it, and
 *    post it only somewhere that already requires physical presence to
 *    reach — e.g. inside the library room itself. See "HOW SITE ACCESS
 *    WORKS" below for what this actually protects against.
 *
 * HOW SITE ACCESS WORKS (a device-level gate in front of everything
 * else, including sign-in and admin login):
 * - The web app itself is public — anyone with the URL can load the
 *   page — but every single backend action requires a site access code
 *   that's only ever printed as a QR code from this Sheet (the "Print
 *   site access QR code" menu item above), never shown anywhere in the
 *   web app itself. Post that printout only somewhere physical access
 *   is already required, like inside the library room, and a device
 *   genuinely can't do anything useful with the app — not even reach
 *   the sign-in screen — until someone has scanned it there.
 * - When the Config tab's SiteUrl is set, that QR encodes a direct link
 *   (SiteUrl + ?code=...) instead of the bare code, so scanning it with
 *   an ordinary phone camera app opens the site already unlocked — no
 *   need to open the app first and use its own in-app scanner (the
 *   in-app scanner still works too, and understands either form). The
 *   app strips the code back out of the address bar immediately after
 *   reading it, so it never lingers in browser history or a bookmark.
 * - Scanning it unlocks that one device for SiteAccessTTLHours (Config
 *   tab, default 24) — after that, the app asks for another scan. This
 *   expiry is enforced entirely on that device (a timestamp in its own
 *   browser storage); the code itself never expires or rotates on its
 *   own. Use the "📚 Library" menu's "Regenerate site access code" item
 *   any time to have it generate and save a fresh random one instead of
 *   editing the Config cell by hand — e.g. if a printout goes missing,
 *   or just as routine hygiene. That's the only way to invalidate every
 *   device at once: it takes effect immediately, blocking every device
 *   currently unlocked with the old code (this one included) until it
 *   scans the new QR — print a fresh one with "Print site access QR
 *   code" right after.
 * - This applies equally to admins — an admin who hasn't scanned the
 *   code on their device can't reach the admin login screen either.
 *   It's a separate layer entirely from admin login/AdminSecret, which
 *   still exists on top of this for who gets admin screens once inside.
 * - Same caveat as AdminSecret: this is a shared secret compared as
 *   plain text, not a cryptographic token — someone who captures the
 *   code value itself (photographs the QR, is told the code, etc.)
 *   could keep using the API from anywhere without ever visiting the
 *   library room again, until the code is rotated. The real protection
 *   is that the code is never printed or displayed anywhere except that
 *   one Sheet-generated QR code, so getting it in the first place
 *   requires either physical access to wherever it's posted or edit
 *   access to this Sheet.
 *
 * HOW SIGN-IN WORKS (no Google/Facebook login, no password — everyone
 * matches against the User List tab):
 * - As someone types a name (2+ characters), the app live-searches
 *   every row's Class/Name/Parent1/Parent2 for that substring and shows
 *   matching people to tap — not an exact match, so "yuki" finds "Yuki
 *   Sato". There's no guest/fallback mode; if you're not found, you're
 *   not in the sheet yet.
 * - Rows that share a Parent name also produce a "Parent of ..." option
 *   alongside the individual children, so a parent can sign in as
 *   themself (their own separate MaxBorrowItems allowance, tracked
 *   under their own name) or pick a specific child — each borrow scan
 *   asks which one it's for.
 * - Since matching is loose, there's no separate "is this really you"
 *   gate at patron sign-in — the safeguard against someone picking the
 *   wrong or someone else's name is the existing borrow-approval step
 *   below, which every borrow request already goes through regardless.
 * - Admins do NOT sign in this way. Patron sign-in never grants admin
 *   access, even for a listed admin email — see "HOW ADMIN LOGIN
 *   WORKS" below.
 *
 * HOW ADMIN LOGIN WORKS (deliberately separate from patron sign-in):
 * - The landing page has a small "Admin login" link, separate from the
 *   patron search box. It asks for an admin's email AND a shared
 *   passcode — the Config tab's AdminSecret — which every admin uses
 *   in common. Both must be correct: the email must be listed in the
 *   Admins tab, and the passcode must match AdminSecret exactly.
 * - Change AdminSecret in the Config tab any time — takes effect
 *   immediately, no redeploy. Do this if you suspect it's been shared
 *   too widely, or periodically as routine hygiene.
 * - Without this, anyone who merely knew or guessed a listed admin's
 *   email could get full admin access through patron sign-in alone —
 *   this closes that gap. It is still not a strong security boundary
 *   (the passcode travels in a URL query string, since this whole app
 *   only uses GET requests — visible in browser history and Apps
 *   Script's execution logs, not a true secret channel), just a
 *   meaningfully higher bar than "type an email you happen to know."
 *
 * HOW APPROVAL WORKS:
 * - When someone scans an available book to borrow it, the book's
 *   Status becomes "Pending" and a row is added to the Approvals tab
 *   with Decision = "Pending" — unless that person already has
 *   MaxBorrowItems books Borrowed or Pending, in which case the scan is
 *   rejected up front.
 * - An admin opens the Approvals tab and changes that row's Decision
 *   cell to "Approve" or "Deny" (it's a dropdown). To hand out a
 *   non-default due date, type a date into that row's CustomDueDate
 *   column before switching Decision to Approve. Same thing is
 *   possible from the web app's Approvals screen, which shows an
 *   editable due-date field next to each request's Approve button
 *   (bulk "Approve all" always uses the default, per-row overrides
 *   only apply one at a time).
 * - The script checks the editor's email against the Admins tab. If
 *   they're not listed, the edit is reverted and nothing happens.
 * - If approved, the book becomes "Borrowed" with a due date — a
 *   CustomDueDate if one was given, otherwise today + the Config tab's
 *   LoanDays. If denied, the book goes back to "Available". Either way
 *   the scanning app — which polls automatically — updates within a
 *   few seconds.
 * - Returning a borrowed book is immediate and never needs approval,
 *   and is never blocked by the borrow limit.
 * - Exception: when an admin (signed in through the separate admin
 *   login) is the one doing the scanning — whether for themself or,
 *   via the Users screen's "Use for scan", on behalf of a patron they
 *   looked up — the borrow is approved immediately instead of going
 *   to Pending. An admin scanning a book is already the same
 *   authority that would otherwise approve it moments later, so
 *   there's no separate approval step to skip. The borrow limit
 *   check still applies.
 * -----------------------------------------------------
 */

const SHEET_ID = ''; // leave blank if script is bound to the sheet
const BOOKS_SHEET = 'Books';
const TX_SHEET = 'Transactions';
const ADMINS_SHEET = 'Admins';
const APPROVALS_SHEET = 'Approvals';
const CONFIG_SHEET = 'Config';
const USERS_SHEET = 'User List';
const LOAN_DAYS = 14;
const MAX_BORROW_ITEMS = 4;
const SITE_ACCESS_TTL_HOURS = 24;
const APPROVAL_DECISION_COL = 7; // Approvals sheet: column G
// Books sheet column layout: ItemID, Title, Author, Group, Status,
// BorrowerName, BorrowerContact, BorrowDate, DueDate, BorrowCount.
// Group sits right after Author (see migrateBooksAddGroupColumn_ for
// sheets created before this column existed) — every column from
// Status onward is one index later than it used to be, so this
// constant (and every data[row][n] / getRange(row, n, ...) reference
// to those columns throughout this file) accounts for that shift.
const BORROW_COUNT_COL = 10; // Books sheet: column J

function getSS() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function setupSheets() {
  const ss = getSS();
  let books = ss.getSheetByName(BOOKS_SHEET);
  if (!books) {
    books = ss.insertSheet(BOOKS_SHEET);
    books.appendRow(['ItemID', 'Title', 'Author', 'Group', 'Status', 'BorrowerName', 'BorrowerContact', 'BorrowDate', 'DueDate', 'BorrowCount']);
    books.setFrozenRows(1);
    applyBookGroupValidation_(books);
  } else {
    const header = books.getRange(1, 1, 1, 4).getValues()[0];
    if (String(header[3]).trim() !== 'Group') {
      // Existing tab from before the Group column existed — this needs
      // the one-time migrateBooksAddGroupColumn_ (inserting a column
      // shifts every row's existing data, which isn't something to do
      // as a side effect of a generic "make sure the tabs exist" call).
      // Leave BorrowCount's header alone too: on an unmigrated sheet it's
      // still one column to the left of BORROW_COUNT_COL, so "fixing" it
      // at today's column constant would just mislabel the wrong cell.
    } else if (String(books.getRange(1, BORROW_COUNT_COL).getValue()).trim() !== 'BorrowCount') {
      // Existing tab from before BorrowCount existed — add the header
      // without touching any existing rows or their data (existing rows'
      // counts just start at blank/0 going forward).
      books.getRange(1, BORROW_COUNT_COL).setValue('BorrowCount');
    }
  }

  let tx = ss.getSheetByName(TX_SHEET);
  if (!tx) {
    tx = ss.insertSheet(TX_SHEET);
    tx.appendRow(['Timestamp', 'ItemID', 'Title', 'Action', 'BorrowerName', 'BorrowerContact']);
    tx.setFrozenRows(1);
  }

  // Every tab here is safe to re-run: existing sheets are never
  // cleared, only created (and headers self-healed) if missing — so
  // running setupSheets again never wipes your books, transaction
  // history, admin list, approvals, or roster.
  let admins = ss.getSheetByName(ADMINS_SHEET);
  if (!admins) {
    admins = ss.insertSheet(ADMINS_SHEET);
    admins.appendRow(['Email', 'Name']);
    admins.setFrozenRows(1);
  }

  let approvals = ss.getSheetByName(APPROVALS_SHEET);
  if (!approvals) {
    approvals = ss.insertSheet(APPROVALS_SHEET);
    approvals.appendRow(['RequestID', 'Timestamp', 'ItemID', 'Title', 'RequesterName', 'RequesterContact', 'Decision', 'DecidedBy', 'DecidedAt', 'CustomDueDate']);
    approvals.setFrozenRows(1);
  } else if (String(approvals.getRange(1, 10).getValue()).trim() !== 'CustomDueDate') {
    // Existing tab from before CustomDueDate existed — add the header
    // without touching any existing rows.
    approvals.getRange(1, 10).setValue('CustomDueDate');
  }
  applyApprovalValidation_(approvals, 2, 1000);

  let users = ss.getSheetByName(USERS_SHEET);
  if (!users) {
    users = ss.insertSheet(USERS_SHEET);
    users.appendRow(['Class', 'Name', 'Parent1', 'Parent2']);
    users.setFrozenRows(1);
  }
}

// Reads the Config tab's BookGroups row (a comma-separated list, e.g.
// "Fiction, Non-fiction, Picture Books") into an array of trimmed,
// non-empty group names — the one canonical list behind both the Books
// sheet's Group dropdown (applyBookGroupValidation_) and the web app's
// Group filter (getPublicConfig). Edit that Config row any time; re-run
// "Refresh book Group dropdown" from the 📚 Library menu afterward to
// update the Sheet-side dropdown to match (the app's filter picks up
// the new list on its next load, no menu action needed there).
function getBookGroups_() {
  const cfg = getConfig();
  return String(cfg.BookGroups || '')
    .split(',')
    .map(function (g) { return g.trim(); })
    .filter(Boolean);
}

// Applies (or refreshes) the Group column's dropdown so admins editing
// the Sheet directly get a consistent list instead of free text. Blank
// stays a valid choice (an uncategorized book), and an already-set
// value that's since been removed from the Config list is left alone —
// this only changes what NEW entries are offered/accepted going forward.
function applyBookGroupValidation_(sh) {
  // Refuses to touch column D unless it's actually the Group column —
  // without this, running this on a sheet that hasn't been migrated yet
  // (see migrateBooksAddGroupColumn_) would slap this dropdown onto
  // whatever column D currently is (Status, on an unmigrated sheet),
  // which is exactly the mistake this check exists to catch.
  if (String(sh.getRange(1, 4).getValue()).trim() !== 'Group') {
    throw new Error('Column D is not "Group" yet — run migrateBooksAddGroupColumn_ once first (see its comment), then try again.');
  }
  const groups = getBookGroups_();
  const range = sh.getRange(2, 4, Math.max(sh.getMaxRows() - 1, 1), 1);
  if (!groups.length) { range.clearDataValidations(); return; }
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(groups, true)
    .setAllowInvalid(false)
    .build();
  range.setDataValidation(rule);
}

// Wired to the 📚 Library menu's "Refresh book Group dropdown" item —
// run this after editing the Config tab's BookGroups row so the Sheet's
// dropdown picks up the change without needing the bigger migration
// function again.
function refreshBookGroupDropdown() {
  const sh = getSS().getSheetByName(BOOKS_SHEET);
  if (!sh) return;
  applyBookGroupValidation_(sh);
}

/**
 * One-time migration for a Books tab created before the Group column
 * existed (see BORROW_COUNT_COL's comment for the current column
 * layout). Inserts a new column right after Author — Sheets shifts
 * every existing row's Status-onward data over by one automatically,
 * the same as if you'd inserted it by hand — sets its header to
 * "Group", and applies the dropdown described in
 * applyBookGroupValidation_. Safe to run more than once: does nothing
 * if the sheet already has a Group column in that position.
 */
function migrateBooksAddGroupColumn_() {
  const ss = getSS();
  const sh = ss.getSheetByName(BOOKS_SHEET);
  if (!sh) { setupSheets(); return; }
  const header = sh.getRange(1, 1, 1, 4).getValues()[0];
  if (String(header[3]).trim() === 'Group') return; // already migrated
  sh.insertColumnAfter(3);
  sh.getRange(1, 4).setValue('Group');
  applyBookGroupValidation_(sh);
}

/**
 * One-time migration for a User List tab created before Parent1/Parent2
 * replaced Parent/Email/Phone. Run this once if your sheet still has
 * the old header — safe to run more than once (does nothing if already
 * migrated), and does not touch Class/Name/Parent data.
 *
 * Old: Class, Name, Parent,  Email, Phone
 * New: Class, Name, Parent1, Parent2
 *
 * "Parent" becomes "Parent1" in place; a new blank "Parent2" column is
 * inserted where Email used to be; the old Email and Phone columns are
 * then deleted. If you had a second guardian's contact info in Email or
 * Phone, move it into Parent2 as that guardian's name before running
 * this, since those columns are deleted, not preserved elsewhere.
 */
function migrateUserListSchema() {
  const ss = getSS();
  const sh = ss.getSheetByName(USERS_SHEET);
  if (!sh) { setupSheets(); return; }

  const lastCol = Math.max(sh.getLastColumn(), 5);
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

  if (header[0] === 'Class' && header[1] === 'Name' && header[2] === 'Parent1' && header[3] === 'Parent2') {
    return; // already migrated
  }

  if (header[0] === 'Class' && header[1] === 'Name' && header[2] === 'Parent' && header[3] === 'Email' && header[4] === 'Phone') {
    sh.getRange(1, 3).setValue('Parent1');
    sh.insertColumnAfter(3);
    sh.getRange(1, 4).setValue('Parent2');
    // Columns shifted right by the insert: Email is now column E (5), Phone is F (6).
    sh.deleteColumn(6);
    sh.deleteColumn(5);
    return;
  }

  throw new Error('User List header does not match the expected old or new schema — check it by hand before migrating.');
}

function applyApprovalValidation_(sh, startRow, numRows) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Approve', 'Deny'], true)
    .setAllowInvalid(false)
    .build();
  sh.getRange(startRow, APPROVAL_DECISION_COL, numRows, 1).setDataValidation(rule);
}

// Safe to run any time, including after books/transactions already have
// data — unlike setupSheets, this never clears an existing sheet.
function setupConfigSheet() {
  const ss = getSS();
  let sh = ss.getSheetByName(CONFIG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG_SHEET);
    sh.appendRow(['Key', 'Value']);
    sh.setFrozenRows(1);
  } else if (String(sh.getRange(1, 1).getValue()).trim() !== 'Key') {
    // Tab already existed without the Key/Value header — insert one
    // above the existing rows instead of clearing anything.
    sh.insertRowBefore(1);
    sh.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]);
    sh.setFrozenRows(1);
  }
  const data = sh.getDataRange().getValues();
  const existingKeys = {};
  for (let i = 1; i < data.length; i++) existingKeys[String(data[i][0]).trim()] = true;

  const defaults = {
    LoanDays: String(LOAN_DAYS),
    MaxBorrowItems: String(MAX_BORROW_ITEMS),
    AdminSecret: 'changeme',
    SiteAccessCode: 'changeme-site-code',
    SiteAccessTTLHours: String(SITE_ACCESS_TTL_HOURS),
    SiteUrl: 'https://tetsuya-tsukada.github.io/library-app/',
    PatronLoginEnabled: 'TRUE',
    BookGroups: 'Fiction, Non-fiction, Picture Books, Reference'
  };
  Object.keys(defaults).forEach(key => {
    if (!existingKeys[key]) sh.appendRow([key, defaults[key]]);
  });
}

// Shared passcode all admins use, on top of their email, to sign in
// through the separate admin login. Change it any time in the Config
// tab — takes effect immediately, no redeploy.
function getAdminSecret_() {
  const cfg = getConfig();
  return String(cfg.AdminSecret || '').trim();
}

// Reads the loan period from the Config tab (LoanDays), falling back to
// the LOAN_DAYS constant if the key is missing, blank, or not a number —
// so an empty/misconfigured cell can't silently break borrowing.
function getLoanDays_() {
  const cfg = getConfig();
  const days = parseInt(cfg.LoanDays, 10);
  return (!isNaN(days) && days > 0) ? days : LOAN_DAYS;
}

// Same fallback treatment as getLoanDays_(), for the per-person borrow cap.
function getMaxBorrowItems_() {
  const cfg = getConfig();
  const max = parseInt(cfg.MaxBorrowItems, 10);
  return (!isNaN(max) && max > 0) ? max : MAX_BORROW_ITEMS;
}

// The whole-site access code — see "HOW SITE ACCESS WORKS" above. Never
// hand this back through getPublicConfig()/action=getConfig; it's only
// ever compared against, never read out, by anything reachable without
// already having a valid code (see isValidSiteCode_/verifySiteCode).
function getSiteAccessCode_() {
  const cfg = getConfig();
  return String(cfg.SiteAccessCode || '').trim();
}

// Same fallback treatment as getLoanDays_(), for how long a device stays
// unlocked after scanning before it needs to scan again.
function getSiteAccessTTLHours_() {
  const cfg = getConfig();
  const hours = parseInt(cfg.SiteAccessTTLHours, 10);
  return (!isNaN(hours) && hours > 0) ? hours : SITE_ACCESS_TTL_HOURS;
}

// The deployed web app's URL — lets the site access QR encode a direct
// link (see openSiteAccessQrDialog) instead of just the bare code, so
// scanning it with an ordinary phone camera app opens the site already
// unlocked, no need to open the app first and use its in-app scanner.
function getSiteUrl_() {
  const cfg = getConfig();
  return String(cfg.SiteUrl || '').trim();
}

// Fails closed: if SiteAccessCode hasn't been set up yet, nothing gets
// in — same as adminLogin when AdminSecret is blank — rather than
// silently leaving the whole app open just because setup isn't finished.
function isValidSiteCode_(code) {
  const expected = getSiteAccessCode_();
  return !!expected && !!code && String(code).trim() === expected;
}

// Entry point for the site-wide access gate (index.html's
// toggleGateScanner/onGateScanSuccess) — deliberately the only doGet
// action that doesn't itself require an already-valid siteCode (see
// doGet below), otherwise nobody could ever get in in the first place.
// The code itself never expires or rotates on its own; only a device's
// local copy of it does, after ttlHours — see index.html's
// saveSiteAccess_/loadSiteAccess_.
function verifySiteCode(code) {
  if (!isValidSiteCode_(code)) return { error: 'Invalid security code' };
  return { ok: true, ttlHours: getSiteAccessTTLHours_() };
}

// getConfig() below returns everything in the Config tab verbatim,
// including AdminSecret and SiteAccessCode — fine for internal callers,
// but action=getConfig is public and unauthenticated, so it must only
// ever hand back this filtered subset instead.
function getPublicConfig() {
  const cfg = getConfig();
  return { LoanDays: cfg.LoanDays, MaxBorrowItems: cfg.MaxBorrowItems, PatronLoginEnabled: cfg.PatronLoginEnabled, BookGroups: cfg.BookGroups || '' };
}

function getConfig() {
  const sh = getSS().getSheetByName(CONFIG_SHEET);
  if (!sh) return {};
  const data = sh.getDataRange().getValues();
  if (!data.length) return {};
  // Skip row 1 only if it's actually the Key/Value header — tolerates a
  // Config tab that was created without one.
  const startRow = String(data[0][0]).trim() === 'Key' ? 1 : 0;
  const cfg = {};
  for (let i = startRow; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    if (key) cfg[key] = data[i][1];
  }
  return cfg;
}

function installApprovalTrigger() {
  const ss = getSS();
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onApprovalEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onApprovalEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
}

// Simple trigger — runs automatically whenever the Sheet is opened, no
// installable trigger needed. Adds the menu used to print QR labels.
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('📚 Library')
    .addItem('Print QR labels', 'openPrintLabelsDialog')
    .addItem('Print site access QR code', 'openSiteAccessQrDialog')
    .addItem('Regenerate site access code', 'regenerateSiteAccessCode')
    .addItem('Refresh book Group dropdown', 'refreshBookGroupDropdown')
    .addToUi();
}

// If one or more Books rows are selected when "Print QR labels" is run,
// only those rows print — so adding one new book doesn't mean reprinting
// the whole catalog. A single-cell selection (just clicking somewhere,
// the normal state right after opening the sheet) doesn't count as an
// intentional selection and falls back to printing everything.
function getSelectedBookIds_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== BOOKS_SHEET) return [];
  const range = ss.getActiveRange();
  if (!range) return [];
  if (range.getNumRows() === 1 && range.getNumColumns() === 1) return [];

  const startRow = range.getRow();
  const lastRow = startRow + range.getNumRows() - 1;
  const firstDataRow = Math.max(startRow, 2); // never treat the header row as a book
  if (lastRow < firstDataRow) return [];

  const ids = [];
  for (let r = firstDataRow; r <= lastRow; r++) {
    const id = sheet.getRange(r, 1).getValue();
    if (id) ids.push(String(id).trim());
  }
  return ids;
}

function openPrintLabelsDialog() {
  const { books: allBooks } = listBooks();
  const selectedIds = getSelectedBookIds_();
  const books = selectedIds.length
    ? allBooks.filter(b => selectedIds.indexOf(String(b.ItemID || '').trim()) !== -1)
    : allBooks;
  const items = books.map(b => ({ itemId: String(b.ItemID || ''), title: String(b.Title || '') }));
  // Guard against breaking out of the <script> tag if a title ever contained "</script".
  const json = JSON.stringify(items).replace(/</g, '\\u003c');
  const template = HtmlService.createTemplate(PRINT_LABELS_HTML);
  template.booksJson = json;
  const html = template.evaluate().setWidth(760).setHeight(600);
  const title = selectedIds.length
    ? 'Print QR labels (' + books.length + ' selected)'
    : 'Print QR labels (all ' + books.length + ')';
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

const PRINT_LABELS_HTML = `<!DOCTYPE html>
<html><head>
<base target="_top">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
  body{font-family:sans-serif;margin:0;padding:16px;}
  .toolbar{margin-bottom:14px;}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}
  /* flexbox, not text-align, because the QR library can render a block-
     level element (e.g. a <table> of modules) that text-align alone
     won't center */
  .lab{
    border:1px dashed #999;border-radius:4px;padding:10px;
    display:flex;flex-direction:column;align-items:center;
    page-break-inside:avoid;
  }
  .lab .t{font-size:11px;font-weight:600;margin:6px 0 2px;line-height:1.2;text-align:center;}
  .lab .i{font-family:monospace;font-size:9px;color:#666;text-align:center;}
  @media print { .toolbar{ display:none; } }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print</button></div>
  <div class="grid" id="g"></div>
  <script>
    const books = <?!= booksJson ?>;
    const g = document.getElementById('g');
    books.forEach(b => {
      const cell = document.createElement('div');
      cell.className = 'lab';
      const qr = document.createElement('div');
      qr.className = 'qr-' + b.itemId.replace(/[^a-zA-Z0-9-]/g, '');
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = b.title;
      const i = document.createElement('div');
      i.className = 'i';
      i.textContent = b.itemId;
      cell.appendChild(qr); cell.appendChild(t); cell.appendChild(i);
      g.appendChild(cell);
    });
    window.addEventListener('load', () => {
      books.forEach(b => {
        const holder = document.querySelector('.qr-' + b.itemId.replace(/[^a-zA-Z0-9-]/g, ''));
        if (holder && window.QRCode) new QRCode(holder, { text: b.itemId, width: 80, height: 80 });
      });
    });
  </script>
</body></html>`;

// A 32-character mix of letters, digits, and symbols — plenty of entropy
// for a shared secret, and printed only as a QR code so nobody ever
// needs to type or read it out loud. Excludes 0/O/1/l/I purely so a
// human proofreading the Config cell isn't tripped up by look-alikes;
// scanning doesn't care either way.
function generateSiteAccessCode_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789~!@#$%^&*()-_=+[]{}<>?|';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// Overwrites Config's SiteAccessCode with a fresh random value — e.g.
// after a printout goes missing, or just as routine hygiene. This is
// immediate and global: it invalidates every device currently unlocked
// with the old code (not just new logins — see isValidSiteCode_, which
// always checks against whatever's in Config right now), not only new
// printouts, so it asks for confirmation first. Run "Print site access
// QR code" again right after to get a QR for the new value; the old
// printout stops working the moment this runs.
function regenerateSiteAccessCode() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Regenerate site access code?',
    'This immediately blocks every device currently unlocked with the old code — including this one — until it scans the new QR. Run "Print site access QR code" again right after to print the replacement. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  const sh = getSS().getSheetByName(CONFIG_SHEET);
  if (!sh) {
    ui.alert('Run setupConfigSheet first, then try again.');
    return;
  }
  const data = sh.getDataRange().getValues();
  let rowNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'SiteAccessCode') { rowNum = i + 1; break; }
  }
  const newCode = generateSiteAccessCode_();
  if (rowNum === -1) {
    sh.appendRow(['SiteAccessCode', newCode]);
  } else {
    sh.getRange(rowNum, 2).setValue(newCode);
  }
  ui.alert('New site access code generated. Use "Print site access QR code" now to print and post the replacement.');
}

// Generates a QR code for the site access code, meant to be printed and
// posted only somewhere that already requires physical presence to
// reach (e.g. inside the library room itself) — see "HOW SITE ACCESS
// WORKS" above. Deliberately only reachable from here, not from the web
// app, so producing a fresh printout always requires someone with edit
// access to this Sheet.
//
// When SiteUrl (Config tab) is set, the QR encodes a direct link
// (SiteUrl + ?code=...) instead of the bare code — scanning it with an
// ordinary phone camera app opens the site already unlocked, no need to
// open the app first and use its in-app scanner. Falls back to the bare
// code if SiteUrl is blank; the app's in-app scanner understands both.
function openSiteAccessQrDialog() {
  const code = getSiteAccessCode_();
  if (!code) {
    SpreadsheetApp.getUi().alert('Set a SiteAccessCode value in the Config tab first (run setupConfigSheet if the row is missing), then try again.');
    return;
  }
  const siteUrl = getSiteUrl_();
  const qrText = siteUrl
    ? siteUrl + (siteUrl.indexOf('?') === -1 ? '?' : '&') + 'code=' + encodeURIComponent(code)
    : code;
  const ttlHours = getSiteAccessTTLHours_();
  const template = HtmlService.createTemplate(SITE_ACCESS_QR_HTML);
  template.qrTextJson = JSON.stringify(qrText).replace(/</g, '\\u003c');
  template.ttlHours = ttlHours;
  const html = template.evaluate().setWidth(420).setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(html, 'Site access QR code');
}

const SITE_ACCESS_QR_HTML = `<!DOCTYPE html>
<html><head>
<base target="_top">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
  body{font-family:sans-serif;margin:0;padding:20px;text-align:center;}
  .toolbar{margin-bottom:14px;}
  #qr{display:flex;justify-content:center;margin:16px 0;}
  .note{font-size:12px;color:#666;margin-top:10px;line-height:1.4;text-align:left;}
  @media print { .toolbar{ display:none; } }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print</button></div>
  <h3>Scan to unlock Stacks</h3>
  <div id="qr"></div>
  <p class="note">Post this only where patrons already have physical access (e.g. inside the library room) — scanning it with an ordinary phone camera opens the site already unlocked, no need to open the app first. Unlocks that device for <?!= ttlHours ?> hour(s), then it needs to scan again. Changing SiteAccessCode in the Config tab makes any old printouts stop working immediately.</p>
  <script>
    window.addEventListener('load', () => {
      new QRCode(document.getElementById('qr'), { text: <?!= qrTextJson ?>, width: 220, height: 220 });
    });
  </script>
</body></html>`;

function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    // Every action except verifySiteCode itself requires a valid,
    // currently-configured site access code — see "HOW SITE ACCESS
    // WORKS" above. This runs before the switch below on purpose, so
    // adding a new case here can never accidentally skip the gate.
    if (action !== 'verifySiteCode' && !isValidSiteCode_(e.parameter.siteCode)) {
      result = { error: 'Security code required — scan the QR code posted in the library room.' };
    } else {
      switch (action) {
        case 'lookup':
          result = lookupBook(e.parameter.itemId);
          break;
        case 'scan':
          result = scanBook(e.parameter.itemId, e.parameter.name, e.parameter.contact, e.parameter.adminEmail);
          break;
        case 'scanBatch':
          result = scanBookBatch(e.parameter.items, e.parameter.adminEmail);
          break;
        case 'list':
          result = listBooks();
          break;
        case 'addBook':
          result = addBook(e.parameter.itemId, e.parameter.title, e.parameter.author);
          break;
        case 'myLoans':
          result = myLoans(e.parameter.names);
          break;
        case 'getSummary':
          result = getSummary(e.parameter.adminEmail);
          break;
        case 'checkApproval':
          result = checkApproval(e.parameter.requestId);
          break;
        case 'getConfig':
          result = getPublicConfig();
          break;
        case 'searchUsers':
          result = searchUsers(e.parameter.query);
          break;
        case 'adminLogin':
          result = adminLogin(e.parameter.email, e.parameter.secret);
          break;
        case 'verifyAdmin':
          result = verifyAdmin(e.parameter.email);
          break;
        case 'listApprovals':
          result = listPendingApprovals(e.parameter.adminEmail);
          break;
        case 'approveRequest':
          result = approveRequest(e.parameter.requestId, e.parameter.decision || 'Approve', e.parameter.adminEmail, e.parameter.dueDate);
          break;
        case 'approveAll':
          result = approveAllPending(e.parameter.adminEmail);
          break;
        case 'verifySiteCode':
          result = verifySiteCode(e.parameter.code);
          break;
        default:
          result = { error: 'Unknown action' };
      }
    }
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getBooksSheet_() {
  const sh = getSS().getSheetByName(BOOKS_SHEET);
  const data = sh.getDataRange().getValues();
  // Guards against this version of the code running against a sheet that
  // hasn't had the one-time Group column migration yet (see
  // migrateBooksAddGroupColumn_). Every column from Status onward moved
  // over by one when Group was inserted — every row read/write below
  // assumes that new layout, so hitting an unmigrated sheet would
  // silently corrupt Status/BorrowerName/etc. on the very next scan
  // instead of failing loudly like this. Only fires on a sheet that
  // actually looks like real book data (a header row plus at least one
  // more row) — an empty/uninitialized sheet is left to setupSheets.
  if (data.length > 1 && String(data[0][0]).trim() === 'ItemID' && String(data[0][3]).trim() !== 'Group') {
    throw new Error('Books sheet needs a one-time migration before this deployment can be used — run migrateBooksAddGroupColumn_ once from the Apps Script editor (select it in the function dropdown, click Run), then try again.');
  }
  return { sh, data, header: data[0] };
}

function findRow_(data, itemId) {
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(itemId).trim()) return i;
  }
  return -1;
}

function lookupBook(itemId) {
  if (!itemId) return { error: 'Missing itemId' };
  const { data } = getBooksSheet_();
  const row = findRow_(data, itemId);
  if (row === -1) return { error: 'Book not found', itemId };
  const [id, title, author, , status, name, contact, borrowDate, dueDate] = data[row]; // 4th slot (Group) intentionally unused here — not needed during scanning
  return {
    itemId: id, title, author,
    status: status || 'Available',
    borrowerName: name, borrowerContact: contact,
    borrowDate, dueDate
  };
}

// adminEmail (optional): when set and listed in the Admins tab, a borrow is
// approved immediately instead of going to Pending — an admin scanning a
// book (for themself or, via "Use for scan", for a patron they looked up)
// is already the same authority that would otherwise approve it a moment
// later, so the extra Pending round-trip is just friction.
function scanBook(itemId, name, contact, adminEmail) {
  if (!itemId) return { error: 'Missing itemId' };
  const { sh, data } = getBooksSheet_();
  const row = findRow_(data, itemId);
  if (row === -1) return { error: 'Book not found', itemId };

  const title = data[row][1];
  const currentStatus = data[row][4] || 'Available';
  const now = new Date();
  const rowNum = row + 1; // 1-indexed for sheet API
  const isAdminScan = !!adminEmail && isAdmin_(adminEmail);

  if (currentStatus === 'Available') {
    // BORROW REQUEST — locks the book as Pending until an admin approves it
    // (skipped entirely for an admin-initiated scan, see isAdminScan above)
    if (!name) return { error: 'Name required to borrow' };
    const maxItems = getMaxBorrowItems_();
    const activeCount = countActiveLoans_(name);
    if (activeCount >= maxItems) {
      return { error: 'Borrow limit reached (' + maxItems + ' items). Return a book before borrowing another.' };
    }
    if (isAdminScan) {
      const due = new Date(now.getTime() + getLoanDays_() * 24 * 60 * 60 * 1000);
      sh.getRange(rowNum, 5, 1, 5).setValues([['Borrowed', name, contact || '', now, due]]);
      logTx_(itemId, title, 'Borrow', name, contact);
      incrementBorrowCount_(sh, rowNum);
      return { action: 'borrow', itemId, title, borrowerName: name, dueDate: due };
    }
    const requestId = itemId + '-' + now.getTime();
    sh.getRange(rowNum, 5, 1, 5).setValues([['Pending', name, contact || '', now, '']]);
    appendApprovalRequest_(requestId, itemId, title, name, contact);
    return { action: 'pending', itemId, title, requestId };
  } else if (currentStatus === 'Pending') {
    // Already awaiting approval — hand back the existing request so the app can keep polling it
    const requestId = findPendingRequestId_(itemId);
    return { action: 'pending', itemId, title, requestId };
  } else {
    // RETURN — always immediate, never needs approval
    const prevName = data[row][5];
    const prevContact = data[row][6];
    sh.getRange(rowNum, 5, 1, 5).setValues([['Available', '', '', '', '']]);
    logTx_(itemId, title, 'Return', prevName, prevContact);
    return { action: 'return', itemId, title, borrowerName: prevName };
  }
}

// Same per-item borrow/return/pending rules as scanBook above, but for a
// whole batch of scans (see index.html's commitScanQueue/
// commitReturnQueue) in one shot. Scanning several books used to mean one
// full Books-sheet read plus one write (plus another read inside
// countActiveLoans_) per book — each a separate round trip to the Sheets
// service, which is the slow part, not the lookup logic itself. This
// reads the sheet once, applies every item to the in-memory data, then
// writes back only the rows that actually changed (grouped into
// contiguous runs so a batch of adjacent rows is still just one write) —
// never touching rows this batch didn't modify, so a concurrent edit to
// some other book isn't clobbered by a stale re-write of the whole sheet.
// Transactions/Approvals rows are appended the same way: one batched
// append each instead of one per item.
function scanBookBatch(itemsJson, adminEmail) {
  let items;
  try {
    items = JSON.parse(itemsJson || '[]');
  } catch (e) {
    return { error: 'Malformed items payload' };
  }
  if (!Array.isArray(items) || !items.length) return { error: 'No items to process' };

  const { sh, data } = getBooksSheet_();
  const now = new Date();
  const isAdminScan = !!adminEmail && isAdmin_(adminEmail);
  const maxItems = getMaxBorrowItems_();

  // Running in-memory active-loan counts per name, seeded from the sheet
  // once and adjusted as the batch is simulated — so borrowing several
  // books for the same person in one batch enforces the limit across the
  // whole batch, not just against the pre-batch snapshot.
  const activeCounts = {};
  for (let i = 1; i < data.length; i++) {
    const status = data[i][4];
    const bName = String(data[i][5] || '').trim().toLowerCase();
    if ((status === 'Borrowed' || status === 'Pending') && bName) {
      activeCounts[bName] = (activeCounts[bName] || 0) + 1;
    }
  }

  const touchedRows = []; // indices into `data` whose columns E:J changed
  const txRows = [];
  const approvalRows = [];
  const results = [];

  items.forEach(item => {
    const itemId = item.itemId;
    const name = item.name || '';
    const contact = item.contact || '';
    const row = findRow_(data, itemId);
    if (row === -1) { results.push({ itemId, error: 'Book not found' }); return; }
    const title = data[row][1];
    const currentStatus = data[row][4] || 'Available';

    if (currentStatus === 'Available') {
      if (!name) { results.push({ itemId, title, error: 'Name required to borrow' }); return; }
      const key = name.trim().toLowerCase();
      const activeCount = activeCounts[key] || 0;
      if (activeCount >= maxItems) {
        results.push({ itemId, title, error: 'Borrow limit reached (' + maxItems + ' items). Return a book before borrowing another.' });
        return;
      }
      activeCounts[key] = activeCount + 1;
      if (isAdminScan) {
        const due = new Date(now.getTime() + getLoanDays_() * 24 * 60 * 60 * 1000);
        data[row][4] = 'Borrowed'; data[row][5] = name; data[row][6] = contact || '';
        data[row][7] = now; data[row][8] = due;
        data[row][9] = (parseInt(data[row][9], 10) || 0) + 1;
        touchedRows.push(row);
        txRows.push([now, itemId, title, 'Borrow', name, contact]);
        results.push({ action: 'borrow', itemId, title, borrowerName: name, dueDate: due });
      } else {
        const requestId = itemId + '-' + now.getTime() + '-' + Math.floor(Math.random() * 1000);
        data[row][4] = 'Pending'; data[row][5] = name; data[row][6] = contact || '';
        data[row][7] = now; data[row][8] = '';
        touchedRows.push(row);
        approvalRows.push([requestId, now, itemId, title, name, contact || '', 'Pending', '', '', '']);
        results.push({ action: 'pending', itemId, title, requestId });
      }
    } else if (currentStatus === 'Pending') {
      // Already awaiting approval — hand back the existing request so the app can keep polling it
      const requestId = findPendingRequestId_(itemId);
      results.push({ action: 'pending', itemId, title, requestId });
    } else {
      // RETURN — always immediate, never needs approval
      const prevName = data[row][5];
      const prevContact = data[row][6];
      data[row][4] = 'Available'; data[row][5] = ''; data[row][6] = '';
      data[row][7] = ''; data[row][8] = '';
      touchedRows.push(row);
      txRows.push([now, itemId, title, 'Return', prevName, prevContact]);
      results.push({ action: 'return', itemId, title, borrowerName: prevName });
    }
  });

  touchedRows.sort(function (a, b) { return a - b; });
  let i = 0;
  while (i < touchedRows.length) {
    let j = i;
    while (j + 1 < touchedRows.length && touchedRows[j + 1] === touchedRows[j] + 1) j++;
    const startRow = touchedRows[i]; // index into `data`; sheet row = startRow + 1
    const count = j - i + 1;
    const values = [];
    for (let k = 0; k < count; k++) {
      const r = data[startRow + k];
      values.push([r[4], r[5], r[6], r[7], r[8], r[9]]);
    }
    sh.getRange(startRow + 1, 5, count, 6).setValues(values); // columns E:J
    i = j + 1;
  }
  if (txRows.length) {
    const txSh = getSS().getSheetByName(TX_SHEET);
    txSh.getRange(txSh.getLastRow() + 1, 1, txRows.length, 6).setValues(txRows);
  }
  if (approvalRows.length) {
    const apSh = getSS().getSheetByName(APPROVALS_SHEET);
    const startRow = apSh.getLastRow() + 1;
    apSh.getRange(startRow, 1, approvalRows.length, approvalRows[0].length).setValues(approvalRows);
    applyApprovalValidation_(apSh, startRow, approvalRows.length);
  }

  return { results: results };
}

// Books currently Borrowed or Pending under this name, counted against
// MaxBorrowItems before a new borrow request is allowed. Deliberately
// keyed on name rather than contact: siblings signing in as a parent
// share the same phone/email, so counting by contact would pool the
// whole family into one limit instead of giving each child their own.
function countActiveLoans_(name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return 0;
  const { data } = getBooksSheet_();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const status = data[i][4];
    const bName = String(data[i][5] || '').trim().toLowerCase();
    if ((status === 'Borrowed' || status === 'Pending') && bName === target) count++;
  }
  return count;
}

function logTx_(itemId, title, action, name, contact) {
  const sh = getSS().getSheetByName(TX_SHEET);
  sh.appendRow([new Date(), itemId, title, action, name || '', contact || '']);
}

// Bumped once per completed borrow — an admin's immediate scan, or a
// patron's request once approved — never on a return, so it tracks
// lifetime times-borrowed rather than current status. Lets you sort the
// Books tab by BorrowCount to see what's actually popular.
function incrementBorrowCount_(sh, rowNum) {
  const cell = sh.getRange(rowNum, BORROW_COUNT_COL);
  const current = parseInt(cell.getValue(), 10);
  cell.setValue((isNaN(current) ? 0 : current) + 1);
}

function getApprovalsSheet_() {
  const sh = getSS().getSheetByName(APPROVALS_SHEET);
  const data = sh.getDataRange().getValues();
  return { sh, data, header: data[0] };
}

function findApprovalRow_(data, requestId) {
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(requestId).trim()) return i;
  }
  return -1;
}

function appendApprovalRequest_(requestId, itemId, title, name, contact) {
  const sh = getSS().getSheetByName(APPROVALS_SHEET);
  sh.appendRow([requestId, new Date(), itemId, title, name, contact || '', 'Pending', '', '', '']);
  applyApprovalValidation_(sh, sh.getLastRow(), 1);
}

function findPendingRequestId_(itemId) {
  const { data } = getApprovalsSheet_();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][2]).trim() === String(itemId).trim() && data[i][6] === 'Pending') return data[i][0];
  }
  return '';
}

function checkApproval(requestId) {
  if (!requestId) return { error: 'Missing requestId' };
  const { data } = getApprovalsSheet_();
  const row = findApprovalRow_(data, requestId);
  if (row === -1) return { error: 'Request not found' };
  const itemId = data[row][2];
  const title = data[row][3];
  const requesterName = data[row][4];
  const decision = data[row][6];

  if (decision === 'Approve') {
    const { data: books } = getBooksSheet_();
    const bRow = findRow_(books, itemId);
    const borrowerName = bRow !== -1 ? books[bRow][5] : requesterName;
    const dueDate = bRow !== -1 ? books[bRow][8] : null;
    return { status: 'approved', itemId, title, borrowerName, dueDate };
  }
  if (decision === 'Deny') {
    return { status: 'denied', itemId, title };
  }
  return { status: 'pending', itemId, title };
}

/**
 * Installable onEdit trigger (see installApprovalTrigger). Fires when
 * anyone edits the Approvals sheet's Decision column and enforces that
 * only emails listed in the Admins tab can approve or deny a request.
 */
function onApprovalEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== APPROVALS_SHEET) return;
    if (e.range.getRow() === 1 || e.range.getColumn() !== APPROVAL_DECISION_COL) return;

    const newValue = String(e.value || '').trim();
    if (newValue !== 'Approve' && newValue !== 'Deny') return; // ignore reverts back to Pending/blank

    const email = Session.getActiveUser().getEmail();
    if (!email || !isAdmin_(email)) {
      e.range.setValue(e.oldValue || 'Pending');
      SpreadsheetApp.getActive().toast('Only admins listed in the Admins tab can approve or deny borrow requests.', 'Not authorized', 6);
      return;
    }

    applyApprovalDecision_(sh, e.range.getRow(), newValue, email);
  } catch (err) {
    SpreadsheetApp.getActive().toast('Approval processing error: ' + err.message, 'Error', 6);
  }
}

/**
 * Shared by the Sheet's onEdit trigger and the web app's approve
 * actions. `row` is the 1-indexed Approvals sheet row. Does not itself
 * check admin status — callers must verify that first.
 */
/**
 * overrideDueDate (optional): a date passed in from the web app's
 * approve action. If omitted, falls back to a CustomDueDate the admin
 * may have typed into the Approvals sheet row itself, then to
 * now + getLoanDays_() as the final default.
 */
function applyApprovalDecision_(sh, row, decision, adminEmail, overrideDueDate) {
  const rowData = sh.getRange(row, 1, 1, 10).getValues()[0];
  const itemId = rowData[2];
  const title = rowData[3];
  const requesterName = rowData[4];
  const requesterContact = rowData[5];
  const sheetCustomDue = rowData[9];

  const { sh: booksSh, data: books } = getBooksSheet_();
  const bRow = findRow_(books, itemId);
  const bookIsPending = bRow !== -1 && (books[bRow][4] || '') === 'Pending';

  if (decision === 'Approve' && bookIsPending) {
    const now = new Date();
    let due = null;
    if (overrideDueDate) {
      const d = new Date(overrideDueDate);
      if (!isNaN(d.getTime())) due = d;
    }
    if (!due && sheetCustomDue) {
      const d = new Date(sheetCustomDue);
      if (!isNaN(d.getTime())) due = d;
    }
    if (!due) due = new Date(now.getTime() + getLoanDays_() * 24 * 60 * 60 * 1000);

    booksSh.getRange(bRow + 1, 5, 1, 5).setValues([['Borrowed', requesterName, requesterContact || '', now, due]]);
    logTx_(itemId, title, 'Borrow', requesterName, requesterContact);
    incrementBorrowCount_(booksSh, bRow + 1);
  } else if (decision === 'Deny' && bookIsPending) {
    booksSh.getRange(bRow + 1, 5, 1, 5).setValues([['Available', '', '', '', '']]);
    logTx_(itemId, title, 'Deny', requesterName, requesterContact);
  }

  sh.getRange(row, APPROVAL_DECISION_COL, 1, 1).setValue(decision);
  sh.getRange(row, 8, 1, 2).setValues([[adminEmail, new Date()]]);
}

function listPendingApprovals(adminEmail) {
  if (!adminEmail || !isAdmin_(adminEmail)) return { error: 'Not authorized' };
  const { data } = getApprovalsSheet_();
  const approvals = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][6] === 'Pending') {
      approvals.push({
        requestId: data[i][0],
        timestamp: data[i][1],
        itemId: data[i][2],
        title: data[i][3],
        requesterName: data[i][4],
        requesterContact: data[i][5]
      });
    }
  }
  return { approvals };
}

function approveRequest(requestId, decision, adminEmail, dueDate) {
  if (!adminEmail || !isAdmin_(adminEmail)) return { error: 'Not authorized' };
  if (decision !== 'Approve' && decision !== 'Deny') return { error: 'Invalid decision' };
  if (!requestId) return { error: 'Missing requestId' };
  const { sh, data } = getApprovalsSheet_();
  const row = findApprovalRow_(data, requestId);
  if (row === -1) return { error: 'Request not found' };
  if (data[row][6] !== 'Pending') return { error: 'Request already decided' };
  applyApprovalDecision_(sh, row + 1, decision, adminEmail, dueDate);
  return { ok: true, requestId, decision };
}

function approveAllPending(adminEmail) {
  if (!adminEmail || !isAdmin_(adminEmail)) return { error: 'Not authorized' };
  const { sh, data } = getApprovalsSheet_();
  let approved = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][6] === 'Pending') {
      applyApprovalDecision_(sh, i + 1, 'Approve', adminEmail);
      approved++;
    }
  }
  return { ok: true, approved };
}

function isAdmin_(email) {
  const sh = getSS().getSheetByName(ADMINS_SHEET);
  const data = sh.getDataRange().getValues();
  const target = String(email).trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === target) return true;
  }
  return false;
}

function getUsersSheet_() {
  const sh = getSS().getSheetByName(USERS_SHEET);
  const data = sh.getDataRange().getValues();
  return { sh, data, header: data[0] };
}

function userRowToObject_(row) {
  return { class: row[0] || '', name: row[1] || '', parent1: row[2] || '', parent2: row[3] || '' };
}

// Normalized identity for a User List row, used to collapse an
// accidentally duplicated row (same person entered twice) in searchUsers.
function rowKey_(r) {
  return [r.class, r.name, r.parent1, r.parent2].map(v => String(v || '').trim().toLowerCase()).join('|');
}

/**
 * Patron sign-in and the admin Users lookup both go through this: a
 * loose, case-insensitive substring match against
 * Class/Name/Parent1/Parent2 (not an exact match — "yuki" matches "Yuki
 * Sato", etc). Every matching row is returned as an "individual"
 * candidate. Rows that share a non-empty Parent1 or Parent2 value also
 * produce one "parent" candidate per distinct parent name (checking
 * both columns, so either guardian gets their own group), listing every
 * child under that parent (not just the ones this particular query
 * matched), so a parent typing their own name sees all their kids
 * together and gets the option to sign in as themself instead of a
 * specific child.
 *
 * This no longer grants admin status — admins sign in through the
 * separate adminLogin action instead, which requires the shared
 * AdminSecret on top of a listed email. Otherwise anyone who merely
 * knew (or guessed) an admin's email could get admin access here with
 * no further proof.
 *
 * SECURITY NOTE: this action is intentionally public (it's the sign-in
 * entry point, called before anyone has proven who they are) and does
 * a loose substring match instead of requiring an exact identifier.
 * That means anyone who can reach the web app URL — published in this
 * public repo's index.html — can enumerate rows of this roster (names,
 * classes, parent names) without signing in, by trying short/common
 * substrings. The 2-character minimum and 25-result cap below raise the
 * bar slightly but don't prevent a determined, scripted attempt. This
 * roster no longer includes email/phone, which meaningfully reduces
 * what's exposed here, but names alone are still worth being mindful
 * of for a roster of children — ask if you want this hardened further
 * (a longer minimum query, or rate limiting).
 */
function searchUsers(query) {
  const target = String(query || '').trim().toLowerCase();
  if (target.length < 2) return { candidates: [] };
  const { data } = getUsersSheet_();
  const rows = [];
  const seenRows = {};
  for (let i = 1; i < data.length; i++) {
    const row = userRowToObject_(data[i]);
    const haystack = [row.class, row.name, row.parent1, row.parent2].join(' ').toLowerCase();
    if (!haystack.includes(target)) continue;
    // A hand-maintained roster can end up with an accidentally duplicated
    // row (same person entered twice) — collapse exact duplicates so they
    // don't show up as repeated cards.
    const key = rowKey_(row);
    if (seenRows[key]) continue;
    seenRows[key] = true;
    rows.push(row);
  }
  const limited = rows.slice(0, 25);
  const candidates = limited.map(r => ({ type: 'individual', class: r.class, name: r.name, parent1: r.parent1, parent2: r.parent2 }));

  // Grouped by a case/whitespace-normalized key so "Tetsuya Tsukada" and
  // "tetsuya tsukada " (an easy inconsistency to have across sibling rows
  // typed by hand) are treated as the same parent instead of splitting
  // into separate buckets or dropping a child from the group. Checks
  // both Parent1 and Parent2 so either guardian gets their own group.
  const parentGroups = {}; // normalized key -> { displayName, children }
  limited.forEach(r => {
    [r.parent1, r.parent2].forEach(p => {
      const trimmed = String(p || '').trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!parentGroups[key]) parentGroups[key] = { displayName: trimmed, children: [] };
    });
  });
  Object.keys(parentGroups).forEach(key => {
    const group = parentGroups[key];
    const seenChildren = {};
    // Every guardian who shares this family's children — not just the
    // one whose name this group happens to be keyed on. A child with
    // both Parent1 and Parent2 set belongs to one family with two
    // guardians, not two separate families; without this, only whichever
    // parent name was searched/clicked ever showed up as a "family
    // member" option (see promptFamilyRoundMember_/myBooksNames_), and
    // the other guardian was never selectable at all.
    const guardianKeys = {}; // normalized -> display name
    for (let i = 1; i < data.length; i++) {
      const row = userRowToObject_(data[i]);
      const p1 = String(row.parent1 || '').trim();
      const p2 = String(row.parent2 || '').trim();
      const p1Key = p1.toLowerCase();
      const p2Key = p2.toLowerCase();
      if (p1Key !== key && p2Key !== key) continue;
      const childKey = rowKey_(row);
      if (!seenChildren[childKey]) {
        seenChildren[childKey] = true;
        group.children.push(row);
      }
      if (p1 && !guardianKeys[p1Key]) guardianKeys[p1Key] = p1;
      if (p2 && !guardianKeys[p2Key]) guardianKeys[p2Key] = p2;
    }
    const guardians = Object.keys(guardianKeys).map(k => guardianKeys[k]);
    candidates.push({ type: 'parent', name: group.displayName, children: group.children, guardians: guardians });
  });

  return { candidates };
}

/**
 * Separate admin sign-in, kept apart from patron sign-in on purpose.
 * Requires BOTH a listed Admins-tab email AND the shared AdminSecret
 * from the Config tab — a patron (or anyone else) who merely knows or
 * guesses an admin's email can no longer get admin access through
 * searchUsers alone.
 */
function adminLogin(email, secret) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail || !secret) return { error: 'Enter both the admin email and passcode' };
  if (!isAdmin_(cleanEmail)) return { error: 'Not a recognized admin email or passcode' };
  const expected = getAdminSecret_();
  if (!expected || String(secret).trim() !== expected) return { error: 'Not a recognized admin email or passcode' };
  return { ok: true, email: cleanEmail };
}

// Re-checks an existing admin session still has a listed email — used
// on reload instead of searchUsers, since admin sessions don't come
// from a roster search in the first place.
function verifyAdmin(email) {
  return { isAdmin: !!email && isAdmin_(email) };
}

function listBooks() {
  const { data, header } = getBooksSheet_();
  const rows = data.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => o[h] = r[i]);
    if (!o.Status) o.Status = 'Available';
    return o;
  });
  return { books: rows };
}

// Group is left blank here on purpose — the app's own "Add books" form
// never asks for one (see the Group column's setup note at the top of
// this file); admins fill it in later directly in the Sheet, from the
// dropdown applyBookGroupValidation_ sets up.
function addBook(itemId, title, author) {
  if (!itemId || !title) return { error: 'itemId and title required' };
  const { sh, data } = getBooksSheet_();
  if (findRow_(data, itemId) !== -1) return { error: 'itemId already exists' };
  sh.appendRow([itemId, title, author || '', '', 'Available', '', '', '', '', 0]);
  return { ok: true, itemId, title };
}

// namesCsv: comma-separated names (a parent passes their own name plus
// every child's, so one call returns the whole family's current loans).
function myLoans(namesCsv) {
  const names = String(namesCsv || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return { error: 'Missing name' };
  const { data } = getBooksSheet_();
  const mine = data.slice(1).filter(r => names.indexOf(String(r[5]).trim().toLowerCase()) !== -1);
  const loans = mine.filter(r => r[4] === 'Borrowed');
  const pending = mine.filter(r => r[4] === 'Pending');
  return {
    loans: loans.map(r => ({ itemId: r[0], title: r[1], borrowerName: r[5], borrowDate: r[7], dueDate: r[8] })),
    pending: pending.map(r => ({ itemId: r[0], title: r[1], borrowerName: r[5] }))
  };
}

/**
 * Admin-only dashboard counts. "Due" here means overdue (due date
 * already passed) — distinct from "due today". Each bucket includes
 * full item details so the web app can show them on click without a
 * second request.
 */
function getSummary(adminEmail) {
  if (!adminEmail || !isAdmin_(adminEmail)) return { error: 'Not authorized' };
  const { data } = getBooksSheet_();
  const tz = Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const borrowed = [];
  const borrowedToday = [];
  const due = [];
  const dueToday = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[4] !== 'Borrowed') continue;
    const item = { itemId: row[0], title: row[1], borrowerName: row[5], dueDate: row[8] };
    borrowed.push(item);

    if (row[7]) {
      const borrowDateStr = Utilities.formatDate(new Date(row[7]), tz, 'yyyy-MM-dd');
      if (borrowDateStr === todayStr) borrowedToday.push(item);
    }
    if (row[8]) {
      const dueDateStr = Utilities.formatDate(new Date(row[8]), tz, 'yyyy-MM-dd');
      if (dueDateStr === todayStr) dueToday.push(item);
      else if (new Date(row[8]) < new Date()) due.push(item);
    }
  }

  return {
    borrowed: { count: borrowed.length, items: borrowed },
    borrowedToday: { count: borrowedToday.length, items: borrowedToday },
    due: { count: due.length, items: due },
    dueToday: { count: dueToday.length, items: dueToday }
  };
}
