'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { withBase } from '@/lib/base-path';

const TICK_MS = 1000;
const HEARTBEAT_MS = 60_000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

interface SessionConfig {
  idleTimeoutSeconds: number;
  warningSeconds: number;
}

/** Only act on same-origin app API 401s — never on the auth endpoints themselves. */
function isAppApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    if (!u.pathname.includes('/api/')) return false;
    if (u.pathname.includes('/api/auth/')) return false;
    return true;
  } catch {
    return false;
  }
}

function fmt(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * App-wide session manager (mounted in the authenticated layout):
 *  - (3) shows a "stay logged in?" popup before the idle timeout; any action
 *    other than "Log out" resets the timer.
 *  - (4) on idle expiry / forced logout, signs out and redirects to /login with
 *    an expired-session flag (the login page shows the error toast).
 *  - (1) wraps fetch so ANY app-API 401 triggers the same re-login flow.
 * Idle policy is global + superuser-configurable (fetched from the server).
 */
export function SessionManager() {
  const router = useRouter();
  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);
  const [configLoaded, setConfigLoaded] = useState(false);

  const configRef = useRef<SessionConfig | null>(null);
  // Stamped on mount (Date.now() can't run during render — purity rule).
  const lastActivityRef = useRef<number>(0);
  const lastHeartbeatRef = useRef<number>(0);
  const activitySinceHeartbeatRef = useRef<boolean>(false);
  const warningOpenRef = useRef<boolean>(false);
  const loggingOutRef = useRef<boolean>(false);

  const heartbeat = useCallback(() => {
    fetch(withBase('/api/session/heartbeat'), { method: 'POST' }).catch(() => {});
  }, []);

  const forceLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      await signOut({ redirect: false });
    } catch {
      // ignore — we redirect regardless
    }
    router.push('/login?expired=1');
  }, [router]);

  // "Stay logged in" — also the result of dismissing the popup any other way
  // (Continue, Escape, clicking the overlay, the close button).
  const stayLoggedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    lastHeartbeatRef.current = Date.now();
    activitySinceHeartbeatRef.current = false;
    warningOpenRef.current = false;
    setWarningOpen(false);
    heartbeat();
  }, [heartbeat]);

  // Initialize activity timestamps on mount.
  useEffect(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastHeartbeatRef.current = now;
  }, []);

  // Load the global policy.
  useEffect(() => {
    let cancelled = false;
    fetch(withBase('/api/session/config'))
      .then((r) => (r.ok ? r.json() : null))
      .then((c: SessionConfig | null) => {
        if (cancelled || !c) return;
        configRef.current = c;
        setConfigLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Activity listeners (passive). While the warning is open we ignore passive
  // activity — the user must make an explicit choice in the popup.
  useEffect(() => {
    const onActivity = () => {
      if (warningOpenRef.current) return;
      lastActivityRef.current = Date.now();
      activitySinceHeartbeatRef.current = true;
    };
    for (const e of ACTIVITY_EVENTS) {
      window.addEventListener(e, onActivity, { passive: true });
    }
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
    };
  }, []);

  // Global 401 → re-login interceptor (1). Wrap fetch once; restore on unmount.
  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async (...args: Parameters<typeof window.fetch>) => {
      const res = await orig(...args);
      try {
        if (res.status === 401 && !loggingOutRef.current) {
          const input = args[0];
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input instanceof Request
                  ? input.url
                  : '';
          if (url && isAppApi(url)) void forceLogout();
        }
      } catch {
        // never let interception break the original request
      }
      return res;
    };
    return () => {
      window.fetch = orig;
    };
  }, [forceLogout]);

  // The idle timer.
  useEffect(() => {
    if (!configLoaded) return;
    const id = setInterval(() => {
      const cfg = configRef.current;
      if (!cfg || loggingOutRef.current) return;
      const now = Date.now();
      const idleMs = cfg.idleTimeoutSeconds * 1000;
      const warnMs = cfg.warningSeconds * 1000;
      const remaining = idleMs - (now - lastActivityRef.current);

      if (remaining <= 0) {
        void forceLogout();
        return;
      }
      if (remaining <= warnMs) {
        if (!warningOpenRef.current) {
          warningOpenRef.current = true;
          setWarningOpen(true);
        }
        setRemainingSec(Math.ceil(remaining / 1000));
        return;
      }
      // Active and not near expiry: keep the server's activity timestamp fresh.
      if (warningOpenRef.current) {
        warningOpenRef.current = false;
        setWarningOpen(false);
      }
      if (
        activitySinceHeartbeatRef.current &&
        now - lastHeartbeatRef.current > HEARTBEAT_MS
      ) {
        activitySinceHeartbeatRef.current = false;
        lastHeartbeatRef.current = now;
        heartbeat();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [configLoaded, forceLogout, heartbeat]);

  return (
    <Dialog
      open={warningOpen}
      onOpenChange={(o) => {
        // Any close that isn't the explicit "Log out" button keeps the user in.
        if (!o) stayLoggedIn();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Your session is about to expire</DialogTitle>
          <DialogDescription>
            You&apos;ll be signed out in {fmt(remainingSec)} due to inactivity. Do you want to
            stay logged in?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => void forceLogout()}
          >
            Log out
          </Button>
          <Button onClick={stayLoggedIn}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
