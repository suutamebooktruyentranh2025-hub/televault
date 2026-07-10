function formatAxisValue(value, mode) {
  if (mode === 'bytes') {
    if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)}G`;
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(0)}M`;
    if (value >= 1024) return `${(value / 1024).toFixed(0)}K`;
    return String(Math.round(value));
  }
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function formatShortDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${month}/${day}`;
}

export function DashboardUploadChart({ data, mode, emptyLabel, countLabel, bytesLabel }) {
  const points = data || [];
  const values = points.map((d) => (mode === 'bytes' ? d.bytes : d.fileCount));
  const max = Math.max(1, ...values);
  const hasData = values.some((v) => v > 0);

  const width = 640;
  const height = 200;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const coords = values.map((v, i) => {
    const x = padLeft + (i / Math.max(1, values.length - 1)) * chartW;
    const y = padTop + chartH - (v / max) * chartH;
    return { x, y, v };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const yAxisLabel = mode === 'bytes' ? bytesLabel : countLabel;
  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date;

  return (
    <div className="gd-dashboard-chart">
      {!hasData ? (
        <p className="gd-dashboard-empty">{emptyLabel}</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="gd-dashboard-chart-svg" role="img" aria-hidden>
          {[0, 0.5, 1].map((t) => {
            const y = padTop + chartH * (1 - t);
            const val = max * t;
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  className="gd-dashboard-chart-grid"
                />
                <text x={padLeft - 6} y={y + 4} textAnchor="end" className="gd-dashboard-chart-axis">
                  {formatAxisValue(val, mode)}
                </text>
              </g>
            );
          })}
          <polyline points={polyline} className="gd-dashboard-chart-line" fill="none" />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={3} className="gd-dashboard-chart-dot" />
          ))}
          {firstDate ? (
            <text x={padLeft} y={height - 6} className="gd-dashboard-chart-axis">
              {formatShortDate(firstDate)}
            </text>
          ) : null}
          {lastDate && lastDate !== firstDate ? (
            <text x={width - padRight} y={height - 6} textAnchor="end" className="gd-dashboard-chart-axis">
              {formatShortDate(lastDate)}
            </text>
          ) : null}
        </svg>
      )}
      <p className="gd-dashboard-chart-caption">{yAxisLabel}</p>
    </div>
  );
}
