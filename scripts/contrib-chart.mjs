// Generates assets/contributions.svg: a line chart of weekly contributions over the last year.
// Runs daily from .github/workflows/contrib-chart.yml (uses the built-in GITHUB_TOKEN).
// Run locally with:  node scripts/contrib-chart.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const USER = process.env.GH_USER || 'muhammad-humayun';
const TOKEN = process.env.GITHUB_TOKEN;

// #region Data
async function fromGitHub() {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    totalContributions weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'contrib-chart' },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API: ${JSON.stringify(json.errors || json)}`);
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  return cal.weeks.flatMap((w) => w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })));
}

async function fromPublicApi() {
  const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`);
  if (!res.ok) throw new Error(`Contributions API: HTTP ${res.status}`);
  const json = await res.json();
  return json.contributions.map((d) => ({ date: d.date, count: d.count }));
}

const days = (TOKEN ? await fromGitHub() : await fromPublicApi()).sort((a, b) => a.date.localeCompare(b.date));
if (days.length < 14) throw new Error('Not enough contribution data');

// Group into weeks of 7 days, oldest first.
const weeks = [];
for (let i = 0; i < days.length; i += 7) {
  const chunk = days.slice(i, i + 7);
  weeks.push({ start: chunk[0].date, total: chunk.reduce((s, d) => s + d.count, 0) });
}
const total = days.reduce((s, d) => s + d.count, 0);
// #endregion

// #region Chart
const W = 700, H = 220;
const pad = { l: 44, r: 20, t: 58, b: 34 };
const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
const max = Math.max(4, ...weeks.map((w) => w.total));
const niceMax = Math.ceil(max / 4) * 4;
const x = (i) => pad.l + (i / (weeks.length - 1)) * pw;
const y = (v) => pad.t + ph - (v / niceMax) * ph;
const pts = weeks.map((w, i) => [x(i), y(w.total)]);
const f = (n) => n.toFixed(1);

// Smooth curve (Catmull-Rom converted to cubic Bezier), kept inside the plot area.
const base = pad.t + ph;
const clamp = (v) => Math.min(base, Math.max(pad.t, v));
let line = `M${f(pts[0][0])},${f(pts[0][1])}`;
for (let i = 0; i < pts.length - 1; i++) {
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
  const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
  line += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
}
const area = `${line} L${f(pts.at(-1)[0])},${f(base)} L${f(pts[0][0])},${f(base)} Z`;

const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
  const v = Math.round(niceMax * t), gy = y(v);
  return `<line x1="${pad.l}" y1="${f(gy)}" x2="${W - pad.r}" y2="${f(gy)}" class="grid"/>` +
    `<text x="${pad.l - 8}" y="${f(gy + 4)}" text-anchor="end" class="axis">${v}</text>`;
}).join('');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let lastMonth = -1;
const labels = weeks.map((w, i) => {
  const m = Number(w.start.slice(5, 7)) - 1;
  if (m === lastMonth) return '';
  lastMonth = m;
  if (i === 0 || i > weeks.length - 3) return '';
  return `<text x="${f(x(i))}" y="${H - 12}" text-anchor="middle" class="axis">${MONTHS[m]}</text>`;
}).join('');

const peak = weeks.reduce((best, w, i) => (w.total > weeks[best].total ? i : best), 0);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Contributions in the last year: ${total}">
<style>
.title{font:600 16px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif;fill:#70a5fd}
.sub{font:400 12px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif;fill:#38bdae}
.axis{font:400 10px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif;fill:#7f8bb3}
.grid{stroke:#2a2e45;stroke-width:1}
</style>
<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bf91f3" stop-opacity=".55"/><stop offset="1" stop-color="#bf91f3" stop-opacity=".04"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="8" fill="#1a1b27"/>
<text x="${pad.l}" y="28" class="title">Contributions in the last year</text>
<text x="${pad.l}" y="46" class="sub">${total} contributions · weekly totals</text>
${grid}
<path d="${area}" fill="url(#fill)"/>
<path d="${line}" fill="none" stroke="#bf91f3" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${f(pts[peak][0])}" cy="${f(pts[peak][1])}" r="3.5" fill="#70a5fd"/>
${labels}
</svg>
`;
// #endregion

mkdirSync('assets', { recursive: true });
writeFileSync('assets/contributions.svg', svg);
console.log(`Wrote assets/contributions.svg (${weeks.length} weeks, ${total} contributions, peak ${weeks[peak].total}/week)`);
