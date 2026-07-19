import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Lock, Eye, EyeOff, UserPlus } from 'lucide-react';

import { useAuth } from './authContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Card } from '@/components/common/Card';
import { VoiceInputButton } from '@/components/common/VoiceInputButton';
import { useToast } from '@/components/common/Toast';
import { SignUpSchema, type SignUpValues } from '@/schemas/auth';

export const SignupPage = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({ resolver: zodResolver(SignUpSchema) });

  const onSubmit = async (values: SignUpValues) => {
    try {
      setSubmitting(true);
      await signUp(values.email, values.password, values.displayName);
      toast.push({
        kind: 'success',
        title: 'Account created',
        description: 'Welcome to your meal planner.',
      });
      navigate('/app', { replace: true });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not create account',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
      <Card title="Create your account" description="Free while in beta. No card required.">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input
            label="Display name"
            autoComplete="name"
            rightIcon={<VoiceInputButton />}
            {...register('displayName')}
            error={errors.displayName?.message}
            required
          />
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
            autoComplete="new-password"
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
            hint="At least 8 characters."
            {...register('password')}
            error={errors.password?.message}
            required
          />
          <Input
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
            required
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              {...register('acceptTerms')}
            />
            <span className="text-ink-700">
              I agree to the{' '}
              <Link to="/terms" className="text-sage-700 hover:underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-sage-700 hover:underline">
                Privacy Policy
              </Link>
              , and acknowledge that AI-generated recipes must be checked
              against my personal allergies and dietary needs.
            </span>
          </label>
          {errors.acceptTerms && (
            <p className="text-xs font-medium text-danger-700" role="alert">
              {errors.acceptTerms.message}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={submitting}
            leftIcon={<UserPlus size={16} aria-hidden="true" />}
          >
            Create account
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-ink-700">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-sage-700 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
};
