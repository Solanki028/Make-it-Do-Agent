import type { Metadata } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Make It Do — AI Agent Host',
  description: 'A production-grade agentic host powered by LangGraph, gpt-4o-mini, and the Model Context Protocol. Describe any goal and watch it get done.',
  keywords: ['AI agent', 'LangGraph', 'MCP', 'automation', 'gpt-4o-mini'],
  openGraph: {
    title: 'Make It Do — AI Agent Host',
    description: 'Describe any goal. Watch it get done.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col">{children}</body>
    </html>
  );
}
