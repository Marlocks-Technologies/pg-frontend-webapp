'use client';

import { useState } from 'react';
import { useChatStore } from '@/lib/chatStore';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import DocumentsPanel from './DocumentsPanel';
import ResearchToast from './ResearchToast';

type Tab = 'chat' | 'documents';

export default function ChatPage() {
  const { state, toggleSidebar } = useChatStore();
  const { isDark, isSidebarOpen } = state;
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div className={`flex h-screen overflow-hidden ${isDark ? 'bg-[#111113]' : 'bg-[#f5f5f7]'}`}>
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── Main panel ────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">

        {/* Mobile hamburger — shown when sidebar is closed */}
        {!isSidebarOpen && (
          <button
            onClick={toggleSidebar}
            className={`absolute top-3.5 left-4 z-10 lg:hidden p-1.5 rounded-lg transition-colors
              ${isDark
                ? 'text-white/35 hover:text-white/70 hover:bg-white/6'
                : 'text-charcoal/35 hover:text-charcoal/70 hover:bg-charcoal/6'
              }`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}

        {activeTab === 'chat'      && <ChatArea />}
        {activeTab === 'documents' && <DocumentsPanel isDark={isDark} />}

        <ResearchToast />
      </div>
    </div>
  );
}