import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react';

import { useAuth } from './authContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Card } from '@/components/common/Card';
import { useToast } from '@/components/common/Toast';
import { isFirebaseConfigured } from '@/lib/env';

const schema = z.object({
  email: z.string().email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Values = z.infer<typeof schema>;

export const LoginPage = () => {
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    try {
      setSubmitting(true);
      await signIn(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Sign-in failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    try {
      setSubmitting(true);
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Sign-in failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
      <Card title="Welcome back" description="Sign in to plan your dinners.">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            leftIcon={<Mail size={16} aria-hidden="true" />}
            {...register('email')}
            error={errors.email?.message}
            required
          />
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            leftIcon={<Lock size={16} aria-hidden="true" />}
            rightIcon={
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="text-ink-500 hover:text-ink-700"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            {...register('password')}
            error={errors.password?.message}
            required
          />
          <div className="flex items-center justify-between text-sm">
            <Link to="/forgot-password" className="text-sage-700 hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={submitting}
            leftIcon={<LogIn size={16} aria-hidden="true" />}
          >
            Sign in
          </Button>
        </form>

        {isFirebaseConfigured() && (
          <>
            <div className="my-4 flex items-center gap-2 text-xs text-ink-500">
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              <span>or</span>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <Button type="button" variant="secondary" fullWidth onClick={onGoogle}>
              Continue with Google
            </Button>
          </>
        )}

        {!isFirebaseConfigured() && (
          <p className="mt-3 rounded-md border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-500">
            Demo mode is active — sign in to walk all flows with a local user.
          </p>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-ink-700">
        Need an account?{' '}
        <Link to="/signup" className="font-semibold text-sage-700 hover:underline">
          Create one
        </Link>
      </p>
    </main>
  );
};
