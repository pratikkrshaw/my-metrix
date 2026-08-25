'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function setStatus(msg, updatedAt) {
  el('status-text').textContent = msg;
  el('last-updated').textContent = updatedAt
    ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';
}

function getSelectedMonth() {
  const now = new Date();
  if (!_selectedMonthVal) {
    return { year: now.getFullYear(), month: now.getMonth() + 1, isCurrentMonth: true };
  }
  const [y, m] = _selectedMonthVal.split('-').map(Number);
  return { year: y, month: m, isCurrentMonth: y === now.getFullYear() && m === now.getMonth() + 1 };
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function monthRange(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < 2000 || y > 2100 || m < 1 || m > 12) {
    throw new Error('Invalid date range.');
  }
  const mm   = String(m).padStart(2, '0');
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${mm}-01T00:00:00Z`,
    end:   `${y}-${mm}-${String(last).padStart(2, '0')}T23:59:59Z`,
  };
}

// ── Custom month picker ───────────────────────────────────────────────────────

let _selectedMonthVal = '';

function buildMonthOptions() {
  const dropdown = el('month-picker-dropdown');
  while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);

  const now = new Date();
  // Default to current month
  _selectedMonthVal = `${now.getFullYear()}-${now.getMonth() + 1}`;

  for (let i = 0; i < 12; i++) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year  = d.getFullYear();
    const month = d.getMonth() + 1;
    const val   = `${year}-${month}`;
    const label = d.toLocaleString('default', { month: 'long' });

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'month-picker-option' + (i === 0 ? ' selected' : '');
    btn.dataset.val = val;

    const monthSpan = document.createElement('span');
    monthSpan.textContent = label;
    const yearSpan = document.createElement('span');
    yearSpan.className = 'opt-year';
    yearSpan.textContent = year;
    btn.appendChild(monthSpan);
    btn.appendChild(yearSpan);

    btn.addEventListener('click', () => {
      _selectedMonthVal = val;
      el('month-picker-label').textContent = label + ' ' + year;
      dropdown.querySelectorAll('.month-picker-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      el('month-picker').classList.remove('open');
      refresh();
    });

    dropdown.appendChild(btn);
  }

  el('month-picker-label').textContent =
    now.toLocaleString('default', { month: 'long' }) + ' ' + now.getFullYear();
}

function initMonthPicker() {
  const picker = el('month-picker');
  const btn    = el('month-picker-btn');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    picker.classList.toggle('open');
  });

  document.addEventListener('click', () => picker.classList.remove('open'));
}

// ── Productivity calculation ──────────────────────────────────────────────────
// Weighted by topic capacity. Numerator = sum(1/topicCapacity) per case.
// Denominator = sum(dailyCapacity) per unique (date × topic) pair, minus leave days.

function todayInTz(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = type => parseInt(parts.find(p => p.type === type).value, 10);
    return { year: get('year'), month: get('month'), day: get('day') };
  } catch (_) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
}

function workingDaysInRange(year, month, isCurrentMonth, leaveDays, tz) {
  const tzToday = todayInTz(tz || 'America/Los_Angeles');
  const days    = isCurrentMonth ? tzToday.day : new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return Math.max(0, count - (leaveDays || 0));
}

const TOPIC_TARGETS = {
  'Service-How-to, Setup, Configuration, Data Management':            { daily: 2.88, newbie: 1.73 },
  'Service-Developer Support':                                         { daily: 1.66, newbie: 0.99 },
  'Service-Flow':                                                      { daily: 1.66, newbie: 0.99 },
  'Service-Email Delivery & Desktop Integrations':                     { daily: 1.87, newbie: 1.12 },
  'Service-Digital Engagement':                                        { daily: 1.66, newbie: 0.99 },
  'Service-Experience Builder and Content Management':                 { daily: 1.66, newbie: 0.99 },
  'Service-Service Cloud Voice':                                       { daily: 1.66, newbie: 0.99 },
  'Service-Mobile Apps':                                               { daily: 1.87, newbie: 1.12 },
  'Service-Security & Activations':                                    { daily: 1.87, newbie: 1.12 },
  'Service-Field Service':                                             { daily: 1.66, newbie: 0.99 },
  'Service-Experience Management and Workspaces':                      { daily: 1.66, newbie: 0.99 },
  'Community / Experience-Experience Builder and Content Management':  { daily: 1.66, newbie: 0.99 },
  'Service-Network Infrastructure and Core Maintenance':               { daily: 1.87, newbie: 1.12 },
  'Service-Tableau CRM & Einstein Discovery':                          { daily: 1.66, newbie: 0.99 },
  'Service-CRM Analytics':                                             { daily: 1.66, newbie: 0.99 },
  'Service-Cases, Knowledge, Service Cloud Console, Work.com':         { daily: 1.66, newbie: 0.99 },
  'Service-Reports and Dashboards':                                    { daily: 2.88, newbie: 1.73 },
  'Core-Chat':                                                         { daily: 5.40, newbie: 3.24 },
  'Agentforce-Service':                                                { daily: 1.66, newbie: 0.99 },
  'Data Cloud-Data Cloud':                                             { daily: 1.66, newbie: 0.99 },
  'Service-Agentforce IT Service':                                     { daily: 1.66, newbie: 0.99 },
  'Service-AppExchange & Managed Packages':                            { daily: 1.66, newbie: 0.99 },
  'Service-Prompt Builder':                                            { daily: 1.66, newbie: 0.99 },
  'Sales-Mandatory Security Controls':                                 { daily: 1.87, newbie: 1.12 },
  'Service-Mandatory Security Controls':                               { daily: 1.87, newbie: 1.12 },
};

function getDailyTarget(topic, isNewbie) {
  const t = TOPIC_TARGETS[topic];
  if (!t) return isNewbie ? 0.99 : 1.66;
  return isNewbie ? t.newbie : t.daily;
}

function calcProductivityWeighted(eligibleCount, dailyTarget, leaveDays, year, month, isCurrentMonth, tz) {
  if (eligibleCount == null) return null;
  const workingDays = workingDaysInRange(year, month, isCurrentMonth, leaveDays, tz);
  if (workingDays === 0) return null;
  return (eligibleCount / (dailyTarget * workingDays)) * 100;
}

// ── Leave day counter (keyed per month) ──────────────────────────────────────

function leaveKey(year, month) { return `leaveDays_${year}_${month}`; }

async function getLeaveDays(year, month) {
  const key  = leaveKey(year, month);
  const data = await new Promise(r => chrome.storage.local.get({ [key]: 0 }, r));
  return data[key];
}

function setLeaveDays(year, month, n) {
  chrome.storage.local.set({ [leaveKey(year, month)]: n });
}

// ── SF session ────────────────────────────────────────────────────────────────

const SF_ID_RE = /^[a-zA-Z0-9]{15,18}$/;

// Business hours UTC windows per support region (start/end minutes from midnight UTC)
const REGION_BIZ_HOURS = {
  AMER: { startUTC: 12 * 60, endUTC: 25 * 60, hpd: 13 }, // 8AM–9PM EDT = 12:00–01:00 UTC (crosses midnight)
  EMEA: { startUTC:  7 * 60, endUTC: 15 * 60, hpd:  8 }, // 07:00–15:00 UTC
  APAC: { startUTC:  0 * 60, endUTC:  9 * 60, hpd:  9 }, // 00:00–09:00 UTC
};

async function getSfSession() {
  const cookie = await chrome.cookies.get({ url: 'https://orgcs.my.salesforce.com', name: 'sid' });
  if (!cookie?.value) throw new Error('Not logged in — please open orgcs in a tab first.');

  const base    = 'https://orgcs.my.salesforce.com/services/data/v62.0';
  const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${cookie.value}` };

  const meResp = await fetch(`${base}/chatter/users/me`, { headers });
  if (!meResp.ok) throw new Error('Unable to verify your Salesforce session. Please refresh the page.');
  const userId = (await meResp.json()).id;
  if (!userId || !SF_ID_RE.test(userId)) throw new Error('Invalid session — please log in to Salesforce again.');

  const userResp = await fetch(`${base}/query/?q=${encodeURIComponent(`SELECT Support_Region__c, TimeZoneSidKey FROM User WHERE Id = '${userId}'`)}`, { headers });
  const userRec       = userResp.ok ? ((await userResp.json()).records?.[0] ?? {}) : {};
  const supportRegion = userRec.Support_Region__c ?? 'AMER';
  const tzSidKey      = userRec.TimeZoneSidKey ?? 'America/Los_Angeles';

  // Fetch tier and primary topic from ServiceResource + ServiceResourceSkill
  let isNewbie = false;
  let topic    = null;
  try {
    const srResp = await fetch(`${base}/query/?q=${encodeURIComponent(`SELECT Id, Current_Tier__c FROM ServiceResource WHERE RelatedRecordId = '${userId}' LIMIT 1`)}`, { headers });
    if (srResp.ok) {
      const srRec = (await srResp.json()).records?.[0];
      if (srRec) {
        const tier = (srRec.Current_Tier__c || '').toLowerCase();
        isNewbie   = tier.includes('newbie') || tier.includes('new');

        const skillResp = await fetch(`${base}/query/?q=${encodeURIComponent(`SELECT Skill.MasterLabel FROM ServiceResourceSkill WHERE ServiceResourceId = '${srRec.Id}' AND (ExpirationDate = null OR ExpirationDate > TODAY) ORDER BY CreatedDate DESC LIMIT 20`)}`, { headers });
        if (skillResp.ok) {
          const skills = (await skillResp.json()).records ?? [];
          const labels = skills.map(s => s.Skill?.MasterLabel || '');
          // Match first skill label that corresponds to a known topic
          topic = labels.find(l => TOPIC_TARGETS[l]) ?? null;
        }
      }
    }
  } catch (_) { /* non-fatal — fall back to defaults */ }

  return { sessionId: cookie.value, userId, supportRegion, tzSidKey, isNewbie, topic };
}

