import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Sprout } from 'lucide-react';

import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Input, Select } from '@/components/common/Input';
import { Chip } from '@/components/common/Chip';
import { VoiceInputButton } from '@/components/common/VoiceInputButton';
import { UserProfileSchema, type UserProfile } from '@/schemas/auth';
import {
  AllergenSchema,
  DietaryPatternSchema,
  type DietaryPattern,
  type Allergen,
} from '@/schemas/ingredient';
import { useAuth } from '@/features/auth/authContext';
import { ensureProfile, profileStore } from '@/utils/demoAdapter';
import { useToast } from '@/components/common/Toast';

const STEPS = [
  'Household',
  'Time & skill',
  'Diet & allergens',
  'Cuisines & proteins',
  'Equipment & leftovers',
] as const;

const CUISINES = [
  'Italian',
  'Mexican',
  'Greek',
  'French',
  'Japanese',
  'Indian',
  'Thai',
  'Vietnamese',
  'Korean',
  'Chinese',
  'Middle Eastern',
  'North African',
  'American',
  'Mediterranean',
];

const PROTEINS = ['chicken', 'beef', 'pork', 'fish', 'tofu', 'eggs', 'lentils', 'chickpeas'];

const EQUIPMENT = [
  'Stovetop',
  'Oven',
  'Sheet pan',
  'Cast iron pan',
  'Air fryer',
  'Slow cooker',
  'Pressure cooker',
  'Wok',
  'Blender',
];

export const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);

  const existing =
    user ? ensureProfile(user.uid) : UserProfileSchema.parse({ displayName: 'Demo Cook' });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserProfile>({
    resolver: zodResolver(UserProfileSchema),
    defaultValues: existing,
  });

  const values = watch();

  const toggleArrayField = (field: keyof UserProfile, value: string) => {
    const current = new Set((values[field] as string[] | undefined) ?? []);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setValue(field as keyof UserProfile, Array.from(current) as never, {
      shouldDirty: true,
    });
  };

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const onSubmit = (data: UserProfile) => {
    if (!user) {
      navigate('/app');
      return;
    }
    profileStore.write(user.uid, { ...data, onboardingCompleted: true });
    toast.push({
      kind: 'success',
      title: 'Preferences saved',
      description: 'We will use these as defaults for your next plan.',
    });
    navigate('/app', { replace: true });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <Sprout className="text-sage-700" size={28} aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Let's set your defaults</h1>
          <p className="text-sm text-ink-500">
            You can always change these later in Settings.
          </p>
        </div>
      </header>
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Onboarding steps">
        {STEPS.map((label, idx) => (
          <li
            key={label}
            className={`rounded-full border px-3 py-1 text-xs ${
              idx === step
                ? 'border-sage-600 bg-sage-100 text-sage-800'
                : idx < step
                  ? 'border-success-500 bg-success-100 text-success-700'
                  : 'border-border bg-white text-ink-500'
            }`}
          >
            {idx + 1}. {label}
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          {step === 0 && (
            <div className="space-y-4">
              <Input
                label="Display name"
                rightIcon={<VoiceInputButton />}
                {...register('displayName')}
                error={errors.displayName?.message}
                required
              />
              <Input
                label="Household size"
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                {...register('householdSize', { valueAsNumber: true })}
                error={errors.householdSize?.message}
              />
              <Input
                label="Default servings"
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                {...register('defaultServings', { valueAsNumber: true })}
                error={errors.defaultServings?.message}
              />
              <Select
                label="Default plan length"
                {...register('defaultPlanLength', { valueAsNumber: true })}
              >
                <option value={3}>3 dinners</option>
                <option value={5}>5 dinners</option>
                <option value={7}>7 dinners</option>
              </Select>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Input
                label="Max total time per meal (minutes)"
                type="number"
                min={15}
                max={180}
                {...register('maxTotalTimeMinutes', { valueAsNumber: true })}
                error={errors.maxTotalTimeMinutes?.message}
              />
              <Select label="Cooking skill" {...register('skillLevel')}>
                <option value="beginner">Beginner — few techniques</option>
                <option value="intermediate">Intermediate — comfortable</option>
                <option value="advanced">Advanced — bring it on</option>
              </Select>
              <Select label="Approximate dinner budget" {...register('budgetPreference')}>
                <option value="everyday">Everyday — pantry staples</option>
                <option value="moderate">Moderate — some nice touches</option>
                <option value="splurge">Splurge — special ingredients okay</option>
              </Select>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink-900">Dietary pattern</legend>
                <div className="flex flex-wrap gap-2">
                  {DietaryPatternSchema.options.map((label) => (
                    <Chip
                      key={label}
                      active={values.dietaryPattern === label}
                      onClick={() =>
                        setValue('dietaryPattern', label as DietaryPattern, {
                          shouldDirty: true,
                        })
                      }
                    >
                      {label.replaceAll('_', ' ')}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink-900">Allergens to avoid</legend>
                <div className="flex flex-wrap gap-2">
                  {AllergenSchema.options.map((label) => (
                    <Chip
                      key={label}
                      active={(values.allergens ?? []).includes(label as Allergen)}
                      onClick={() => toggleArrayField('allergens', label)}
                    >
                      {label.replaceAll('_', ' ')}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              <Input
                label="Other ingredients to avoid (comma separated)"
                placeholder="e.g. cilantro, anchovies"
                rightIcon={<VoiceInputButton />}
                {...register('excludedIngredients')}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink-900">Favorite cuisines</legend>
                <div className="flex flex-wrap gap-2">
                  {CUISINES.map((c) => (
                    <Chip
                      key={c}
                      active={(values.favoriteCuisines ?? []).includes(c)}
                      onClick={() => toggleArrayField('favoriteCuisines', c)}
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink-900">Preferred proteins</legend>
                <div className="flex flex-wrap gap-2">
                  {PROTEINS.map((p) => (
                    <Chip
                      key={p}
                      active={(values.preferredProteins ?? []).includes(p)}
                      onClick={() => toggleArrayField('preferredProteins', p)}
                    >
                      {p}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink-900">
                  Available equipment
                </legend>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT.map((e) => (
                    <Chip
                      key={e}
                      active={(values.availableEquipment ?? []).includes(e)}
                      onClick={() => toggleArrayField('availableEquipment', e)}
                    >
                      {e}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              <Select label="Leftover preference" {...register('leftoverPreference')}>
                <option value="none">No leftovers — fresh each night</option>
                <option value="some">Some — small reusable portions</option>
                <option value="lots">Lots — meal-prep friendly</option>
              </Select>

              <Select label="Measurement system" {...register('measurementSystem')}>
                <option value="metric">Metric (g, ml)</option>
                <option value="imperial">Imperial (oz, cup)</option>
              </Select>
            </div>
          )}
        </Card>
        <div className="mt-6 flex justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={back}
            disabled={step === 0}
            leftIcon={<ArrowLeft size={14} aria-hidden="true" />}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              variant="primary"
              onClick={next}
              rightIcon={<ArrowRight size={14} aria-hidden="true" />}
            >
              Continue
            </Button>
          ) : (
            <Button type="submit" variant="primary">
              Finish setup
            </Button>
          )}
        </div>
      </form>
    </main>
  );
};
