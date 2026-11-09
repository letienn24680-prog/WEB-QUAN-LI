import React, { useEffect, useState } from 'react';

/**
 * 1. Cấu hình chuyển động vật lý lò xo chuẩn hóa (MOTION_SPRINGS)
 */
export const MOTION_SPRINGS = {
  snappy: { type: 'spring' as const, stiffness: 420, damping: 28, mass: 0.8 },
  smooth: { type: 'spring' as const, stiffness: 260, damping: 26, mass: 1 },
  bouncy: { type: 'spring' as const, stiffness: 500, damping: 18, mass: 0.7 },
};

/**
 * 2. Component Hiển Thị Số Thống Kê Chuẩn Tabular-Nums (MT-02)
 */
export const AnimatedCounter: React.FC<{
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}> = ({ value, prefix = '', suffix = '', decimals = 0 }) => {
  const [displayNum, setDisplayNum] = useState(value);

  useEffect(() => {
    setDisplayNum(value);
  }, [value]);

  const formatted = `${prefix}${displayNum.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

  return <span className="tabular-nums font-mono font-bold">{formatted}</span>;
};

/**
 * 3. Thẻ Card NexaPanel với viền phát sáng & đổ bóng mềm mại
 */
export const SpotlightGlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return (
    <div
      className={`rounded-2xl bg-[#111827] border border-white/5 hover:border-violet-500/30 transition-all duration-200 shadow-xl ${className}`}
    >
      {children}
    </div>
  );
};

export const CleanSurfaceCard = SpotlightGlassCard;

/**
 * 4. Nút Tải Xuống Biến Hình 4 Trạng Thái (MT-09)
 */
export const MorphingDownloadButton: React.FC<{
  projectName?: string;
  onDownload: () => Promise<void>;
}> = ({ projectName, onDownload }) => {
  const [status, setStatus] = useState<'idle' | 'preparing' | 'downloading' | 'success'>('idle');

  const handleClick = async () => {
    if (status !== 'idle') return;
    setStatus('preparing');
    await new Promise((r) => setTimeout(r, 200));
    setStatus('downloading');
    await onDownload();
    setStatus('success');
    setTimeout(() => setStatus('idle'), 2400);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status !== 'idle'}
      className={`min-h-[42px] px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg ${
        status === 'success'
          ? 'bg-emerald-600 text-white shadow-emerald-600/30'
          : 'bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-violet-500/30'
      }`}
    >
      {status === 'idle' && <span>⬇️ Tải xuống (.ZIP)</span>}
      {status === 'preparing' && <span>⏳ Đang kiểm tra SHA-256...</span>}
      {status === 'downloading' && <span>⚡ Đang tải gói...</span>}
      {status === 'success' && <span>✓ Đã tải xong!</span>}
    </button>
  );
};

export const MorphingCopyButton: React.FC<{
  textToCopy: string;
}> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
    >
      {copied ? '✓ Đã sao chép' : 'Sao chép'}
    </button>
  );
};

export default SpotlightGlassCard;
