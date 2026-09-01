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

function monthRange(year, month, tz) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < 2000 || y > 2100 || m < 1 || m > 12) {
    throw new Error('Invalid date range.');
  }
  const mm   = String(m).padStart(2, '0');
  const last = new Date(y, m, 0).getDate();
  const dd   = String(last).padStart(2, '0');
  if (!tz) {
    return { start: `${y}-${mm}-01T00:00:00Z`, end: `${y}-${mm}-${dd}T23:59:59Z` };
  }
  // Convert local midnight start/end to UTC using the engineer's timezone
  const toUTC = (localIso) => {
    try {
      // Find the UTC offset at this local datetime in the given tz
      const d = new Date(localIso + 'Z'); // treat as UTC first to get a Date object
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).formatToParts(d);
      const get = type => parts.find(p => p.type === type).value;
      const localStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
      // Offset = UTC time - local time (in ms)
      const offset = d.getTime() - new Date(localStr + 'Z').getTime();
      // Apply offset to the desired local time
      const localDate = new Date(localIso + 'Z');
      return new Date(localDate.getTime() + offset).toISOString().replace('.000Z', 'Z');
    } catch (_) {
      return localIso + 'Z';
    }
  };
  return {
    start: toUTC(`${y}-${mm}-01T00:00:00`),
    end:   toUTC(`${y}-${mm}-${dd}T23:59:59`),
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
  let days;
  if (isCurrentMonth) {
    days = tzToday.day;
  } else {
    days = new Date(year, month, 0).getDate();
  }
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return Math.max(0, count - (leaveDays || 0));
}

