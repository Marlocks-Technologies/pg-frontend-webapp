import type { Metadata } from 'next';
import { ChatProvider } from '@/lib/chatStore';
import ChatPage from '@/components/ChatPage';
import { readSession } from '@/lib/server/authCookies';
import { redirect } from 'next/navigation';
import SessionHeartbeat from '@/components/SessionHeartbeat';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Legal AI Assistant | Perchstone & Graeys',
  description: 'AI-powered legal research and document Q&A — Perchstone & Graeys',
};

export default async function Page() {
  const session = await readSession();
  if (!session) redirect('/sign-in');
  return (
    <ChatProvider userSub={session.identity.sub}>
      <SessionHeartbeat />
      <ChatPage identity={session.identity} />
    </ChatProvider>
  );
}
