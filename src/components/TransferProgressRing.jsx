export function TransferProgressRing({ progress = 0, status = 'queued', size = 20 }) {
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const isQueued = status === 'queued';
  const isFailed = status === 'failed';
  const isDone = status === 'done';
  const fraction = isDone ? 1 : Math.max(0, Math.min(1, progress || 0));
  const dash = isQueued ? circumference * 0.22 : circumference * fraction;
  const color = isFailed ? 'var(--gd-danger)' : isDone ? '#34a853' : 'var(--gd-primary)';

  return (
    <svg
      className={`gd-transfer-ring${isQueued ? ' gd-transfer-ring--queued' : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--gd-hover)"
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
