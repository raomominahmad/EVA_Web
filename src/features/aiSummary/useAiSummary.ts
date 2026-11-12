import { useContext } from 'react';
import { AiSummaryContext } from './AiSummaryContext';

export function useAiSummary() {
  const value = useContext(AiSummaryContext);

  if (!value) {
    throw new Error('useAiSummary must be used within an AiSummaryProvider');
  }

  return value;
}
