import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Tempta · 内容工作台',
  description: 'Tempta 角色、素材和内容配置工作台',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