// Baseline targets from Engineer Complexity Targets Sheet15 (Cloud × Complexity → daily closure rate)
// Mandatory Security Controls targets derived to match Tableau 156% for Aug 1-24 2026
const TOPIC_TARGETS = {
  'Agentforce-Service': { daily: 2.3, newbie: 1.38 },
  'Account Engagement-Proactive Monitoring': { daily: 2.3, newbie: 1.38 },
  'Account Engagement-Salesforce Integration': { daily: 4.0, newbie: 2.4 },
  'Account Engagement-Third Party Integration': { daily: 4.0, newbie: 2.4 },
  'Admin Assist-Request for Admin Assist Services': { daily: 5.5, newbie: 3.3 },
  'Admin Assist-Salesforce CPQ': { daily: 5.5, newbie: 3.3 },
  'Admin Request': { daily: 5.5, newbie: 3.3 },
  'Anypoint Control Plane': { daily: 3.0, newbie: 1.8 },
  'Commerce - Customer Success Score': { daily: 2.3, newbie: 1.38 },
  'Commerce-B2B Classic': { daily: 2.2, newbie: 1.32 },
  'Commerce-B2B Developer Support': { daily: 2.2, newbie: 1.32 },
  'Commerce-B2B Lightning': { daily: 3.1, newbie: 1.86 },
  'Commerce-B2C Administration': { daily: 3.1, newbie: 1.86 },
  'Commerce-B2C Developer Support': { daily: 2.2, newbie: 1.32 },
  'Commerce-B2C Merchandising': { daily: 2.5, newbie: 1.5 },
  'Commerce-B2C Operations & Security': { daily: 2.5, newbie: 1.5 },
  'Commerce-B2C Performance Issues': { daily: 2.2, newbie: 1.32 },
  'Commerce-Chat': { daily: 2.3, newbie: 1.38 },
  'Commerce-Composable Storefront': { daily: 2.2, newbie: 1.32 },
  'Commerce-D2C': { daily: 3.1, newbie: 1.86 },
  'Commerce-D2C Developer Support': { daily: 2.2, newbie: 1.32 },
  'Commerce-Headless (PWA)': { daily: 2.2, newbie: 1.32 },
  'Commerce-Marketplace': { daily: 3.1, newbie: 1.86 },
  'Commerce-Omni-Channel Inventory': { daily: 2.5, newbie: 1.5 },
  'Commerce-Order Management': { daily: 2.5, newbie: 1.5 },
  'Commerce-Order Management (Salesforce)': { daily: 2.5, newbie: 1.5 },
  'Commerce-Proactive Monitoring': { daily: 3.0, newbie: 1.8 },
  'Community / Experience-CRM Analytics': { daily: 2.3, newbie: 1.38 },
  'Community / Experience-Config/Usage/Reports & Dashboards': { daily: 4.0, newbie: 2.4 },
  'Community / Experience-Developer Support': { daily: 2.3, newbie: 1.38 },
  'Community / Experience-Disability and Product Accessibility': { daily: 2.6, newbie: 1.56 },
  'Community / Experience-Email Delivery & Desktop Integrations': { daily: 2.6, newbie: 1.56 },
  'Community / Experience-Experience Builder and Content Management': { daily: 2.3, newbie: 1.38 },
  'Community / Experience-Experience Management and Workspaces': { daily: 2.3, newbie: 1.38 },
  'Community / Experience-Feature Activation': { daily: 9.4, newbie: 5.64 },
  'Community / Experience-Feature Activation & Limits': { daily: 9.4, newbie: 5.64 },
  'Community / Experience-Flow': { daily: 2.3, newbie: 1.38 },
  'Community / Experience-How-to, Setup, Configuration, Reports & Dashboards': { daily: 4.0, newbie: 2.4 },
  'Community / Experience-Mobile': { daily: 2.3, newbie: 1.38 },
  'Community / Experience-Mobile Apps': { daily: 2.6, newbie: 1.56 },
  'Community / Experience-Multi-Factor Authentication (MFA)': { daily: 2.6, newbie: 1.56 },
  'Community / Experience-Network Infrastructure and Core Maintenance': { daily: 2.6, newbie: 1.56 },
  'Community / Experience-Performance Issues': { daily: 4.0, newbie: 2.4 },
  'Community / Experience-Security': { daily: 2.6, newbie: 1.56 },
  'Community / Experience-Tableau CRM & Einstein Discovery': { daily: 2.3, newbie: 1.38 },
  'Core Connectivity': { daily: 3.0, newbie: 1.8 },
  'Core Runtime': { daily: 3.0, newbie: 1.8 },
  'Core-Chat': { daily: 7.5, newbie: 4.5 },
  'Engagement-Advertising Studio': { daily: 3.5, newbie: 2.1 },
  'Engagement-Connector/Distributed Marketing': { daily: 2.7, newbie: 1.62 },
  'Engagement-Einstein & Analytics': { daily: 2.7, newbie: 1.62 },
  'Engagement-Email Deliverability': { daily: 5.3, newbie: 3.18 },
  'Engagement-Email Studio': { daily: 5.3, newbie: 3.18 },
  'Engagement-Journey/Contact/Audience Builder': { daily: 5.3, newbie: 3.18 },
  'Engagement-MC Connector/Distributed Marketing': { daily: 2.7, newbie: 1.62 },
  'Engagement-Mobile': { daily: 2.7, newbie: 1.62 },
  'Engagement-Proactive Monitoring': { daily: 3.5, newbie: 2.1 },
  'Engagement-Programming Languages': { daily: 4.0, newbie: 2.4 },
  'Heroku - Customer Success Score': { daily: 2.3, newbie: 1.38 },
  'Industry-Automotive Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Business Rules Engine (BRE)': { daily: 2.2, newbie: 1.32 },
  'Industry-CPQ / Order Management / Digital Commerce': { daily: 2.2, newbie: 1.32 },
  'Industry-CRM Analytics': { daily: 2.2, newbie: 1.32 },
  'Industry-Communication': { daily: 2.2, newbie: 1.32 },
  'Industry-Communication Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Communication, Media or Energy Cloud (Vlocity)': { daily: 2.2, newbie: 1.32 },
  'Industry-Communication, Media or Energy Cloud - CPQ/OM/DC API (Vlocity)': { daily: 2.2, newbie: 1.32 },
  'Industry-Config/Usage/Reports & Dashboards': { daily: 3.5, newbie: 2.1 },
  'Industry-Consumer Goods Cloud': { daily: 2.4, newbie: 1.44 },
  'Industry-Developer Support': { daily: 2.2, newbie: 1.32 },
  'Industry-Disability and Product Accessibility': { daily: 2.6, newbie: 1.56 },
  'Industry-Education Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Education Data Architecture (EDA)': { daily: 2.2, newbie: 1.32 },
  'Industry-Education Packages': { daily: 2.2, newbie: 1.32 },
  'Industry-Education Packages (Other SFDO)': { daily: 2.2, newbie: 1.32 },
  'Industry-Einstein Analytics': { daily: 2.2, newbie: 1.32 },
  'Industry-Email Delivery & Desktop Integrations': { daily: 2.6, newbie: 1.56 },
  'Industry-Energy & Utilities Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Financial Services': { daily: 2.2, newbie: 1.32 },
  'Industry-Flow': { daily: 2.4, newbie: 1.44 },
  'Industry-Health & Insurance': { daily: 2.2, newbie: 1.32 },
  'Industry-Health & Insurance (Vlocity)': { daily: 2.2, newbie: 1.32 },
  'Industry-Health & Insurance or Public Sector (Vlocity)': { daily: 2.2, newbie: 1.32 },
  'Industry-Health Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-How-to, Setup, Configuration, Reports & Dashboards': { daily: 3.5, newbie: 2.1 },
  'Industry-Life Sciences': { daily: 2.2, newbie: 1.32 },
  'Industry-Lightning Scheduler': { daily: 2.2, newbie: 1.32 },
  'Industry-Loyalty Management': { daily: 2.2, newbie: 1.32 },
  'Industry-Loyalty Management / Net Zero Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Loyalty Management / Sustainability Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Manufacturing Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Manufacturing Cloud / Consumer Goods Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Manufacturing Cloud / Consumer Goods Cloud / Loyalty Management': { daily: 2.2, newbie: 1.32 },
  'Industry-Media Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Mobile': { daily: 2.6, newbie: 1.56 },
  'Industry-Net Zero Cloud': { daily: 2.2, newbie: 1.32 },
  'Industry-Network Infrastructure and Core Maintenance': { daily: 2.6, newbie: 1.56 },
  'Industry-Nonprofit Packages': { daily: 2.2, newbie: 1.32 },
  'Industry-Nonprofit Packages (Other SFDO)': { daily: 2.2, newbie: 1.32 },
  'Industry-Nonprofit Success Pack (NPSP)': { daily: 2.2, newbie: 1.32 },
  'Industry-OmniStudio': { daily: 2.2, newbie: 1.32 },
  'Industry-Performance': { daily: 2.6, newbie: 1.56 },
  'Industry-Public Sector (Vlocity)': { daily: 2.2, newbie: 1.32 },
  'Industry-Public Sector Solutions': { daily: 2.2, newbie: 1.32 },
  'Industry-Retail and Consumer Goods': { daily: 2.2, newbie: 1.32 },
  'Industry-Scalability Tools': { daily: 2.4, newbie: 1.44 },
  'Industry-Security': { daily: 2.6, newbie: 1.56 },
  'Industry-Tableau CRM & Einstein Discovery': { daily: 2.2, newbie: 1.32 },
  'Intelligence-Administration/Settings/Marketplace': { daily: 4.0, newbie: 2.4 },
  'Intelligence-Analyze & Act': { daily: 3.5, newbie: 2.1 },
  'Intelligence-Connect & Mix': { daily: 4.0, newbie: 2.4 },
  'Intelligence-Proactive Monitoring': { daily: 2.3, newbie: 1.38 },
  'Intelligence-Visualize': { daily: 4.0, newbie: 2.4 },
  'Marketing - Account Engagement (fka Pardot) - Customer Success Score': { daily: 2.3, newbie: 1.38 },
  'Marketing - Account Engagement (fka Pardot) - Proactive Monitoring': { daily: 2.3, newbie: 1.38 },
  'Marketing - Account Engagement (fka Pardot) - Proactive Monitoring Deliverables': { daily: 2.3, newbie: 1.38 },
  'Marketing - Account Engagement (fka Pardot) - Salesforce Integration': { daily: 4.0, newbie: 2.4 },
  'Marketing - Account Engagement (fka Pardot) - Third Party Integration': { daily: 4.0, newbie: 2.4 },
  'Marketing App-Content': { daily: 2.7, newbie: 1.62 },
  'Marketing App-Messaging': { daily: 2.7, newbie: 1.62 },
  'Marketing App-Reporting & Analytics': { daily: 2.7, newbie: 1.62 },
  'Marketing App-Segmentation': { daily: 2.7, newbie: 1.62 },
  'Marketing Intelligence App (on Data Cloud)-Analytics': { daily: 2.7, newbie: 1.62 },
  'Marketing Intelligence App (on Data Cloud)-Customer-Owned Security Incident': { daily: 5.3, newbie: 3.18 },
  'Marketing Intelligence App (on Data Cloud)-DORA-Customer Owned Security Incident/Investigation': { daily: 5.3, newbie: 3.18 },
  'Marketing Intelligence App (on Data Cloud)-DORA-Non Security': { daily: 5.3, newbie: 3.18 },
  'Marketing Intelligence App (on Data Cloud)-Data Management': { daily: 2.7, newbie: 1.62 },
  'Marketing Intelligence App (on Data Cloud)-Planning': { daily: 2.7, newbie: 1.62 },
  'Marketing-Engagement-Proactive Monitoring Deliverables': { daily: 2.3, newbie: 1.38 },
  'MuleSoft-JIRA Service Trace': { daily: 3.0, newbie: 1.8 },
  'MuleSoft-Zendesk Dataloader': { daily: 2.3, newbie: 1.38 },
  'Mulesoft - Customer Success Score': { daily: 2.3, newbie: 1.38 },
  'Mulesoft-API Development': { daily: 1.8, newbie: 1.08 },
  'Mulesoft-Anypoint Connectors': { daily: 1.8, newbie: 1.08 },
  'Mulesoft-Anypoint Control Plane': { daily: 1.9, newbie: 1.14 },
  'Mulesoft-Anypoint Platform - GovCloud': { daily: 3.0, newbie: 1.8 },
  'Mulesoft-Anypoint Private Cloud Edition': { daily: 1.8, newbie: 1.08 },
  'Mulesoft-Anypoint Runtime Fabric': { daily: 1.9, newbie: 1.14 },
  'Mulesoft-Automation-Flow': { daily: 1.9, newbie: 1.14 },
  'Mulesoft-Composer for Salesforce': { daily: 1.9, newbie: 1.14 },
  'Mulesoft-Connectors Development': { daily: 1.8, newbie: 1.08 },
  'Mulesoft-Flex Gateway Execution': { daily: 1.9, newbie: 1.14 },
  'Mulesoft-Flex Gateway Installation & Infrastructure': { daily: 1.9, newbie: 1.14 },
  'Mulesoft-How To and General Enquiry': { daily: 2.3, newbie: 1.38 },
  'Mulesoft-Infrastructure & Networking': { daily: 1.9, newbie: 1.14 },
  'Mulesoft-Mule Runtime': { daily: 1.8, newbie: 1.08 },
  'Mulesoft-Mulesoft Composer': { daily: 1.8, newbie: 1.08 },
  'Mulesoft-Mulesoft RPA': { daily: 1.8, newbie: 1.08 },
  'NonProfit, Education and Power of Us-Education Cloud': { daily: 2.2, newbie: 1.32 },
  'NonProfit, Education and Power of Us-Non Profit Cloud': { daily: 2.2, newbie: 1.32 },
  'NonProfit, Education and Power of Us-Philanthropy Cloud': { daily: 2.2, newbie: 1.32 },
  'NonProfit, Education and Power of Us-Power of Us': { daily: 2.2, newbie: 1.32 },
  'Nonprofit and Education-Philanthropy Cloud': { daily: 2.2, newbie: 1.32 },
  'Nonprofit-Education Cloud': { daily: 2.2, newbie: 1.32 },
  'Nonprofit-Nonprofit Cloud': { daily: 2.2, newbie: 1.32 },
  'Nonprofit-Philanthropy Cloud': { daily: 2.2, newbie: 1.32 },
  'Other Salesforce-Emergency Response Management': { daily: 2.0, newbie: 1.2 },
  'Other Salesforce-Quip': { daily: 4.0, newbie: 2.4 },
  'Other Salesforce-Salesforce Anywhere ( Quip )': { daily: 2.0, newbie: 1.2 },
  'Other Salesforce-Salesforce Elastic Services, Functions': { daily: 2.0, newbie: 1.2 },
  'Other Salesforce-Salesforce Functions Product': { daily: 2.0, newbie: 1.2 },
  'Other Salesforce-Slack': { daily: 2.0, newbie: 1.2 },
  'Other Salesforce-Vaccine Management': { daily: 2.0, newbie: 1.2 },
  'Other Salesforce-Vaccine Management ( VAXX )': { daily: 2.0, newbie: 1.2 },
  'Other Salesforce-Vaccine Management/Work.com': { daily: 2.0, newbie: 1.2 },
  'Other Salesforce-myTrailhead': { daily: 2.0, newbie: 1.2 },
  'Personalization App (on Data Cloud)-Analytics & Reporting': { daily: 2.0, newbie: 1.2 },
  'Personalization App (on Data Cloud)-Customer-Owned Security Incident': { daily: 4.0, newbie: 2.4 },
  'Personalization App (on Data Cloud)-DORA-Customer Owned Security Incident/Investigation': { daily: 4.0, newbie: 2.4 },
  'Personalization App (on Data Cloud)-DORA-Non Security': { daily: 4.0, newbie: 2.4 },
  'Personalization App (on Data Cloud)-Decision Module': { daily: 2.0, newbie: 1.2 },
  'Personalization App (on Data Cloud)-Recommender & Personalization Point': { daily: 2.0, newbie: 1.2 },
  'Personalization-Account Config/Reporting/UI': { daily: 3.5, newbie: 2.1 },
  'Personalization-Integrations': { daily: 3.5, newbie: 2.1 },
  'Personalization-Sitemap/Templates/Campaigns/Recipes': { daily: 2.7, newbie: 1.62 },
  'Platform-Proactive Monitoring Deliverables': { daily: 2.3, newbie: 1.38 },
  'Revenue Cloud (Core)-Advanced Configurator': { daily: 2.2, newbie: 1.32 },
  'Revenue Cloud (Core)-Billing': { daily: 2.2, newbie: 1.32 },
  'Revenue Cloud (Core)-Usage Management': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management - Developer Support - Contracts, Orders, and DRO': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Advanced Approvals': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Asset Lifecycle Management': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Business Rules Engine': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Configuration': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Content': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Contract Lifecycle Management with DocGen': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Developer Support - Invoice to Cash': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Developer Support - OmniStudio and DocGen': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Developer Support - Product to Order': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Developer Support - Product, Pricing, Config': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Invoice Management': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Messaging': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-OmniStudio': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Price Management': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Product Catalog Management': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Quote to Order Capture': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Reporting & Analytics': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Salesforce Pricing': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Segmentation': { daily: 2.2, newbie: 1.32 },
  'Revenue Lifecycle Management-Transaction Management': { daily: 2.2, newbie: 1.32 },
  'Revenue-Billing Developer Support': { daily: 2.2, newbie: 1.32 },
  'Revenue-CPQ Developer Support': { daily: 2.2, newbie: 1.32 },
  'Revenue-Document Generation': { daily: 2.2, newbie: 1.32 },
  'Revenue-Go-Live Monitoring': { daily: 3.5, newbie: 2.1 },
  'Revenue-Salesforce Billing': { daily: 2.2, newbie: 1.32 },
  'Revenue-Salesforce CPQ': { daily: 2.2, newbie: 1.32 },
  'Revenue-Salesforce Contracts': { daily: 2.2, newbie: 1.32 },
  'Revenue-Salesforce Subscription Management': { daily: 2.2, newbie: 1.32 },
  'SaaS development and Studio': { daily: 3.0, newbie: 1.8 },
  'Sales - Customer Success Score': { daily: 2.3, newbie: 1.38 },
  'Sales-AppExchange & Managed Packages': { daily: 2.3, newbie: 1.38 },
  'Sales-CPQ or Billing': { daily: 2.5, newbie: 1.5 },
  'Sales-CRM Analytics': { daily: 2.5, newbie: 1.5 },
  'Sales-Config/Usage/Reports & Dashboards': { daily: 3.6, newbie: 2.16 },
  'Sales-Copilot Actions': { daily: 2.3, newbie: 1.38 },
  'Sales-Developer Support': { daily: 2.3, newbie: 1.38 },
  'Sales-Disability and Product Accessibility': { daily: 2.6, newbie: 1.56 },
  'Sales-Einstein Analytics': { daily: 2.5, newbie: 1.5 },
  'Sales-Einstein for Sales': { daily: 3.6, newbie: 2.16 },
  'Sales-Email Delivery & Desktop Integrations': { daily: 2.6, newbie: 1.56 },
  'Sales-How-to, Setup, Configuration, Data Management': { daily: 3.6, newbie: 2.16 },
  'Sales-How-to, Setup, Configuration, Reports & Dashboards': { daily: 3.6, newbie: 2.16 },
  'Sales-Leads, Opportunities, Campaigns, Sales Engagement, Sales Enablement': { daily: 3.6, newbie: 2.16 },
  'Sales-Mandatory Security Controls': { daily: 2.19, newbie: 1.314 },
  'Sales-Mobile': { daily: 2.6, newbie: 1.56 },
  'Sales-Mobile Apps': { daily: 2.6, newbie: 1.56 },
  'Sales-Multi-Factor Authentication': { daily: 2.6, newbie: 1.56 },
  'Sales-Network Infrastructure and Core Maintenance': { daily: 2.6, newbie: 1.56 },
  'Sales-Performance Issues': { daily: 2.6, newbie: 1.56 },
  'Sales-Proactive Monitoring': { daily: 2.6, newbie: 1.56 },
  'Sales-Quip': { daily: 2.5, newbie: 1.5 },
  'Sales-Reports and Dashboards': { daily: 3.6, newbie: 2.16 },
  'Sales-Security': { daily: 2.6, newbie: 1.56 },
  'Sales-Spiff': { daily: 3.6, newbie: 2.16 },
  'Sales-Tableau CRM & Einstein Discovery': { daily: 2.5, newbie: 1.5 },
  'Sales-Territory & Order Management': { daily: 2.5, newbie: 1.5 },
  'Sales-Territory & Order Management, Forecasting & Opportunities': { daily: 2.5, newbie: 1.5 },
  'Sales-Territory Management, Forecasting': { daily: 2.5, newbie: 1.5 },
  'Sales-Territory Management, Forecasting & Prediction Builder': { daily: 2.5, newbie: 1.5 },
  'Scale Center-Scale Center': { daily: 2.0, newbie: 1.2 },
  'Service - AgentforEmail': { daily: 2.3, newbie: 1.38 },
  'Service - Customer Success Score': { daily: 2.3, newbie: 1.38 },
  'Service-Agentforce For Dev': { daily: 2.3, newbie: 1.38 },
  'Service-AppExchange & Managed Packages': { daily: 2.3, newbie: 1.38 },
  'Service-CRM Analytics': { daily: 2.3, newbie: 1.38 },
  'Service-Config/Usage/Reports & Dashboards': { daily: 4.0, newbie: 2.4 },
  'Service-Copilot Action': { daily: 2.3, newbie: 1.38 },
  'Service-Developer Support': { daily: 2.3, newbie: 1.38 },
  'Service-Developer Tools': { daily: 2.3, newbie: 1.38 },
  'Service-Digital Engagement': { daily: 2.3, newbie: 1.38 },
  'Service-Disability and Product Accessibility': { daily: 2.6, newbie: 1.56 },
  'Service-Einstein Analytics': { daily: 2.3, newbie: 1.38 },
  'Service-Email Delivery & Desktop Integrations': { daily: 2.6, newbie: 1.56 },
  'Service-Experience Builder and Content Management': { daily: 2.3, newbie: 1.38 },
  'Service-Experience Management and Workspaces': { daily: 2.3, newbie: 1.38 },
  'Service-Field Service': { daily: 2.3, newbie: 1.38 },
  'Service-Flow': { daily: 2.3, newbie: 1.38 },
  'Service-How-to, Setup, Configuration, Data Management': { daily: 4.0, newbie: 2.4 },
  'Service-Mandatory Security Controls': { daily: 2.19, newbie: 1.314 },
  'Service-Mobile': { daily: 2.6, newbie: 1.56 },
  'Service-Mobile Apps': { daily: 2.6, newbie: 1.56 },
  'Service-Multi-Factor Authentication (MFA)': { daily: 2.6, newbie: 1.56 },
  'Service-Network Infrastructure and Core Maintenance': { daily: 2.6, newbie: 1.56 },
  'Service-Performance Issues': { daily: 2.6, newbie: 1.56 },
  'Service-Proactive Monitoring': { daily: 2.6, newbie: 1.56 },
  'Service-Prompt Builder': { daily: 2.3, newbie: 1.38 },
  'Service-Reports and Dashboards': { daily: 4.0, newbie: 2.4 },
  'Service-Salesforce Scheduler': { daily: 2.3, newbie: 1.38 },
  'Service-Security': { daily: 2.6, newbie: 1.56 },
  'Service-Security & Activations': { daily: 2.344, newbie: 1.4064 },
  'Service-Service Cloud Voice': { daily: 2.3, newbie: 1.38 },
  'Service-Slack for Service, Feedback Management, Employee Service ITSM  -  Slack Set up, Slack errors, Surveys Set up ,Surveys Error, Feedback management, Employee service, incident management': { daily: 2.3, newbie: 1.38 },
  'Service-Tableau CRM & Einstein Discovery': { daily: 2.3, newbie: 1.38 },
  'Service-Territory & Order Management, Forecasting & Opportunities': { daily: 2.3, newbie: 1.38 },
  'Slack - Customer Success Score': { daily: 2.3, newbie: 1.38 },
  'Slack - Internal/Non-Routing': { daily: 2.3, newbie: 1.38 },
  'Systems and Infrastructure': { daily: 3.0, newbie: 1.8 },
  'Tableau - Internal/Non-Routing': { daily: 2.3, newbie: 1.38 },
  'Tableau Cloud-Authentication & Configuration': { daily: 2.6, newbie: 1.56 },
  'Tableau Cloud-Connecting to Data': { daily: 2.1, newbie: 1.26 },
  'Tableau Cloud-Dashboards & Flows': { daily: 2.2, newbie: 1.32 },
  'Tableau Cloud-Licensing & Site Management': { daily: 2.6, newbie: 1.56 },
  'Tableau Cloud-Performance & Stability': { daily: 2.1, newbie: 1.26 },
  'Tableau Cloud-Proactive Monitoring': { daily: 2.1, newbie: 1.26 },
  'Tableau Cloud-Proactive Monitoring Deliverables': { daily: 2.1, newbie: 1.26 },
  'Tableau Cloud-Pulse': { daily: 2.2, newbie: 1.32 },
  'Tableau Cloud-Security': { daily: 2.2, newbie: 1.32 },
  'Tableau Desktop & Prep Builder-Authoring Dashboards': { daily: 2.6, newbie: 1.56 },
  'Tableau Desktop & Prep Builder-Connecting to Data': { daily: 2.1, newbie: 1.26 },
  'Tableau Desktop & Prep Builder-Developer Support': { daily: 2.1, newbie: 1.26 },
  'Tableau Desktop & Prep Builder-Flows in Prep': { daily: 2.2, newbie: 1.32 },
  'Tableau Desktop & Prep Builder-Licensing & Installation': { daily: 2.6, newbie: 1.56 },
  'Tableau Desktop & Prep Builder-Performance & Stability': { daily: 2.1, newbie: 1.26 },
  'Tableau Desktop & Prep Builder-Proactive Monitoring': { daily: 2.3, newbie: 1.38 },
  'Tableau Desktop & Prep Builder-Publishing Flows & Workbooks': { daily: 2.2, newbie: 1.32 },
  'Tableau Desktop & Prep Builder-Security': { daily: 2.2, newbie: 1.32 },
  'Tableau Server & Mobile App-Connecting to Data': { daily: 2.1, newbie: 1.26 },
  'Tableau Server & Mobile App-Content Migration Tool (CMT)': { daily: 2.2, newbie: 1.32 },
  'Tableau Server & Mobile App-Dashboards & Flows': { daily: 2.2, newbie: 1.32 },
  'Tableau Server & Mobile App-Developer Support': { daily: 2.1, newbie: 1.26 },
  'Tableau Server & Mobile App-Licensing & Installation': { daily: 2.6, newbie: 1.56 },
  'Tableau Server & Mobile App-Mobile App': { daily: 2.2, newbie: 1.32 },
  'Tableau Server & Mobile App-Performance & Stability': { daily: 2.1, newbie: 1.26 },
  'Tableau Server & Mobile App-Proactive Monitoring': { daily: 2.3, newbie: 1.38 },
  'Tableau Server & Mobile App-Resource Monitoring Tool (RMT)': { daily: 2.2, newbie: 1.32 },
  'Tableau Server & Mobile App-Security': { daily: 2.2, newbie: 1.32 },
  'Tableau Server & Mobile App-Server Authentication': { daily: 2.1, newbie: 1.26 },
};

