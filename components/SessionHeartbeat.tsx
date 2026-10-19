'use client';

import { useEffect } from 'react';

export default function SessionHeartbeat() {
  useEffect(() => {
    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        void fetch('/api/auth/heartbeat', { method: 'POST', cache: 'no-store' });
      }
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 60000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', heartbeat); };
  }, []);
  return null;
}
