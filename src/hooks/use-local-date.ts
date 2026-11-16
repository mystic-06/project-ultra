import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Refresh calendar-based Home content at midnight and after returning to the app. */
export function useLocalDate() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const current = new Date();
      const tomorrow = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      timer = setTimeout(refresh, tomorrow.getTime() - current.getTime());
    }
    function refresh() {
      clearTimeout(timer);
      setNow(Date.now());
      schedule();
    }
    schedule();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return now;
}
