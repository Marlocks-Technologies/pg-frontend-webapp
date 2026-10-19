import { redirect } from 'next/navigation';
import { readSession } from '@/lib/server/authCookies';
import AdminDashboard from '@/components/AdminDashboard';
import SessionHeartbeat from '@/components/SessionHeartbeat';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await readSession();
  if (!session) redirect('/sign-in');
  if (session.identity.role !== 'admin') redirect('/chat');
  return <><SessionHeartbeat /><AdminDashboard identity={session.identity} /></>;
}
