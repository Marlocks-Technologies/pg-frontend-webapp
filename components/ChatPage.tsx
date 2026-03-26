'use client';

import { useEffect } from 'react';
import { useChatStore } from '@/lib/chatStore';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';

export default function ChatPage() {
  const { state } = useChatStore();
  const { isDark } = state;

  // Sync theme class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <div
      className={`flex h-screen overflow-hidden
        ${isDark ? 'bg-[#111113]' : 'bg-[#f5f5f7]'}`}
    >
      <Sidebar />
      <ChatArea />
    </div>
  );
}
