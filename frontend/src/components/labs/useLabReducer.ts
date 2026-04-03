import { useReducer, useCallback } from 'react';
import type { LabState, LabCommand } from './types';

// ── Generic lab reducer ───────────────────────────────────────────────────────
// Each lab widget can override specific cases; this provides common handling.

export function labReducer(state: LabState, command: LabCommand): LabState {
  switch (command.type) {
    case 'RESET':
      return (command.payload?.initialState as LabState) ?? state;
    case 'SET_PARAM': {
      const { key, value } = command.payload as { key: string; value: unknown };
      return { ...state, [key]: value };
    }
    case 'SET_STATE':
      return { ...state, ...(command.payload as LabState) };
    default:
      return state;
  }
}

export function useLabReducer(initialState: LabState) {
  const [state, dispatchRaw] = useReducer(labReducer, initialState);
  const [history, historyDispatch] = useReducer(
    (h: LabState[], s: LabState) => [...h.slice(-19), s],
    [initialState]
  );

  const dispatch = useCallback((cmd: LabCommand) => {
    dispatchRaw(cmd);
  }, []);

  return { state, dispatch };
}
