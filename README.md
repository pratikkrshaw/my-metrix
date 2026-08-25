# My Metrix — Chrome Extension
**Developed by Pratik**

A personal productivity dashboard for Salesforce Support Engineers. Shows your monthly metrics — Productivity %, CSAT, Closed Cases, Survey Return Rate, Survey Count, and Avg TTR — pulled live from OrgCS.

---

## Install

1. Go to [Releases](https://github.com/pratikkrshaw/my-metrix/releases) and download the latest **Source code (zip)**
   - Or click **Code → Download ZIP** on the [repo homepage](https://github.com/pratikkrshaw/my-metrix)
2. Unzip the downloaded file
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (toggle, top-right)
5. Click **Load unpacked**
6. Select the unzipped `my-metrix` folder
7. The **My Metrix** icon appears in your Chrome toolbar

> **Before clicking the extension:** Make sure you are signed in to [orgcs.my.salesforce.com](https://orgcs.my.salesforce.com) in the same Chrome window.

---

## Requirements

- Must be signed in to **orgcs.my.salesforce.com** in the same browser
- The extension reads your session cookie — no password is stored anywhere

---

## Features

| Feature | Detail |
|---------|--------|
| Productivity % | Closed cases ÷ (2.3 × working days), adjusted for leave |
| CSAT Score | Average satisfaction score, KPI ≥ 4.55 |
| Closed Cases | Total cases closed in the selected month (tap to view list) |
| Survey Return Rate | Surveys ÷ closed cases, KPI ≥ 15% |
| Survey Count | Total surveys received |
| Avg TTR | Average Time to Resolution in days |
| Leave days | Adjust working days for leave taken |
| Month picker | View any of the last 12 months |
| Dark mode | Toggle light/dark theme |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Shows `—` for all metrics | Open `orgcs.my.salesforce.com` in a tab and sign in, then click Refresh |
| Session expired error | Sign in to OrgCS again and click Refresh |
| Numbers differ from Tableau | Check month selection and leave days match |
