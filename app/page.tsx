import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';

export const metadata: Metadata = {
  title: 'P&G Legal AI | Perchstone & Graeys',
  description:
    'Legal research grounded in the Perchstone & Graeys knowledge base and Nigerian law. Every answer carries its sources. For research only — not legal advice.',
};

export default function Page() {
  return <LandingPage />;
}