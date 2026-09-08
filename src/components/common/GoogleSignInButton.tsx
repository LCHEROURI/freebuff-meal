import { useState } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { useToast } from '@/components/common/Toast';
import { useNavigate } from 'react-router-dom';

type GoogleSignInButtonProps = {
  redirectPath?: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

export const GoogleSignInButton = ({
  redirectPath = '/app',
  label = 'Sign in with Google',
  className = '',
  size = 'md',
}: GoogleSignInButtonProps) => {
  const { signInWithGoogle, isDemo } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      await signInWithGoogle();
      toast.push({
        kind: 'success',
        title: 'Signed in with Google',
        description: isDemo ? 'Signed in as Demo Cook via Google' : 'Welcome back!',
      });
      navigate(redirectPath, { replace: true });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Google sign-in failed',
        description: err instanceof Error ? err.message : 'Could not complete Google sign-in.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const pyClass = size === 'sm' ? 'py-2 px-3 text-sm' : size === 'lg' ? 'py-3.5 px-6 text-base font-semibold' : 'py-3 px-4 text-sm font-medium';

  return (
    <div className={`w-full ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        aria-label="Sign in securely with Google"
        className={`group relative flex w-full items-center justify-center gap-3 rounded-xl border border-pepper-300 bg-white font-medium text-pepper-800 shadow-sm transition-all duration-150 hover:bg-pepper-50 hover:border-pepper-400 hover:shadow-md active:bg-pepper-100 disabled:opacity-60 disabled:cursor-not-allowed dark:border-pepper-600 dark:bg-pepper-800 dark:text-flour-50 dark:hover:bg-pepper-700 dark:hover:border-pepper-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tomato-500 ${pyClass}`}
      >
        {/* Official Google G Logo */}
        <svg
          className="h-5 w-5 flex-shrink-0 transition-transform group-hover:scale-105"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{submitting ? 'Connecting to Google…' : label}</span>
      </button>
    </div>
  );
};
