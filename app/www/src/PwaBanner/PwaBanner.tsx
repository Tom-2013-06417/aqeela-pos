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
          <span>A new version is available.</span>
          <button type="button" onClick={() => refreshPwa()}>
            Refresh
          </button>
        </>
      ) : (
        <span>App is ready for offline use.</span>
      )}
    </div>
  );
}
