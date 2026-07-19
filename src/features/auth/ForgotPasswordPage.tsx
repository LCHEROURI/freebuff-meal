import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';

import { useAuth } from './authContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Card } from '@/components/common/Card';
import { useToast } from '@/components/common/Toast';
import { ForgotPasswordSchema, type ForgotPasswordValues } from '@/schemas/auth';

export const ForgotPasswordPage = () => {
  const { resetPassword } = useAuth();
  const toast = useToast();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(ForgotPasswordSchema) });

  const onSubmit = async (values: ForgotPasswordValues) => {
    try {
      setSubmitting(true);
      await resetPassword(values.email);
      setSentTo(values.email);
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not send reset email',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
      <Card title="Reset your password" description="We will email you a reset link.">
        {sentTo ? (
          <div className="space-y-3">
            <p className="rounded-md border border-success-500 bg-success-100 px-3 py-2 text-sm text-success-700">
              If an account exists for <strong>{sentTo}</strong>, we have sent
              a reset link. Check your inbox.
            </p>
            <Link to="/login" className="text-sm text-sage-700 hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
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
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              Send reset link
            </Button>
            <p className="text-sm">
              <Link to="/login" className="text-sage-700 hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </Card>
    </main>
  );
};