// ── Salesforce queries ────────────────────────────────────────────────────────

async function fetchSfClosedCases(sessionId, userId, year, month) {
  const base    = 'https://orgcs.my.salesforce.com/services/data/v62.0';
  const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionId}` };
  const { start, end } = monthRange(year, month);

  const totalSoql    = `SELECT COUNT(Id) cnt FROM Case WHERE OwnerId = '${userId}' AND Status = 'Closed' AND ClosedDate >= ${start} AND ClosedDate <= ${end}`;
  const eligibleSoql = `SELECT COUNT(Id) cnt FROM Case WHERE OwnerId = '${userId}' AND Status = 'Closed' AND (GHO__c = false OR GHO_Type__c = 'Active') AND ClosedDate >= ${start} AND ClosedDate <= ${end}`;

  const [totalResp, eligibleResp] = await Promise.all([
    fetch(`${base}/query/?q=${encodeURIComponent(totalSoql)}`, { headers }),
    fetch(`${base}/query/?q=${encodeURIComponent(eligibleSoql)}`, { headers }),
  ]);

  if (!totalResp.ok || !eligibleResp.ok) throw new Error('Failed to load case data. Please try again.');
  const total         = (await totalResp.json()).records?.[0]?.cnt ?? 0;
  const eligibleCases = (await eligibleResp.json()).records?.[0]?.cnt ?? 0;

  return { total, eligibleCases };
}

async function fetchSfSurveyData(sessionId, userId, year, month) {
  const base    = 'https://orgcs.my.salesforce.com/services/data/v62.0';
  const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionId}` };
  const { start, end } = monthRange(year, month);
  const soql = `SELECT AVG(Technical_Support_Satisfaction_Score__c) avgScore, COUNT(Id) cnt FROM Survey_Results__c WHERE Case_Owner__c = '${userId}' AND COMPLETIONTIME__c >= ${start} AND COMPLETIONTIME__c <= ${end}`;

  const resp = await fetch(`${base}/query/?q=${encodeURIComponent(soql)}`, { headers });
  if (!resp.ok) throw new Error('Failed to load survey data. Please try again.');
  const rec = (await resp.json()).records?.[0];
  return { csat: rec?.avgScore ?? null, surveyCount: rec?.cnt ?? null };
}

