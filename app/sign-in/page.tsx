import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/server/authCookies';

export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await readSession()) redirect('/chat');
  const { error } = await searchParams;
  return (
    <main className="min-h-screen bg-[#f5f5f3] text-[#252526] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#dededb] bg-white p-8 shadow-xl shadow-black/5">
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#666]">Perchstone & Graeys</div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Sign in to P&G Legal AI</h1>
        <p className="mt-3 text-sm leading-6 text-[#666]">Access is by invitation. Use the account provided by your administrator.</p>
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">Sign-in could not be completed. Check your invitation and try again.</p>}
        <a href="/api/auth/start" className="mt-8 block rounded-xl bg-[#252526] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#424245]">Continue to sign in</a>
        <p className="mt-8 text-xs text-[#777]">Need access? Contact your P&G administrator.</p>
        <Link href="/" className="mt-4 inline-block text-xs underline text-[#666]">Back to home</Link>
      </div>
    </main>
  );
}
