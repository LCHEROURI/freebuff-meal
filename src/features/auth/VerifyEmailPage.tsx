import { Link, Navigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useAuth } from './authContext';
import { useToast } from '@/components/common/Toast';
import { getFirebaseAuth } from '@/lib/firebase/app';

export const VerifyEmailPage = () => {
  const { user, verifyEmail, signOut, isDemo } = useAuth();
  const toast = useToast();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  // Throttled background polling — catches "user clicked link in another
  // tab" without burning quota. The AuthProvider's onAuthStateChanged
  // already detects credential changes, but Firebase doesn't always fire
  // it on a self reload, so 6 s is a reasonable cadence.
  useEffect(() => {
    if (isDemo) return;
    if (user?.emailVerified && !user.isAnonymous) return;
    let cancelled = false;
    const tick = async () => {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) return;
      try {
        await auth.currentUser.reload();
      } catch {
        /* ignore — handled by onAuthStateChanged */
      }
      if (cancelled) return;
    };
    const t = setInterval(tick, 6000);
    return () => {
      cancelled = true; // checked *after* the await so mid-flight reload cancels cleanly
      clearInterval(t);
    };
  }, [isDemo, user]);

  if (isDemo) return <Navigate to="/app" replace />;
  if (user?.emailVerified && !user.isAnonymous) {
    return <Navigate to="/app" replace />;
  }

  const onResend = async () => {
    try {
      setResending(true);
      await verifyEmail();
      toast.push({
        kind: 'success',
        title: 'Verification email re-sent',
        description:
          'Check your inbox (or spam folder). Resends are rate-limited — wait a minute before clicking again.',
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[VerifyEmailPage] resend failed', err);
      toast.push({
        kind: 'error',
        title: 'Could not resend',
        description: err instanceof Error ? err.message : 'Try again later.',
      });
    } finally {
      setResending(false);
    }
  };

  const onCheckStatus = async () => {
    try {
      setChecking(true);
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) return;
      const waitForVerified = new Promise<boolean>((resolve) => {
        const unsub = auth.onAuthStateChanged((u) => {
          if (u?.emailVerified) {
            unsub();
            resolve(true);
          }
        });
        setTimeout(() => {
          unsub();
          resolve(false);
        }, 2500);
      });
      await auth.currentUser.reload();
      const verified = await waitForVerified;
      if (verified) {
        toast.push({ kind: 'success', title: 'Email verified' });
      } else {
        toast.push({
          kind: 'info',
          title: 'Not yet verified',
          description: 'Click the link in your email and try again.',
        });
      }
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not refresh',
        description: err instanceof Error ? err.message : 'Try again.',
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
      <Card title="Verify your email" description="One quick step before your first plan.">
        <p className="flex items-start gap-3 text-sm text-ink-700">
          <MailCheck size={20} aria-hidden="true" className="mt-0.5 text-sage-700" />
          <span>
            We sent a verification link to <strong>{user?.email ?? 'your inbox'}</strong>.
            Click it to unlock the planner. AI-generated recipes must be reviewed
            against your personal dietary needs, so we ask before exposing the API.
          </span>
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" loading={resending} onClick={onResend}>
            Resend email
          </Button>
          <Button variant="secondary" loading={checking} onClick={onCheckStatus}>
            I verified — refresh
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
          <Link to="/login" className="ml-auto self-center text-sm text-sage-700 hover:underline">
            Back to sign in
          </Link>
        </div>
      </Card>
    </main>
  );
};
