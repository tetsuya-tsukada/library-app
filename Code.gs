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
 * 5. Run `setupSheets` once from the editor (select it in the function
 *    dropdown, click Run). This creates the Books, Transactions, Admins,
 *    Approvals, and User List tabs with the right headers. Approve the
 *    permissions prompt.
 * 6. Fill in the "User List" tab: one row per person, columns Class,
 *    Name, Parent, Email, Phone. This is the roster everyone signs in
 *    against — there is no separate password. A row with no Parent is
 *    treated as signing in for themself (e.g. staff/admins); a row
 *    with a Parent name is a child, and whoever's Email/Phone is on
 *    that row (typically the parent's own contact info, since kids
 *    often don't have their own) can sign in as the parent and pick
 *    which child a given scan is for. If the same Email/Phone value
 *    appears on more than one row, signing in with it is treated as a
 *    parent with that many children.
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
 *    columns) pre-filled with a LoanDays row (default 14) and a
 *    MaxBorrowItems row (default 4). Edit either any time — the app
 *    reads this tab on every load, so there's no code change or
 *    redeploy needed to update them. Changing LoanDays changes the
 *    default due date for future approvals only, not books already
 *    borrowed. Changing MaxBorrowItems changes how many books someone
 *    can have Borrowed or Pending at once before new borrow requests
 *    are rejected.
 * 14. Reload the Google Sheet tab in your browser. A "📚 Library" menu
 *    appears next to Help — use its "Print QR labels" item any time to
 *    generate a printable label sheet (title, item ID, and a scannable
 *    QR code per book) right from the Sheet. This does not require the
 *    web app at all, and is the only place labels are printed from —
 *    the scanner app itself only shows a single label right after
 *    adding one book.
 *
 * HOW SIGN-IN WORKS (no Google/Facebook login, no password — everyone
 * matches against the User List tab):
 * - As someone types a name, email, or phone number (2+ characters),
 *   the app live-searches every row's Class/Name/Parent/Email/Phone for
 *   that substring and shows matching people to tap — not an exact
 *   match, so "yuki" finds "Yuki Sato" and a partial phone number works
 *   too. There's no guest/fallback mode; if you're not found, you're
 *   not in the sheet yet.
 * - Rows that share a Parent name also produce a "Parent of ..." option
 *   alongside the individual children, so a parent can sign in as
 *   themself (their own separate MaxBorrowItems allowance, tracked
 *   under their own name) or pick a specific child — each borrow scan
 *   asks which one it's for.
 * - Whether someone is an admin is checked the same way as before:
 *   their exact typed value is compared against the Admins tab. This
 *   is a plain string match, not a verified identity — same trust
 *   model as everything else in this app, fine for a small trusted
 *   community but worth knowing if that ever changes.
 * - Since matching is loose, there's no separate "is this really you"
 *   gate at sign-in — the safeguard against someone picking the wrong
 *   or someone else's name is the existing borrow-approval step below,
 *   which every borrow request already goes through regardless.
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

function getSS() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function setupSheets() {
  const ss = getSS();
  let books = ss.getSheetByName(BOOKS_SHEET);
  if (!books) books = ss.insertSheet(BOOKS_SHEET);
  books.clear();
  books.appendRow(['ItemID', 'Title', 'Author', 'Status', 'BorrowerName', 'BorrowerContact', 'BorrowDate', 'DueDate']);
  books.setFrozenRows(1);

  let tx = ss.getSheetByName(TX_SHEET);
  if (!tx) tx = ss.insertSheet(TX_SHEET);
  tx.clear();
  tx.appendRow(['Timestamp', 'ItemID', 'Title', 'Action', 'BorrowerName', 'BorrowerContact']);
  tx.setFrozenRows(1);

  // Admins and Approvals are NOT cleared if they already exist, so
  // re-running this setup doesn't wipe your admin list or approval history.
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
    users.appendRow(['Class', 'Name', 'Parent', 'Email', 'Phone']);
    users.setFrozenRows(1);
  }
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
    MaxBorrowItems: String(MAX_BORROW_ITEMS)
  };
  Object.keys(defaults).forEach(key => {
    if (!existingKeys[key]) sh.appendRow([key, defaults[key]]);
  });
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

function openPrintLabelsDialog() {
  const { books } = listBooks();
  const items = books.map(b => ({ itemId: String(b.ItemID || ''), title: String(b.Title || '') }));
  // Guard against breaking out of the <script> tag if a title ever contained "</script".
  const json = JSON.stringify(items).replace(/</g, '\\u003c');
  const template = HtmlService.createTemplate(PRINT_LABELS_HTML);
  template.booksJson = json;
  const html = template.evaluate().setWidth(760).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'Print QR labels');
}

