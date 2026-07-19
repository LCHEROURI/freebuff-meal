import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';

import { Card, SectionCard } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input, Select } from '@/components/common/Input';
import { Chip } from '@/components/common/Chip';
import { Dialog } from '@/components/common/Dialog';
import { VoiceInputButton } from '@/components/common/VoiceInputButton';
import { useToast } from '@/components/common/Toast';
import { useAuth } from '@/features/auth/authContext';
import { ensureProfile, profileStore } from '@/utils/demoAdapter';
import {
  UserProfileSchema,
  type UserProfile,
} from '@/schemas/auth';
import {
  AllergenSchema,
  DietaryPatternSchema,
  type Allergen,
  type DietaryPattern,
} from '@/schemas/ingredient';
import {
  availableReauthMethods,
  deleteCurrentAccount,
  deleteAuthenticatedUser,
  reauthenticateCurrentUser,
  ReauthRequiredError,
  type SupportedReauthProvider,
} from '@/features/auth/userAccountService';

export const SettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthMethods, setReauthMethods] = useState<SupportedReauthProvider[]>([]);
  const [reauthMethod, setReauthMethod] = useState<SupportedReauthProvider>('unknown');
  const [reauthEmail, setReauthEmail] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthOpening, setOauthOpening] = useState(false);

  const defaults: UserProfile = user
    ? ensureProfile(user.uid)
    : UserProfileSchema.parse({ displayName: 'Demo Cook' });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserProfile>({
    resolver: zodResolver(UserProfileSchema),
    defaultValues: defaults,
  });
  const values = watch();

  const toggleArray = (field: keyof UserProfile, value: string) => {
    const current = new Set((values[field] as string[] | undefined) ?? []);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setValue(field as keyof UserProfile, Array.from(current) as never, { shouldDirty: true });
  };

  useEffect(() => {
    if (user) ensureProfile(user.uid);
  }, [user]);

  const onSubmit = (data: UserProfile) => {
    if (!user) return;
    profileStore.write(user.uid, { ...data, onboardingCompleted: true });
    toast.push({ kind: 'success', title: 'Settings saved' });
  };

  const openReauthDialog = () => {
    const methods = availableReauthMethods();
    setReauthMethods(methods);
    setReauthMethod(methods[0] ?? 'password');
    setReauthEmail(user?.email ?? '');
    setReauthPassword('');
    setReauthOpen(true);
    // Intentionally NOT auto-launching an OAuth popup. The user only reached
    // this dialog because they clicked Delete — they didn't agree to another
    // sign-in dance and may want to back out.
  };

  const triggerOauthReauth = async () => {
    if (oauthOpening || submitting) return;
    try {
      setOauthOpening(true);
      // `reauthMethod` is narrowed to a linked OAuth provider here because
      // `showPasswordForm` excludes this branch; the chip selection only offers
      // providers present in `availableReauthMethods()`.
      await reauthenticateCurrentUser({
        provider: reauthMethod === 'apple' ? 'apple' : 'google',
      });
      await deleteAuthenticatedUser();
      setReauthOpen(false);
      setReauthPassword('');
      toast.push({ kind: 'success', title: 'Account removed' });
      navigate('/', { replace: true });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Re-authentication failed',
        description:
          err instanceof Error
            ? err.message
            : 'If a sign-in window opened, you can close it and try another method below.',
      });
    } finally {
      setOauthOpening(false);
    }
  };

  const tryDelete = async () => {
    setSubmitting(true);
    try {
      await deleteCurrentAccount();
      toast.push({ kind: 'success', title: 'Account removed' });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        setConfirmDelete(false);
        openReauthDialog();
        return;
      }
      toast.push({
        kind: 'error',
        title: 'Could not delete account',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onPasswordReauth = async () => {
    if (submitting) return;
    if (!reauthEmail || !reauthPassword) {
      toast.push({
        kind: 'error',
        title: 'Email and password required',
        description: 'Please fill both fields.',
      });
      return;
    }
    setSubmitting(true);
    try {
      await reauthenticateCurrentUser({
        provider: 'password',
        email: reauthEmail,
        password: reauthPassword,
      });
      await deleteAuthenticatedUser();
      setReauthOpen(false);
      setReauthPassword('');
      toast.push({ kind: 'success', title: 'Account removed' });
      navigate('/', { replace: true });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not verify password',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const showProviderChooser = reauthMethods.length > 1;
  const showPasswordForm = reauthMethod === 'password';

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">
          These are the defaults the AI uses for new plans.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <SectionCard title="Profile">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Display name"
              rightIcon={<VoiceInputButton />}
              {...register('displayName')}
              error={errors.displayName?.message}
            />
            <Input
              label="Household size"
              type="number"
              min={1}
              max={12}
              {...register('householdSize', { valueAsNumber: true })}
            />
            <Input
              label="Default servings"
              type="number"
              min={1}
              max={12}
              {...register('defaultServings', { valueAsNumber: true })}
            />
            <Select label="Default plan length" {...register('defaultPlanLength', { valueAsNumber: true })}>
              <option value={3}>3 dinners</option>
              <option value={5}>5 dinners</option>
              <option value={7}>7 dinners</option>
            </Select>
            <Input
              label="Max time per meal (min)"
              type="number"
              min={15}
              max={180}
              {...register('maxTotalTimeMinutes', { valueAsNumber: true })}
            />
            <Select label="Measurement system" {...register('measurementSystem')}>
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </Select>
            <Select label="Skill level" {...register('skillLevel')}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
            <Select label="Budget" {...register('budgetPreference')}>
              <option value="everyday">Everyday</option>
              <option value="moderate">Moderate</option>
              <option value="splurge">Splurge</option>
            </Select>
          </div>
        </SectionCard>

        <SectionCard title="Diet & allergens">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Dietary pattern</legend>
            <div className="flex flex-wrap gap-2">
              {DietaryPatternSchema.options.map((label) => (
                <Chip
                  key={label}
                  active={values.dietaryPattern === label}
                  onClick={() =>
                    setValue('dietaryPattern', label as DietaryPattern, { shouldDirty: true })
                  }
                >
                  {label.replaceAll('_', ' ')}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">Allergens</legend>
            <div className="flex flex-wrap gap-2">
              {AllergenSchema.options.map((label) => (
                <Chip
                  key={label}
                  active={(values.allergens ?? []).includes(label as Allergen)}
                  onClick={() => toggleArray('allergens', label)}
                >
                  {label.replaceAll('_', ' ')}
                </Chip>
              ))}
            </div>
          </fieldset>
        </SectionCard>

        <SectionCard title="Cuisines & equipment">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Favorite cuisines</legend>
            <div className="flex flex-wrap gap-2">
              {['Italian', 'Mexican', 'Greek', 'Indian', 'Japanese', 'Thai', 'North African', 'American'].map((c) => (
                <Chip
                  key={c}
                  active={(values.favoriteCuisines ?? []).includes(c)}
                  onClick={() => toggleArray('favoriteCuisines', c)}
                >
                  {c}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">Equipment</legend>
            <div className="flex flex-wrap gap-2">
              {['Stovetop', 'Oven', 'Sheet pan', 'Air fryer'].map((e) => (
                <Chip
                  key={e}
                  active={(values.availableEquipment ?? []).includes(e)}
                  onClick={() => toggleArray('availableEquipment', e)}
                >
                  {e}
                </Chip>
              ))}
            </div>
          </fieldset>
        </SectionCard>

        <div className="mt-6 flex justify-end">
          <Button type="submit" variant="primary">
            Save settings
          </Button>
        </div>
      </form>

      <SectionCard title="Account">
        <Card>
          <p className="text-sm text-ink-700">
            Account deletion removes your profile and saved plans. In
            production this is handled by a Cloud Function that also removes
            any share links and usage records.
          </p>
          <Button
            variant="danger"
            size="sm"
            className="mt-3"
            loading={submitting && confirmDelete}
            onClick={() => setConfirmDelete(true)}
            leftIcon={<Trash2 size={14} aria-hidden="true" />}
          >
            Delete account
          </Button>
        </Card>
      </SectionCard>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account?"
        description="This is permanent. All your saved plans and preferences go with it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={submitting} onClick={tryDelete}>
              Yes, delete account
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">Type your mind. We'll handle the rest.</p>
      </Dialog>

      <Dialog
        open={reauthOpen}
        onClose={() => setReauthOpen(false)}
        title="Verify it’s you"
        description="For your safety, Firebase asks you to re-confirm your sign-in before deleting your account."
        footer={
          showPasswordForm ? (
            <>
              <Button variant="secondary" onClick={() => setReauthOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={submitting} onClick={onPasswordReauth}>
                Verify and delete
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setReauthOpen(false)}>
              Cancel
            </Button>
          )
        }
      >
        {showProviderChooser && (
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium">Choose how to verify</legend>
            <div className="flex flex-wrap gap-2">
              {reauthMethods.map((m) => (
                <Chip
                  key={m}
                  active={reauthMethod === m}
                  onClick={() => {
                    setReauthMethod(m);
                    setReauthPassword('');
                  }}
                >
                  {m === 'password' ? 'Email & password' : m === 'google' ? 'Google' : 'Apple'}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Multiple sign-in methods are linked to this account. Pick whichever is easiest right now.
            </p>
          </fieldset>
        )}
        {showPasswordForm ? (
          <div className="space-y-3">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={reauthEmail}
              onChange={(e) => setReauthEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
            />
            <p className="text-xs text-ink-500">
              Firebase requires a recent sign-in for sensitive actions; re-auth keeps your account secure.
            </p>
          </div>
          ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">
              {oauthOpening
                ? 'Waiting for the sign-in window…'
                : `Click below to re-confirm via ${
                    reauthMethod === 'apple' ? 'Apple' : 'Google'
                  } and finish deleting your account.`}
            </p>
            <Button
              variant="danger"
              loading={oauthOpening || submitting}
              onClick={triggerOauthReauth}
            >
              Confirm with {reauthMethod === 'apple' ? 'Apple' : 'Google'} and delete
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
};