// ── Business hours age ────────────────────────────────────────────────────────
// AMER: 8AM–9PM EDT = 12:00–01:00 UTC (crosses midnight). Spans two UTC dates.
// For midnight-crossing regions, a business day contributes two segments:
//   • 12:00–24:00 on the weekday itself
//   • 00:00–01:00 on the following calendar day (if that day is not Saturday)
// For normal regions (EMEA, APAC), a business day contributes startUTC–endUTC
// on any weekday.

function businessHoursBetween(startISO, endISO, supportRegion) {
  const region = REGION_BIZ_HOURS[supportRegion] || REGION_BIZ_HOURS.AMER;
  const BIZ_START = region.startUTC; // minutes from midnight UTC (e.g. 12*60 = 720)
  const BIZ_END   = region.endUTC;   // minutes from midnight UTC (e.g. 25*60 = 1500)
  const CROSSES_MIDNIGHT = BIZ_END > 24 * 60;

  // For midnight-crossing regions:
  //   EVENING segment on a weekday:   BIZ_START – 24:00
  //   MORNING segment the next UTC day: 00:00 – (BIZ_END - 24*60)
  const NEXT_DAY_END = CROSSES_MIDNIGHT ? BIZ_END - 24 * 60 : 0; // e.g. 60 mins = 01:00

  function minsUTC(d)      { return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  function dateOnlyUTC(d)  { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  function isWeekday(utcDate) { const dow = utcDate.getUTCDay(); return dow !== 0 && dow !== 6; }
  function addDays(utcDate, n) { const d = new Date(utcDate); d.setUTCDate(d.getUTCDate() + n); return d; }

  // Minutes of biz overlap for a straight window [fromMins, toMins) on a single UTC date.
  // Used for EMEA/APAC (non-midnight-crossing).
  function bizMinsSimple(utcDate, fromMins, toMins) {
    if (!isWeekday(utcDate)) return 0;
    return Math.max(0, Math.min(toMins, BIZ_END) - Math.max(fromMins, BIZ_START));
  }

  // Minutes of biz overlap for AMER on a single UTC date.
  // AMER has two biz segments per business day:
  //   (A) Evening segment: BIZ_START–24:00 on a weekday
  //   (B) Morning segment: 00:00–NEXT_DAY_END on the following UTC day (if that next day isn't Saturday)
  // We ask: within the slice [fromMins, toMins) of 'utcDate', how many biz minutes are there?
  function bizMinsAMER(utcDate, fromMins, toMins) {
    let mins = 0;
    // (A) Evening segment — only if utcDate is a weekday
    if (isWeekday(utcDate)) {
      mins += Math.max(0, Math.min(toMins, 24 * 60) - Math.max(fromMins, BIZ_START));
    }
    // (B) Morning segment — belongs to utcDate but was earned by the PREVIOUS calendar day's
    //     business hours. Check that the previous day (utcDate-1) was a weekday, and that
    //     utcDate itself isn't Sunday (i.e. previous day was Saturday, no business hours).
    //     Actually: the morning segment on utcDate runs 00:00–NEXT_DAY_END and counts only
    //     when the PREVIOUS UTC day was a weekday.
    const prevDay = addDays(utcDate, -1);
    if (isWeekday(prevDay)) {
      mins += Math.max(0, Math.min(toMins, NEXT_DAY_END) - Math.max(fromMins, 0));
    }
    return mins;
  }

  const start    = new Date(startISO);
  const end      = new Date(endISO);
  const startDay = dateOnlyUTC(start);
  const endDay   = dateOnlyUTC(end);

  let totalMins = 0;
  const bizMinsOnDay = CROSSES_MIDNIGHT ? bizMinsAMER : bizMinsSimple;

  if (startDay.getTime() === endDay.getTime()) {
    totalMins = bizMinsOnDay(startDay, minsUTC(start), minsUTC(end));
  } else {
    // First partial day
    totalMins += bizMinsOnDay(startDay, minsUTC(start), 24 * 60);
    // Full days in between
    const cur = addDays(startDay, 1);
    while (cur < endDay) {
      totalMins += bizMinsOnDay(cur, 0, 24 * 60);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    // Last partial day
    totalMins += bizMinsOnDay(endDay, 0, minsUTC(end));
  }

  return totalMins / 60;
}

function fmtBizAge(hours, hoursPerDay) {
  const hpd = hoursPerDay || 8;
  if (hours < 1) return '< 1h';
  const h = Math.round(hours * 10) / 10;
  if (h < hpd) return `${h}h`;
  const days = Math.floor(h / hpd);
  const rem  = Math.round(h % hpd * 10) / 10;
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

// ── Case list fetch ───────────────────────────────────────────────────────────

async function fetchCaseList(sessionId, userId, year, month) {
  const base    = 'https://orgcs.my.salesforce.com/services/data/v62.0';
  const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionId}` };
  const { start, end } = monthRange(year, month);
  const soql = `SELECT Id, CaseNumber, Subject, CreatedDate, ClosedDate FROM Case WHERE OwnerId = '${userId}' AND Status = 'Closed' AND ClosedDate >= ${start} AND ClosedDate <= ${end} ORDER BY ClosedDate DESC LIMIT 200`;

  const resp = await fetch(`${base}/query/?q=${encodeURIComponent(soql)}`, { headers });
  if (!resp.ok) throw new Error('Failed to load case list. Please try again.');
  return (await resp.json()).records ?? [];
}

function renderCaseList(cases, supportRegion) {
  const body = el('case-list-body');
  while (body.firstChild) body.removeChild(body.firstChild);

  if (!cases.length) {
    const empty = document.createElement('div');
    empty.className = 'case-list-loading';
    empty.textContent = 'No closed cases found.';
    body.appendChild(empty);
    return;
  }

  cases.forEach(c => {
    const age = fmtBizAge(businessHoursBetween(c.CreatedDate, c.ClosedDate, supportRegion), 24);
    const closedDate = new Date(c.ClosedDate).toLocaleDateString('default', { month: 'short', day: 'numeric' });

    const item = document.createElement('div');
    item.className = 'case-item';
    item.innerHTML = `
      <div class="case-item-left">
        <span class="case-number">${c.CaseNumber}</span>
        <span class="case-subject">${c.Subject || '(no subject)'}</span>
      </div>
      <div class="case-item-right">
        <span class="case-age">${age}</span>
        <span class="case-closed-date">${closedDate}</span>
      </div>`;
    item.addEventListener('click', () =>
      chrome.tabs.create({ url: `https://orgcs.my.salesforce.com/${c.Id}` })
    );
    body.appendChild(item);
  });
}

