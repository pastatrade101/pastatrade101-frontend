// Branded, dependency-free PDF export. Builds a self-contained light-themed
// Pastatrade document (logo, cover image, market-status chips, sections,
// disclaimer) in a new window and triggers the browser's "Save as PDF". No
// server, no Chromium, crisp vector text.

export interface PrintReport {
  title: string;
  report_type: string;
  report_date: string;
  published_at?: string | null;
  language?: string;
  cover_image_url?: string | null;
  market_status?: { regime: string; btc_risk: string; altcoin: string; social: string } | null;
  scorecard?: { label: string; value: string; note: string }[] | null;
}
export interface PrintSection {
  section_key: string;
  section_title: string;
  content: string | null;
  is_premium?: boolean;
  data?: { coins?: { label: string; sub: string; image: string | null }[]; note?: string } | null;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MARK = `<svg viewBox="0 0 32 32" width="24" height="24" style="border-radius:6px"><rect width="32" height="32" rx="7" fill="#0b0e14"/><path d="M5 20 L12 13 L17 17 L27 7" fill="none" stroke="#37e0a6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27" cy="7" r="2.4" fill="#37e0a6"/></svg>`;

export function openReportPdf(report: PrintReport, sections: PrintSection[]): void {
  const w = window.open('', '_blank', 'width=920,height=1200');
  if (!w) {
    alert('Please allow pop-ups for this site to export the PDF.');
    return;
  }

  const typeLabel = report.report_type ? report.report_type.charAt(0).toUpperCase() + report.report_type.slice(1) : 'Report';
  const dateStr = report.published_at ? new Date(report.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : report.report_date;
  const ms = report.market_status;
  const lang = report.language === 'sw' ? 'Kiswahili' : 'English';

  const cover = report.cover_image_url ? `<img class="cover" src="${esc(report.cover_image_url)}" alt="" />` : '';

  const chips = ms
    ? `<div class="chips">
        <div class="chip"><span>Regime</span><b>${esc(ms.regime)}</b></div>
        <div class="chip"><span>BTC risk</span><b>${esc(ms.btc_risk)}</b></div>
        <div class="chip"><span>Altcoin</span><b>${esc(ms.altcoin)}</b></div>
        <div class="chip"><span>Social</span><b>${esc(ms.social)}</b></div>
      </div>`
    : '';

  const scorecard = report.scorecard?.length
    ? `<div class="scorecard">${report.scorecard
        .map((c) => `<div class="score"><span>${esc(c.label)}</span><b>${esc(c.value)}</b><i>${esc(c.note)}</i></div>`)
        .join('')}</div>`
    : '';

  const body = sections
    .filter((s) => s.section_key !== 'market_status' && (s.content || s.data?.coins?.length))
    .map((s) => {
      const title = esc(s.section_title);
      if (s.data?.coins?.length) {
        const rows = s.data.coins
          .map(
            (c) =>
              `<div class="crow">${c.image ? `<img class="cimg" src="${esc(c.image)}" alt="" />` : `<div class="cimg ph">${esc(c.label.slice(0, 2))}</div>`}<div class="cmeta"><b>${esc(c.label)}</b><span>${esc(c.sub)}</span></div></div>`
          )
          .join('');
        const note = s.data.note ? `<p class="cnote">${esc(s.data.note)}</p>` : '';
        return `<section class="sec"><h2>${title}</h2><div class="coins">${rows}</div>${note}</section>`;
      }
      const content = esc(s.content ?? '');
      if (s.section_key === 'premium_takeaway') return `<div class="takeaway"><h2>${title}</h2><p>${content}</p></div>`;
      if (s.section_key === 'disclaimer') return `<div class="disclaimer"><b>${title}.</b> ${content}</div>`;
      return `<section class="sec"><h2>${title}</h2><p>${content}</p></section>`;
    })
    .join('');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${esc(report.title)}</title>
<style>
  @page { margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a2230; margin: 0; padding: 0 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 2px solid #37e0a6; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .wm { font-size: 17px; font-weight: 700; color: #0e1117; letter-spacing: -.2px; }
  .wm i { font-style: normal; color: #37e0a6; }
  .sub { font-size: 10px; color: #6b7280; margin-top: 1px; }
  .meta { text-align: right; font-size: 11px; color: #6b7280; }
  .meta b { display:block; color:#0e1117; font-size: 12px; }
  h1 { font-size: 21px; line-height: 1.25; margin: 16px 0 6px; color: #0e1117; }
  .cover { width: 100%; max-height: 250px; object-fit: cover; border-radius: 10px; margin: 10px 0 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
  .chip { flex: 1 1 22%; min-width: 130px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 10px; background: #f9fafb; }
  .chip span { display:block; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
  .chip b { font-size: 12px; color: #0e1117; }
  .scorecard { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
  .score { flex: 1 1 22%; min-width: 130px; border: 1px solid rgba(55,224,166,.4); border-radius: 8px; padding: 8px 10px; background: rgba(55,224,166,.06); }
  .score span { display:block; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #0d8a66; }
  .score b { font-size: 16px; color: #0e1117; }
  .score i { display:block; font-style: normal; font-size: 9.5px; color: #6b7280; margin-top: 1px; }
  .sec { margin-top: 16px; page-break-inside: avoid; }
  .sec h2, .takeaway h2 { font-size: 13px; color: #0e1117; margin: 0 0 4px; padding-bottom: 4px; border-bottom: 1px solid #eef0f3; }
  .sec p, .takeaway p { font-size: 12px; line-height: 1.6; color: #374151; white-space: pre-line; margin: 0; }
  .coins { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
  .crow { display: flex; align-items: center; gap: 9px; }
  .cimg { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .cimg.ph { display: flex; align-items: center; justify-content: center; background: #eef0f3; color: #6b7280; font-size: 8px; font-weight: 700; }
  .cmeta b { font-size: 12px; color: #0e1117; }
  .cmeta span { display: block; font-size: 10.5px; color: #6b7280; }
  .cnote { font-size: 11px; color: #6b7280; line-height: 1.5; margin: 8px 0 0; }
  .takeaway { margin-top: 16px; padding: 12px 14px; border: 1px solid rgba(55,224,166,.45); background: rgba(55,224,166,.08); border-radius: 10px; page-break-inside: avoid; }
  .takeaway h2 { border: none; color: #0d8a66; padding: 0; }
  .disclaimer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #eef0f3; font-size: 10px; line-height: 1.5; color: #6b7280; }
  .foot { margin-top: 16px; font-size: 9.5px; color: #9aa3af; text-align: center; }
</style></head>
<body onload="setTimeout(function(){window.print();},120)" onafterprint="window.close()">
  <div class="head">
    <div class="brand">${MARK}<div><div class="wm">Pasta<i>trade</i></div><div class="sub">Market Intelligence</div></div></div>
    <div class="meta"><b>${esc(typeLabel)} Report</b>${esc(dateStr)} · ${lang}</div>
  </div>
  ${cover}
  <h1>${esc(report.title)}</h1>
  ${chips}
  ${scorecard}
  ${body}
  <div class="foot">Pastatrade · Market Intelligence — generated ${new Date().toLocaleDateString('en-GB')}. Not financial advice.</div>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
