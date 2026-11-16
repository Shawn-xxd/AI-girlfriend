import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Tempta 管理后台',
  description: '角色、照片和规则管理',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
