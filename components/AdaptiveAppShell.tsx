import React, { useState, useEffect } from 'react';

/**
 * 1. Hook nhận diện thiết bị an toàn với SSR (Không gây lỗi Hydration Mismatch — Luồng 1 Zero-CLS)
 */
export function useResponsiveDevice() {
  const [viewport, setViewport] = useState<{
    width: number;
    breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    isTouchDevice: boolean;
  }>({
    width: 1280,
    breakpoint: 'xl',
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouchDevice: false,
  });

  useEffect(() => {
    let rafId: number | null = null;
    const updateViewport = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = window.innerWidth;
        const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const breakpoint =
          w < 375 ? 'xs' : w < 640 ? 'sm' : w < 768 ? 'md' : w < 1024 ? 'lg' : w < 1440 ? 'xl' : '2xl';
        setViewport({
          width: w,
          breakpoint,
          isMobile: w < 768,
          isTablet: w >= 768 && w < 1024,
          isDesktop: w >= 1024,
          isTouchDevice: touch,
        });
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  return viewport;
}

/**
 * 2. Hàm rút gọn giữa chuỗi (Middle Truncation — CD-08) cho mã SHA-256 (64 ký tự) & đường dẫn tệp dài
 */
export function formatMiddleEllipsis(text: string, isMobile: boolean, maxLen = 24): string {
  if (!isMobile || text.length <= maxLen) return text;
  const head = Math.max(6, Math.floor((maxLen - 3) / 2));
  const tail = Math.max(6, maxLen - 3 - head);
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

/**
 * 3. Khung AppShell NexaPanel Dark Neon E-commerce Admin
 */
export const AdaptiveAppShell: React.FC<{
  sidebarContent: React.ReactNode;
  headerContent: React.ReactNode;
  mobileBottomNav: React.ReactNode;
  children: React.ReactNode;
}> = ({ sidebarContent, headerContent, mobileBottomNav, children }) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleVvResize = () => {
      const isCompressed = vv.height < window.innerHeight * 0.75;
      setKeyboardVisible(isCompressed);
    };
    vv.addEventListener('resize', handleVvResize);
    return () => vv.removeEventListener('resize', handleVvResize);
  }, []);

  return (
    <div className="min-h-[100dvh] w-full max-w-[100vw] overflow-x-clip bg-[#0B0F19] text-slate-100 flex flex-col lg:flex-row">
      {/* SIDEBAR CỐ ĐỊNH TRÊN PC (>= 1024px) */}
      <aside className="hidden lg:flex lg:w-64 xl:w-72 lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 bg-[#0E1322] border-r border-white/5">
        {sidebarContent}
      </aside>

      {/* NGĂN KÉO TRƯỢT (DRAWER) TRÊN ĐIỆN THOẠI & TABLET (< 1024px) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#0E1322] border-r border-white/10 z-10 shadow-2xl">
            <div className="p-4 flex items-center justify-between border-b border-white/10">
              <span className="font-bold text-white text-base flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm">
                  📦
                </span>
                NexaPanel
              </span>
              <button
                type="button"
                className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 text-slate-300 border border-slate-700"
                onClick={() => setMobileDrawerOpen(false)}
              >
                ✕ Đóng
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{sidebarContent}</div>
          </div>
        </div>
      )}

      {/* VÙNG NỘI DUNG CHÍNH (MAIN AREA) */}
      <div className="flex-1 flex flex-col lg:pl-64 xl:pl-72 min-w-0">
        <header className="sticky top-0 z-20 bg-[#111827] border-b border-white/5 px-4 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Mở Menu"
          >
            ☰
          </button>
          <div className="flex-1 min-w-0">{headerContent}</div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-8">{children}</main>

        {/* THANH ĐIỀU HƯỚNG ĐÁY TRÊN ĐIỆN THOẠI (< 768px, ẨN KHI BÀN PHÍM BẬT) */}
        {!keyboardVisible && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111827] border-t border-white/5 pb-[env(safe-area-inset-bottom)] flex items-center justify-around h-16 shadow-2xl">
            {mobileBottomNav}
          </nav>
        )}
      </div>
    </div>
  );
};

export default AdaptiveAppShell;