const PRINT_LABELS_HTML = `<!DOCTYPE html>
<html><head>
<base target="_top">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
  body{font-family:sans-serif;margin:0;padding:16px;}
  .toolbar{margin-bottom:14px;}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
  .lab{border:1px dashed #999;border-radius:4px;padding:10px;text-align:center;page-break-inside:avoid;}
  .lab .t{font-size:11px;font-weight:600;margin:6px 0 2px;line-height:1.2;}
  .lab .i{font-family:monospace;font-size:9px;color:#666;}
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
        result = scanBook(e.parameter.itemId, e.parameter.name, e.parameter.contact);
        break;
      case 'list':
        result = listBooks();
        break;
      case 'addBook':
        result = addBook(e.parameter.itemId, e.parameter.title, e.parameter.author);
        break;
      case 'myLoans':
        result = myLoans(e.parameter.contact);
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

function scanBook(itemId, name, contact) {
  if (!itemId) return { error: 'Missing itemId' };
  const { sh, data } = getBooksSheet_();
  const row = findRow_(data, itemId);
  if (row === -1) return { error: 'Book not found', itemId };

  const title = data[row][1];
  const currentStatus = data[row][3] || 'Available';
  const now = new Date();
  const rowNum = row + 1; // 1-indexed for sheet API

  if (currentStatus === 'Available') {
    // BORROW REQUEST — locks the book as Pending until an admin approves it
    if (!name) return { error: 'Name required to borrow' };
    const maxItems = getMaxBorrowItems_();
    const activeCount = countActiveLoans_(name);
    if (activeCount >= maxItems) {
      return { error: 'Borrow limit reached (' + maxItems + ' items). Return a book before borrowing another.' };
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
  return { class: row[0] || '', name: row[1] || '', parent: row[2] || '', email: row[3] || '', phone: row[4] || '' };
}

/**
 * Sign-in and admin lookup both go through this: a loose, case-insensitive
 * substring match against Class/Name/Parent/Email/Phone (not an exact
 * match — "yuki" matches "Yuki Sato", a partial phone number matches
 * the full one, etc). Every matching row is returned as an "individual"
 * candidate. Rows that share a non-empty Parent value also produce one
 * "parent" candidate per distinct parent name, listing every child
 * under that parent (not just the ones this particular query matched),
 * so a parent typing their own name/phone sees all their kids together
 * and gets the option to sign in as themself instead of a specific child.
 * isAdmin compares the raw query itself against the Admins tab, same
 * plain-string check used everywhere else in this app — not a verified
 * identity.
 *
 * SECURITY NOTE: this action is intentionally public (it's the sign-in
 * entry point, called before anyone has proven who they are) and now
 * does a loose substring match instead of requiring an exact
 * email/phone. That means anyone who can reach the web app URL —
 * published in this public repo's index.html — can enumerate rows of
 * this roster (names, classes, parent names, emails, phone numbers)
 * without signing in, by trying short/common substrings. The 2-
 * character minimum and 25-result cap below raise the bar slightly but
 * don't prevent a determined, scripted attempt. Worth knowing since
 * this roster includes children's information — ask if you want this
 * hardened further (e.g. withholding email/phone from the response, a
 * longer minimum query, or rate limiting).
 */
function searchUsers(query) {
  const target = String(query || '').trim().toLowerCase();
  if (target.length < 2) return { candidates: [], isAdmin: false };
  const { data } = getUsersSheet_();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = userRowToObject_(data[i]);
    const haystack = [row.class, row.name, row.parent, row.email, row.phone].join(' ').toLowerCase();
    if (haystack.includes(target)) rows.push(row);
  }
  const limited = rows.slice(0, 25);
  const candidates = limited.map(r => ({ type: 'individual', class: r.class, name: r.name, parent: r.parent, email: r.email, phone: r.phone }));

  // Grouped by a case/whitespace-normalized key so "Tetsuya Tsukada" and
  // "tetsuya tsukada " (an easy inconsistency to have across sibling rows
  // typed by hand) are treated as the same parent instead of splitting
  // into separate buckets or dropping a child from the group.
  const parentGroups = {}; // normalized key -> { displayName, children }
  limited.forEach(r => {
    const p = String(r.parent || '').trim();
    if (!p) return;
    const key = p.toLowerCase();
    if (!parentGroups[key]) parentGroups[key] = { displayName: p, children: [] };
  });
  Object.keys(parentGroups).forEach(key => {
    const group = parentGroups[key];
    for (let i = 1; i < data.length; i++) {
      const row = userRowToObject_(data[i]);
      if (String(row.parent || '').trim().toLowerCase() === key) group.children.push(row);
    }
    candidates.push({ type: 'parent', name: group.displayName, children: group.children });
  });

  return { candidates, isAdmin: isAdmin_(query) };
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
  sh.appendRow([itemId, title, author || '', 'Available', '', '', '', '']);
  return { ok: true, itemId, title };
}

function myLoans(contact) {
  if (!contact) return { error: 'Missing contact' };
  const { data } = getBooksSheet_();
  const rows = data.slice(1).filter(r => r[3] === 'Borrowed' && String(r[5]).trim() === String(contact).trim());
  return { loans: rows.map(r => ({ itemId: r[0], title: r[1], borrowDate: r[6], dueDate: r[7] })) };
}
