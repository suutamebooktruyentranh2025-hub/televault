import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';

const DialogContext = createContext({
  prompt: async () => null,
  confirm: async () => false,
});

export function DialogProvider({ children }) {
  const [state, setState] = useState(null);

  const prompt = useCallback((message, defaultValue = '') => {
    return new Promise((resolve) => {
      setState({ type: 'prompt', message, defaultValue, resolve });
    });
  }, []);

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setState({ type: 'confirm', message, resolve });
    });
  }, []);

  const close = useCallback((result) => {
    setState((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const value = useMemo(() => ({ prompt, confirm }), [prompt, confirm]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {state?.type === 'prompt' && (
        <PromptDialog
          message={state.message}
          defaultValue={state.defaultValue}
          onSubmit={(value) => close(value)}
          onCancel={() => close(null)}
        />
      )}
      {state?.type === 'confirm' && (
        <ConfirmDialog message={state.message} onConfirm={() => close(true)} onCancel={() => close(false)} />
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext);
}
