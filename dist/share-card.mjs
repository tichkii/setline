/* Share images are drawn locally. No images, trackers, or remote fonts are used. */
const WIDTH = 1080;
const INSET = 72;
const CONTENT_WIDTH = WIDTH - INSET * 2;
const COLORS = { background: '#111413', panel: '#1b201d', ink: '#f3f5f1', muted: '#a7b0a9', line: '#343c36' };
const DISPLAY_FONT = '"Space Grotesk", "Arial", sans-serif';
const BODY_FONT = '"Manrope", "Arial", sans-serif';
const segmenter = typeof Intl?.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function graphemes(text) {
  return segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
}

function font(ctx, size, weight = 500, family = BODY_FONT) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function ellipsis(ctx, value, width) {
  const text = cleanText(value);
  if (ctx.measureText(text).width <= width) return text;
  const chars = graphemes(text);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${chars.slice(0, middle).join('')}…`).width <= width) low = middle;
    else high = middle - 1;
  }
  return `${chars.slice(0, low).join('').trimEnd()}…`;
}

function wrap(ctx, value, width, maxLines) {
  const text = cleanText(value);
  if (!text) return [];
  const chars = graphemes(text);
  const lines = [];
  let start = 0;
  while (start < chars.length && lines.length < maxLines) {
    const remaining = chars.slice(start).join('');
    if (lines.length === maxLines - 1) {
      lines.push(ellipsis(ctx, remaining, width));
      break;
    }
    if (ctx.measureText(remaining).width <= width) {
      lines.push(remaining);
      break;
    }
    let end = start + 1;
    let lastSpace = -1;
    while (end <= chars.length && ctx.measureText(chars.slice(start, end).join('')).width <= width) {
      if (/\s/.test(chars[end - 1])) lastSpace = end - 1;
      end++;
    }
    // Prefer word boundaries; long unbroken names still wrap without splitting emoji.
    end = lastSpace > start ? lastSpace : Math.max(start + 1, end - 1);
    lines.push(chars.slice(start, end).join('').trim());
    start = end;
    while (start < chars.length && /\s/.test(chars[start])) start++;
  }
  return lines;
}

function fit(ctx, value, width, { size, min = size, weight = 600, family = DISPLAY_FONT } = {}) {
  const text = cleanText(value);
  let current = size;
  font(ctx, current, weight, family);
  while (current > min && ctx.measureText(text).width > width) {
    current = Math.max(min, current - 2);
    font(ctx, current, weight, family);
  }
  return ellipsis(ctx, text, width);
}

function lines(ctx, values, x, y, lineHeight, color = COLORS.ink) {
  ctx.fillStyle = color;
  values.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
}

function rule(ctx, y, x = INSET, width = CONTENT_WIDTH) {
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(x, y, width, 2);
}

function accentColor(value) {
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value.slice(1) : 'c3f078';
  const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  // The card stays dark even when shared from the light theme, so dark accents lighten.
  const luminance = (rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722) / 255;
  const mix = luminance < .6 ? (.6 - luminance) / (1 - luminance) : 0;
  return `rgb(${rgb.map(channel => Math.round(channel + (255 - channel) * mix)).join(', ')})`;
}

async function loadLocalFonts() {
  if (!document.fonts?.load) return;
  let timeout;
  try {
    await Promise.race([
      Promise.allSettled([
        document.fonts.load('600 74px "Space Grotesk"'),
        document.fonts.load('600 32px "Manrope"'),
        document.fonts.load('500 26px "Manrope"'),
      ]),
      new Promise(resolve => { timeout = setTimeout(resolve, 1800); }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Create a 1080px-wide PNG entirely on the device.
 * Put the primary metric (usually duration) first. Up to seven metrics and six
 * detail rows fit; pass a final summary row when grouping a longer exercise list.
 * All numbers/units/date ranges come from the caller, so the image cannot infer
 * a misleading statistic. The caller also supplies its accessible text version.
 */
export async function renderShareCard({ kind = 'workout', title, subtitle = '', metrics = [], rows = [], accent, footer = 'Made with Setline' } = {}) {
  if (typeof document === 'undefined') throw new Error('Share images require a browser.');
  await loadLocalFonts();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('This browser cannot create a share image.');

  const isStats = kind === 'stats';
  const highlight = accentColor(accent);
  const safeMetrics = (Array.isArray(metrics) ? metrics : []).filter(item => item && cleanText(item.value) !== '').slice(0, 7);
  const safeRows = (Array.isArray(rows) ? rows : []).filter(Boolean).slice(0, 6);
  font(ctx, 74, 600, DISPLAY_FONT);
  const titleLines = wrap(ctx, title || (isStats ? 'Training stats' : 'My workout'), CONTENT_WIDTH, 3);
  font(ctx, 26, 500);
  const subtitleLines = wrap(ctx, subtitle, CONTENT_WIDTH, 2);
  const subtitleY = 226 + titleLines.length * 82 + 14;
  const heroY = subtitleY + subtitleLines.length * 36 + 40;
  const secondary = safeMetrics.slice(1);
  const metricColumns = Math.min(3, secondary.length);
  const metricRows = metricColumns ? Math.ceil(secondary.length / metricColumns) : 0;
  const secondaryY = heroY + (safeMetrics.length ? 196 : 0);
  const rowsY = secondaryY + metricRows * 128 + (metricRows ? 30 : 0);
  const omittedRows = Math.max(0, (Array.isArray(rows) ? rows.filter(Boolean).length : 0) - safeRows.length);

  const detailLayouts = safeRows.map(item => {
    font(ctx, 29, 500);
    const labels = wrap(ctx, item.label, CONTENT_WIDTH - 338, 2);
    font(ctx, 27, 600, DISPLAY_FONT);
    const values = wrap(ctx, item.value, 294, 2);
    return { labels, values, height: Math.max(1, labels.length, values.length) * 37 + 36 };
  });
  const detailsHeight = detailLayouts.length ? 58 + detailLayouts.reduce((sum, row) => sum + row.height, 0) : 0;
  const footerY = Math.max(1130, rowsY + detailsHeight + (omittedRows ? 54 : 0) + 58);
  canvas.height = footerY + 124;
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, canvas.height);

  // Three strokes echo the app mark without implying chart or workout data.
  ctx.strokeStyle = highlight;
  ctx.lineWidth = 8;
  ctx.lineCap = 'square';
  [[74, 82, 90, 66], [87, 95, 116, 66], [113, 95, 129, 79]].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  font(ctx, 37, 600, DISPLAY_FONT);
  ctx.fillStyle = COLORS.ink;
  ctx.fillText('SETLINE', 151, 61);
  font(ctx, 19, 600);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'right';
  ctx.fillText('TRAINING LOG', WIDTH - INSET, 73);
  ctx.textAlign = 'left';
  rule(ctx, 135);

  font(ctx, 20, 600);
  ctx.fillStyle = highlight;
  ctx.fillText(isStats ? 'THE PROGRESS' : 'THE WORKOUT', INSET, 180);
  font(ctx, 74, 600, DISPLAY_FONT);
  lines(ctx, titleLines, INSET, 226, 82);
  font(ctx, 26, 500);
  lines(ctx, subtitleLines, INSET, subtitleY, 36, COLORS.muted);

  if (safeMetrics.length) {
    ctx.fillStyle = highlight;
    ctx.fillRect(INSET, heroY + 2, 5, 146);
    font(ctx, 22, 600);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(ellipsis(ctx, cleanText(safeMetrics[0].label).toUpperCase(), CONTENT_WIDTH - 36), INSET + 29, heroY);
    const primaryValue = fit(ctx, safeMetrics[0].value, CONTENT_WIDTH - 30, { size: 132, min: 62 });
    ctx.fillStyle = highlight;
    ctx.fillText(primaryValue, INSET + 25, heroY + 33);
  }

  if (secondary.length) {
    const columnWidth = CONTENT_WIDTH / metricColumns;
    secondary.forEach((metric, index) => {
      const column = index % metricColumns;
      const row = Math.floor(index / metricColumns);
      const x = INSET + column * columnWidth;
      const y = secondaryY + row * 128;
      rule(ctx, y, x, columnWidth - (column < metricColumns - 1 ? 26 : 0));
      font(ctx, 20, 500);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(ellipsis(ctx, metric.label, columnWidth - 30), x, y + 19);
      const value = fit(ctx, metric.value, columnWidth - 30, { size: 45, min: 27 });
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(value, x, y + 54);
    });
  }

  if (detailLayouts.length) {
    font(ctx, 20, 600);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(isStats ? 'HIGHLIGHTS' : 'SESSION DETAILS', INSET, rowsY);
    let y = rowsY + 58;
    detailLayouts.forEach((row, index) => {
      if (index % 2 === 0) {
        ctx.fillStyle = COLORS.panel;
        ctx.fillRect(INSET - 18, y - 12, CONTENT_WIDTH + 36, row.height);
      }
      font(ctx, 29, 500);
      lines(ctx, row.labels, INSET, y + 4, 37);
      ctx.textAlign = 'right';
      font(ctx, 27, 600, DISPLAY_FONT);
      lines(ctx, row.values, WIDTH - INSET, y + 6, 37, highlight);
      ctx.textAlign = 'left';
      y += row.height;
    });
    if (omittedRows) {
      font(ctx, 22, 500);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`+ ${omittedRows} more`, INSET, y + 15);
    }
  }

  rule(ctx, footerY);
  font(ctx, 21, 500);
  const footerLines = wrap(ctx, footer, CONTENT_WIDTH, 2);
  lines(ctx, footerLines, INSET, footerY + 32, 30, COLORS.muted);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      // Release the backing store after encoding; the PNG Blob owns its bytes.
      canvas.width = 1;
      canvas.height = 1;
      if (blob) resolve(blob);
      else reject(new Error('Could not create this share image. Try sharing text instead.'));
    }, 'image/png');
  });
}