// ── Data fetch ────────────────────────────────────────────────────────────────

function calcAvgTTR(cases, supportRegion) {
  if (!cases || !cases.length) return null;
  const total = cases.reduce((sum, c) => sum + businessHoursBetween(c.CreatedDate, c.ClosedDate, supportRegion), 0);
  return { hours: total / cases.length };
}

async function fetchDashboardData() {
  const { year, month, isCurrentMonth } = getSelectedMonth();
  try {
    const { sessionId, userId, supportRegion, tzSidKey, isNewbie, topic } = await getSfSession();
    const [{ total: closedCases, eligibleCases }, { csat, surveyCount }, leaveDays, cases] = await Promise.all([
      fetchSfClosedCases(sessionId, userId, year, month),
      fetchSfSurveyData(sessionId, userId, year, month),
      getLeaveDays(year, month),
      fetchCaseList(sessionId, userId, year, month),
    ]);
    const avgTTR     = calcAvgTTR(cases, supportRegion);
    const dailyTarget = getDailyTarget(topic, isNewbie);
    return { closedCases, eligibleCases, csat, surveyCount, leaveDays, avgTTR, supportRegion, tzSidKey, isNewbie, topic, dailyTarget, year, month, isCurrentMonth };
  } catch (_) {
    const leaveDays = await getLeaveDays(year, month);
    return { closedCases: null, eligibleCases: null, csat: null, surveyCount: null, leaveDays, avgTTR: null, supportRegion: 'AMER', tzSidKey: 'America/Los_Angeles', isNewbie: false, topic: null, dailyTarget: 1.66, year, month, isCurrentMonth };
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtCount(v) { return (v == null || isNaN(v)) ? '—' : String(Math.round(v)); }
function fmtScore(v) { return (v == null || isNaN(v)) ? '—' : parseFloat(v).toFixed(2); }

// ── Card / dot status helpers ─────────────────────────────────────────────────

function setCardStatus(cardId, dotId, status) {
  const card = el(cardId);
  const dot  = el(dotId);
  if (card) { card.classList.remove('card-green', 'card-red', 'card-orange'); }
  if (dot)  { dot.classList.remove('dot-green', 'dot-red', 'dot-orange'); }
  if (status === 'green') {
    if (card) card.classList.add('card-green');
    if (dot)  dot.classList.add('dot-green');
  } else if (status === 'red') {
    if (card) card.classList.add('card-red');
    if (dot)  dot.classList.add('dot-red');
  } else if (status === 'orange') {
    if (card) card.classList.add('card-orange');
    if (dot)  dot.classList.add('dot-orange');
  }
}

function setValColor(elId, status) {
  const e = el(elId);
  if (!e) return;
  e.style.background          = status ? 'none' : '';
  e.style.webkitTextFillColor = status === 'green' ? 'var(--success)' : status === 'red' ? 'var(--danger)' : status === 'orange' ? 'var(--warning)' : '';
}

// ── Render dashboard ──────────────────────────────────────────────────────────

function renderDashboard({ closedCases, eligibleCases, csat, surveyCount, leaveDays, avgTTR, tzSidKey, isNewbie, topic, dailyTarget, year, month, isCurrentMonth }) {
  // Closed Cases
  el('closed-mine').textContent = fmtCount(closedCases);

  // TTR — green < 5d, orange = 5d, red > 5d
  if (avgTTR == null) {
    el('ttr-mine').textContent = '—';
    el('ttr-trend').textContent = '';
    setValColor('ttr-mine', null);
    setCardStatus('card-ttr', 'dot-ttr', null);
  } else {
    const { hours: ttrHours } = avgTTR;
    const ttrDays        = ttrHours / 24;
    const ttrDaysRounded = Math.round(ttrDays * 10) / 10;
    const ttrStatus      = ttrDaysRounded < 5 ? 'green' : ttrDaysRounded === 5 ? 'orange' : 'red';
    el('ttr-mine').textContent = fmtBizAge(ttrHours, 24);
    setValColor('ttr-mine', ttrStatus);
    el('ttr-trend').textContent = ttrDaysRounded < 5 ? '✓ Under 5d target' : ttrDaysRounded === 5 ? '● At 5d target' : '↑ Over 5d target';
    el('ttr-trend').style.color = ttrStatus === 'green' ? 'var(--success)' : ttrStatus === 'orange' ? 'var(--warning)' : 'var(--danger)';
    setCardStatus('card-ttr', 'dot-ttr', ttrStatus);
  }

  // CSAT
  el('csat-mine').textContent = fmtScore(csat);
  if (csat == null) {
    setValColor('csat-mine', null);
    el('csat-trend').textContent = '';
    setCardStatus('card-csat', 'dot-csat', null);
  } else if (csat > 4.55) {
    setValColor('csat-mine', 'green');
    el('csat-trend').textContent = '✓ Above KPI (4.55)';
    el('csat-trend').style.color = 'var(--success)';
    setCardStatus('card-csat', 'dot-csat', 'green');
  } else if (csat === 4.55) {
    setValColor('csat-mine', 'orange');
    el('csat-trend').textContent = '● At KPI (4.55)';
    el('csat-trend').style.color = 'var(--warning)';
    setCardStatus('card-csat', 'dot-csat', 'orange');
  } else {
    setValColor('csat-mine', 'red');
    const sum    = csat * (surveyCount ?? 0);
    const needed = Math.ceil((4.55 * (surveyCount ?? 0) - sum) / (5 - 4.55));
    el('csat-trend').textContent = `↑ Need ${needed} more 5-star`;
    el('csat-trend').style.color = 'var(--danger)';
    setCardStatus('card-csat', 'dot-csat', 'red');
  }

  // Survey Return Rate + Survey Count
  el('survey-mine').textContent = fmtCount(surveyCount);
  const rate         = (surveyCount != null && closedCases != null && closedCases > 0) ? (surveyCount / closedCases) * 100 : null;
  const rateRounded  = rate != null ? Math.round(rate) : null;
  const surveyStatus = rateRounded == null ? null : rateRounded > 15 ? 'green' : rateRounded === 15 ? 'orange' : 'red';
  el('survey-rate-mine').textContent = rate != null ? Math.round(rate) + '%' : '—';
  setValColor('survey-rate-mine', surveyStatus);
  setValColor('survey-mine', surveyStatus);
  el('survey-rate-trend').textContent = rate == null ? '' : rate > 15 ? '✓ Above KPI (15%)' : rate === 15 ? '● At KPI (15%)' : '↓ Below KPI (15%)';
  el('survey-rate-trend').style.color = surveyStatus === 'green' ? 'var(--success)' : surveyStatus === 'orange' ? 'var(--warning)' : surveyStatus === 'red' ? 'var(--danger)' : '';
  setCardStatus('card-survey-rate',  'dot-survey-rate',  surveyStatus);
  setCardStatus('card-survey-count', 'dot-survey-count', surveyStatus);

  // Leave counter
  el('leave-count').textContent = leaveDays || 0;
  const wDays = workingDaysInRange(year, month, isCurrentMonth, leaveDays, tzSidKey);
  el('leave-note').textContent = (leaveDays > 0)
    ? `Adjusted for ${leaveDays} leave day${leaveDays > 1 ? 's' : ''} — ${wDays} working days`
    : '';

  // Productivity — uses per-topic daily target, auto-detected from ServiceResource skills + tier
  const prod = calcProductivityWeighted(closedCases, dailyTarget, leaveDays, year, month, isCurrentMonth, tzSidKey);
  const topicLabel = topic ? topic.replace(/^[^-]+-/, '') : null; // strip prefix e.g. "Service-"
  const tierLabel  = isNewbie ? 'Newbie' : 'Experienced';
  if (prod == null) {
    el('prod-mine').textContent = '—';
    setValColor('prod-mine', null);
    setValColor('closed-mine', null);
    el('prod-trend').textContent  = topicLabel ? `${topicLabel} · ${tierLabel} · ${dailyTarget}/day` : '';
    el('prod-trend').style.color  = '';
    el('closed-trend').textContent = '';
    setCardStatus('card-prod',   'dot-prod',   null);
    setCardStatus('card-closed', 'dot-closed', null);
  } else {
    const prodStatus = prod > 100 ? 'green' : prod === 100 ? 'orange' : 'red';
    el('prod-mine').textContent = Math.round(prod) + '%';
    setValColor('prod-mine',   prodStatus);
    setValColor('closed-mine', prodStatus);
    const statusLine = prod > 100 ? '✓ Above target (100%)' : prod === 100 ? '● At target (100%)' : '↓ Below target (100%)';
    el('prod-trend').textContent  = topicLabel ? `${statusLine}  ·  ${topicLabel} · ${tierLabel} · ${dailyTarget}/day` : statusLine;
    el('prod-trend').style.color  = prodStatus === 'green' ? 'var(--success)' : prodStatus === 'orange' ? 'var(--warning)' : 'var(--danger)';
    el('closed-trend').textContent = '';
    setCardStatus('card-prod',   'dot-prod',   prodStatus);
    setCardStatus('card-closed', 'dot-closed', prodStatus);
  }

  setStatus(monthLabel(year, month), Date.now());
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function refresh() {
  setStatus('Loading…');
  el('btn-refresh').disabled = true;
  try {
    const data = await fetchDashboardData();
    renderDashboard(data);
  } catch (err) {
    const safeMsg = typeof err.message === 'string' && err.message.length < 120
      ? err.message : 'Something went wrong. Please try again.';
    setStatus(`Error: ${safeMsg}`);
  } finally {
    el('btn-refresh').disabled = false;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  el('btn-theme').textContent = dark ? '☀️' : '🌙';
  el('btn-theme').title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

function init() {
  buildMonthOptions();
  initMonthPicker();

  // Restore saved theme
  chrome.storage.local.get({ darkMode: false }, ({ darkMode }) => applyTheme(darkMode));

  el('btn-theme').addEventListener('click', () => {
    const dark = !document.body.classList.contains('dark');
    applyTheme(dark);
    chrome.storage.local.set({ darkMode: dark });
  });

  el('btn-refresh').addEventListener('click', refresh);
  el('btn-open-full').addEventListener('click', () =>
    chrome.tabs.create({ url: 'https://prod-uswest-c.online.tableau.com/#/site/salesforce/views/SupportEngineerPerformanceMetrics/SupportEngineerPerformanceMetrics?:iid=1' })
  );

  el('card-closed').addEventListener('click', async () => {
    el('case-list-panel').classList.remove('hidden');
    el('case-list-body').innerHTML = '<div class="case-list-loading">Loading…</div>';
    try {
      const { year, month } = getSelectedMonth();
      const { sessionId, userId, supportRegion } = await getSfSession();
      const cases = await fetchCaseList(sessionId, userId, year, month);
      renderCaseList(cases, supportRegion);
    } catch (err) {
      el('case-list-body').innerHTML = `<div class="case-list-loading">Error: ${err.message}</div>`;
    }
  });

  el('btn-case-list-back').addEventListener('click', () => {
    el('case-list-panel').classList.add('hidden');
  });

  el('btn-leave-minus').addEventListener('click', async () => {
    const { year, month } = getSelectedMonth();
    const cur = parseInt(el('leave-count').textContent, 10) || 0;
    if (cur <= 0) return;
    setLeaveDays(year, month, cur - 1);
    renderDashboard(await fetchDashboardData());
  });

  el('btn-leave-plus').addEventListener('click', async () => {
    const { year, month } = getSelectedMonth();
    const cur = parseInt(el('leave-count').textContent, 10) || 0;
    if (cur >= 31) return;
    setLeaveDays(year, month, cur + 1);
    renderDashboard(await fetchDashboardData());
  });

  refresh();
}

document.addEventListener('DOMContentLoaded', init);
