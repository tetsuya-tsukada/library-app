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
 *    leave Status blank — the app treats blank Status as Available.
 * 13. Run `setupConfigSheet` once. This creates a Config tab (Key/Value
 *    columns) pre-filled with a LoanDays row (default 14), a
 *    MaxBorrowItems row (default 4), and an AdminSecret row (default
 *    "changeme" — change this immediately, it's the shared admin
 *    passcode). Edit any of these any time — the app reads this tab on
 *    every load, so there's no code change or redeploy needed to
 *    update them. Changing LoanDays changes the default due date for
 *    future approvals only, not books already borrowed. Changing
 *    MaxBorrowItems changes how many books someone can have Borrowed
 *    or Pending at once before new borrow requests are rejected.
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
const APPROVAL_DECISION_COL = 7; // Approvals sheet: column G
const BORROW_COUNT_COL = 9; // Books sheet: column I

function getSS() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function setupSheets() {
  const ss = getSS();
  let books = ss.getSheetByName(BOOKS_SHEET);
  if (!books) {
    books = ss.insertSheet(BOOKS_SHEET);
    books.appendRow(['ItemID', 'Title', 'Author', 'Status', 'BorrowerName', 'BorrowerContact', 'BorrowDate', 'DueDate', 'BorrowCount']);
    books.setFrozenRows(1);
  } else if (String(books.getRange(1, BORROW_COUNT_COL).getValue()).trim() !== 'BorrowCount') {
    // Existing tab from before BorrowCount existed — add the header
    // without touching any existing rows or their data (existing rows'
    // counts just start at blank/0 going forward).
    books.getRange(1, BORROW_COUNT_COL).setValue('BorrowCount');
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
    AdminSecret: 'changeme'
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

function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    switch (action) {
      case 'lookup':
        result = lookupBook(e.parameter.itemId);
        break;
      case 'scan':
        result = scanBook(e.parameter.itemId, e.parameter.name, e.parameter.contact, e.parameter.adminEmail);
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
        result = getConfig();
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
      default:
        result = { error: 'Unknown action' };
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
  const [id, title, author, status, name, contact, borrowDate, dueDate] = data[row];
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
  const currentStatus = data[row][3] || 'Available';
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
      sh.getRange(rowNum, 4, 1, 5).setValues([['Borrowed', name, contact || '', now, due]]);
      logTx_(itemId, title, 'Borrow', name, contact);
      incrementBorrowCount_(sh, rowNum);
      return { action: 'borrow', itemId, title, borrowerName: name, dueDate: due };
    }
    const requestId = itemId + '-' + now.getTime();
    sh.getRange(rowNum, 4, 1, 5).setValues([['Pending', name, contact || '', now, '']]);
    appendApprovalRequest_(requestId, itemId, title, name, contact);
    return { action: 'pending', itemId, title, requestId };
  } else if (currentStatus === 'Pending') {
    // Already awaiting approval — hand back the existing request so the app can keep polling it
    const requestId = findPendingRequestId_(itemId);
    return { action: 'pending', itemId, title, requestId };
  } else {
    // RETURN — always immediate, never needs approval
    const prevName = data[row][4];
    const prevContact = data[row][5];
    sh.getRange(rowNum, 4, 1, 5).setValues([['Available', '', '', '', '']]);
    logTx_(itemId, title, 'Return', prevName, prevContact);
    return { action: 'return', itemId, title, borrowerName: prevName };
  }
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
    const status = data[i][3];
    const bName = String(data[i][4] || '').trim().toLowerCase();
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
    const borrowerName = bRow !== -1 ? books[bRow][4] : requesterName;
    const dueDate = bRow !== -1 ? books[bRow][7] : null;
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
  const bookIsPending = bRow !== -1 && (books[bRow][3] || '') === 'Pending';

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

    booksSh.getRange(bRow + 1, 4, 1, 5).setValues([['Borrowed', requesterName, requesterContact || '', now, due]]);
    logTx_(itemId, title, 'Borrow', requesterName, requesterContact);
    incrementBorrowCount_(booksSh, bRow + 1);
  } else if (decision === 'Deny' && bookIsPending) {
    booksSh.getRange(bRow + 1, 4, 1, 5).setValues([['Available', '', '', '', '']]);
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
    for (let i = 1; i < data.length; i++) {
      const row = userRowToObject_(data[i]);
      const p1 = String(row.parent1 || '').trim().toLowerCase();
      const p2 = String(row.parent2 || '').trim().toLowerCase();
      if (p1 !== key && p2 !== key) continue;
      const childKey = rowKey_(row);
      if (seenChildren[childKey]) continue; // same duplicate-row guard as above
      seenChildren[childKey] = true;
      group.children.push(row);
    }
    candidates.push({ type: 'parent', name: group.displayName, children: group.children });
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

function addBook(itemId, title, author) {
  if (!itemId || !title) return { error: 'itemId and title required' };
  const { sh, data } = getBooksSheet_();
  if (findRow_(data, itemId) !== -1) return { error: 'itemId already exists' };
  sh.appendRow([itemId, title, author || '', 'Available', '', '', '', '', 0]);
  return { ok: true, itemId, title };
}

// namesCsv: comma-separated names (a parent passes their own name plus
// every child's, so one call returns the whole family's current loans).
function myLoans(namesCsv) {
  const names = String(namesCsv || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return { error: 'Missing name' };
  const { data } = getBooksSheet_();
  const rows = data.slice(1).filter(r => r[3] === 'Borrowed' && names.indexOf(String(r[4]).trim().toLowerCase()) !== -1);
  return {
    loans: rows.map(r => ({ itemId: r[0], title: r[1], borrowerName: r[4], borrowDate: r[6], dueDate: r[7] }))
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
    if (row[3] !== 'Borrowed') continue;
    const item = { itemId: row[0], title: row[1], borrowerName: row[4], dueDate: row[7] };
    borrowed.push(item);

    if (row[6]) {
      const borrowDateStr = Utilities.formatDate(new Date(row[6]), tz, 'yyyy-MM-dd');
      if (borrowDateStr === todayStr) borrowedToday.push(item);
    }
    if (row[7]) {
      const dueDateStr = Utilities.formatDate(new Date(row[7]), tz, 'yyyy-MM-dd');
      if (dueDateStr === todayStr) dueToday.push(item);
      else if (new Date(row[7]) < new Date()) due.push(item);
    }
  }

  return {
    borrowed: { count: borrowed.length, items: borrowed },
    borrowedToday: { count: borrowedToday.length, items: borrowedToday },
    due: { count: due.length, items: due },
    dueToday: { count: dueToday.length, items: dueToday }
  };
}
