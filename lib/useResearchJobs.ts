'use client';

import { useEffect, useRef } from 'react';
import {
  initResearchJobs,
  subscribeResearchJobs,
  type ResearchEvent,
} from './researchJobs';

/**
 * Bridges the research registry to React. init MUST run after the chat store
 * hydrates: called with an empty session list it would treat every persisted
 * record as an orphan and delete it.
 */
export function useResearchJobs(options: {
  isHydrated: boolean;
  sessionIds: string[];
  onEvent: (event: ResearchEvent) => void;
}): void {
  const { isHydrated, sessionIds, onEvent } = options;

  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => subscribeResearchJobs(event => handler.current(event)), []);

  const initialised = useRef(false);
  useEffect(() => {
    if (!isHydrated || initialised.current) return;
    initialised.current = true;
    initResearchJobs(sessionIds);
  }, [isHydrated, sessionIds]);
}
