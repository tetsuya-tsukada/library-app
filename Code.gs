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
 *    dropdown, click Run). This creates the Books, Transactions, Admins
 *    and Approvals tabs with the right headers. Approve the permissions
 *    prompt.
 * 6. Add admin approvers: in the Admins tab, add one row per approver
 *    with their Google account email in column A.
 * 7. Run `installApprovalTrigger` once from the editor. This lets the
 *    script notice when an admin changes a cell in the Approvals tab.
 * 8. Share the Sheet directly with each admin's Google account (Editor
 *    access). Admin approval enforcement identifies approvers by their
 *    signed-in email, so it will not work if the sheet is shared via an
 *    "anyone with the link can edit" link instead of named accounts.
 * 9. Deploy > New deployment > type: Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 10. Copy the Web app URL — paste it into the scanner app's Settings.
 * 11. Add your books: run addBook manually a few times, OR just type
 *    rows directly into the Books tab (ItemID / Title / Author),
 *    leave Status blank — the app treats blank Status as Available.
 *
 * HOW APPROVAL WORKS:
 * - When someone scans an available book to borrow it, the book's
 *   Status becomes "Pending" and a row is added to the Approvals tab
 *   with Decision = "Pending".
 * - An admin opens the Approvals tab and changes that row's Decision
 *   cell to "Approve" or "Deny" (it's a dropdown).
 * - The script checks the editor's email against the Admins tab. If
 *   they're not listed, the edit is reverted and nothing happens.
 * - If approved, the book becomes "Borrowed" with a due date. If
 *   denied, the book goes back to "Available". Either way the
 *   scanning app — which polls automatically — updates within a few
 *   seconds.
 * - Returning a borrowed book is immediate and never needs approval.
 * -----------------------------------------------------
 */

const SHEET_ID = ''; // leave blank if script is bound to the sheet
const BOOKS_SHEET = 'Books';
const TX_SHEET = 'Transactions';
const ADMINS_SHEET = 'Admins';
const APPROVALS_SHEET = 'Approvals';
const LOAN_DAYS = 14;
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
    approvals.appendRow(['RequestID', 'Timestamp', 'ItemID', 'Title', 'RequesterName', 'RequesterContact', 'Decision', 'DecidedBy', 'DecidedAt']);
    approvals.setFrozenRows(1);
  }
  applyApprovalValidation_(approvals, 2, 1000);
}

function applyApprovalValidation_(sh, startRow, numRows) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Approve', 'Deny'], true)
    .setAllowInvalid(false)
    .build();
  sh.getRange(startRow, APPROVAL_DECISION_COL, numRows, 1).setDataValidation(rule);
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
  sh.appendRow([requestId, new Date(), itemId, title, name, contact || '', 'Pending', '', '']);
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

    const row = e.range.getRow();
    const rowData = sh.getRange(row, 1, 1, 6).getValues()[0];
    const itemId = rowData[2];
    const title = rowData[3];
    const requesterName = rowData[4];
    const requesterContact = rowData[5];

    const { sh: booksSh, data: books } = getBooksSheet_();
    const bRow = findRow_(books, itemId);
    const bookIsPending = bRow !== -1 && (books[bRow][3] || '') === 'Pending';

    if (newValue === 'Approve' && bookIsPending) {
      const now = new Date();
      const due = new Date(now.getTime() + LOAN_DAYS * 24 * 60 * 60 * 1000);
      booksSh.getRange(bRow + 1, 4, 1, 5).setValues([['Borrowed', requesterName, requesterContact || '', now, due]]);
      logTx_(itemId, title, 'Borrow', requesterName, requesterContact);
    } else if (newValue === 'Deny' && bookIsPending) {
      booksSh.getRange(bRow + 1, 4, 1, 5).setValues([['Available', '', '', '', '']]);
      logTx_(itemId, title, 'Deny', requesterName, requesterContact);
    }

    sh.getRange(row, 8, 1, 2).setValues([[email, new Date()]]);
  } catch (err) {
    SpreadsheetApp.getActive().toast('Approval processing error: ' + err.message, 'Error', 6);
  }
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