function getDailyTarget(topic, isNewbie) {
  const t = TOPIC_TARGETS[topic];
  if (!t) return isNewbie ? 0.99 : 1.66;
  return isNewbie ? t.newbie : t.daily;
}

function calcWeightedAvgTarget(cases, isNewbie) {
  if (!cases || !cases.length) return null;
  let weightedSum = 0;
  let count = 0;
  for (const c of cases) {
    const topic = c.cssf_Product_Topic_Name__c;
    if (!topic) continue;
    const t = TOPIC_TARGETS[topic];
    if (!t) continue;
    weightedSum += isNewbie ? t.newbie : t.daily;
    count++;
  }
  if (count === 0) return null;
  return weightedSum / count;
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

// Month boundary timezone per support region — so ClosedDate filtering aligns with the region's calendar day
const REGION_TZ = {
  AMER: 'America/Los_Angeles', // Pacific Time — AMER region day ends at PT midnight
  EMEA: 'Europe/Dublin',
  APAC: 'Asia/Kolkata',
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

        const skillResp = await fetch(`${base}/query/?q=${encodeURIComponent(`SELECT Skill.MasterLabel FROM ServiceResourceSkill WHERE ServiceResourceId = '${srRec.Id}' AND EffectiveEndDate = null ORDER BY CreatedDate DESC LIMIT 20`)}`, { headers });
        if (skillResp.ok) {
          const skills = (await skillResp.json()).records ?? [];
          const SKILL_ALIAS = {
            'Service-Exp Builder':                       'Service-Experience Builder and Content Management',
            'Service-Management & Workspaces':           'Service-Experience Management and Workspaces',
            'Service-Setup':                             'Service-How-to, Setup, Configuration, Data Management',
            'Service-Cases Knowledge and Console':       'Service-Config/Usage/Reports & Dashboards',
            'Service-Appexchange':                       'Service-AppExchange & Managed Packages',
            'Service-Security & Activations':            'Service-Security',
            'Service-Agentforce':                        'Service-Agentforce For Dev',
            'Service-Agentic Service & Operations Mgmt': 'Service-Agentforce For Dev',
          };
          const labels = skills.map(s => {
            const raw = s.Skill?.MasterLabel || '';
            return SKILL_ALIAS[raw] || raw;
          });
          topic = labels.find(l => TOPIC_TARGETS[l]) ?? null;
        }
      }
    }
  } catch (_) { /* non-fatal — fall back to defaults */ }

  return { sessionId: cookie.value, userId, supportRegion, tzSidKey, isNewbie, topic };
}

