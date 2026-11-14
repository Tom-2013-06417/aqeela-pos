import { useEffect, useState } from 'react';
import { refreshPwa, subscribePwaUpdates } from '../pwa';
import './PwaBanner.css';

export function PwaBanner() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    return subscribePwaUpdates(({ needRefresh, offlineReady }) => {
      setNeedRefresh(needRefresh);
      setOfflineReady(offlineReady);
    });
  }, []);

  if (!needRefresh && !offlineReady) {
    return null;
  }

  return (
    <div className="pwa-banner" role="status">
      {needRefresh ? (
        <>
          <span>There’s an update. Tap Refresh when you’re free.</span>
          <button type="button" onClick={() => refreshPwa()}>
            Refresh
          </button>
        </>
      ) : (
        <span>Ready to use without internet.</span>
      )}
    </div>
  );
}
