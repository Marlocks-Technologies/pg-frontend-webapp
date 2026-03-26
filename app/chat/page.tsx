import type { Metadata } from 'next';
import { ChatProvider } from '@/lib/chatStore';
import ChatPage from '@/components/ChatPage';

export const metadata: Metadata = {
  title: 'Legal AI Assistant | Perchstone & Graeys',
  description: 'AI-powered legal research and document Q&A — Perchstone & Graeys',
};

export default function Page() {
  return (
    <ChatProvider>
      <ChatPage />
    </ChatProvider>
  );
}