// ── Salesforce queries ────────────────────────────────────────────────────────

async function fetchSfClosedCases(sessionId, userId, year, month, tz) {
  const base    = 'https://orgcs.my.salesforce.com/services/data/v62.0';
  const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionId}` };
  const { start, end } = monthRange(year, month, tz);

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

async function fetchSfSurveyData(sessionId, userId, year, month, tz) {
  const base    = 'https://orgcs.my.salesforce.com/services/data/v62.0';
  const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionId}` };
  const { start, end } = monthRange(year, month, tz);
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

async function fetchCaseList(sessionId, userId, year, month, tz) {
  const base    = 'https://orgcs.my.salesforce.com/services/data/v62.0';
  const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionId}` };
  const { start, end } = monthRange(year, month, tz);
  const soql = `SELECT Id, CaseNumber, Subject, CreatedDate, ClosedDate, cssf_Product_Topic_Name__c FROM Case WHERE OwnerId = '${userId}' AND Status = 'Closed' AND ClosedDate >= ${start} AND ClosedDate <= ${end} ORDER BY ClosedDate DESC LIMIT 200`;

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
    const regionTz = REGION_TZ[supportRegion] || REGION_TZ.AMER;
    const [{ total: closedCases, eligibleCases }, { csat, surveyCount }, leaveDays, cases] = await Promise.all([
      fetchSfClosedCases(sessionId, userId, year, month, regionTz),
      fetchSfSurveyData(sessionId, userId, year, month, regionTz),
      getLeaveDays(year, month),
      fetchCaseList(sessionId, userId, year, month, regionTz),
    ]);
    const avgTTR        = calcAvgTTR(cases, supportRegion);
    const weightedTarget = calcWeightedAvgTarget(cases, isNewbie);
    const dailyTarget    = weightedTarget ?? getDailyTarget(topic, isNewbie);
    const isWeightedAvg  = weightedTarget != null;
    return { closedCases, eligibleCases, csat, surveyCount, leaveDays, avgTTR, supportRegion, tzSidKey, isNewbie, topic, dailyTarget, isWeightedAvg, year, month, isCurrentMonth };
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

function renderDashboard({ closedCases, csat, surveyCount, leaveDays, avgTTR, tzSidKey, isNewbie, topic, dailyTarget, isWeightedAvg, year, month, isCurrentMonth }) {
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

  // Productivity — weighted avg of per-case topic targets (falls back to skill-based target)
  const prod = calcProductivityWeighted(closedCases, dailyTarget, leaveDays, year, month, isCurrentMonth, tzSidKey);
  const topicLabel  = !isWeightedAvg && topic ? topic.replace(/^[^-]+-/, '') : null;
  const tierLabel   = isNewbie ? 'Newbie' : 'Experienced';
  const targetLabel = isWeightedAvg
    ? `Wtd avg ${dailyTarget.toFixed(2)}/day · ${tierLabel}`
    : (topicLabel ? `${topicLabel} · ${tierLabel} · ${dailyTarget}/day` : '');
  if (prod == null) {
    el('prod-mine').textContent = '—';
    setValColor('prod-mine', null);
    setValColor('closed-mine', null);
    el('prod-trend').textContent  = targetLabel;
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
    el('prod-trend').textContent  = statusLine;
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
