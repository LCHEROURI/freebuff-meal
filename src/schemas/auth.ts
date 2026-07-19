import { z } from 'zod';
import {
  AllergenSchema,
  DietaryPatternSchema,
} from './ingredient';

/** Profile payload written to `users/{uid}`. */
export const UserProfileSchema = z.object({
  displayName: z.string().min(1).max(60),
  email: z.string().email().optional(),
  householdSize: z.number().int().min(1).max(12).default(2),
  defaultServings: z.number().int().min(1).max(12).default(2),
  defaultPlanLength: z.union([z.literal(3), z.literal(5), z.literal(7)]).default(5),
  maxTotalTimeMinutes: z.number().int().min(15).max(180).default(45),
  dietaryPattern: DietaryPatternSchema.default('none'),
  allergens: z.array(AllergenSchema).max(40).default([]),
  excludedIngredients: z.array(z.string().max(60)).max(40).default([]),
  favoriteCuisines: z.array(z.string().max(40)).max(10).default([]),
  dislikedCuisines: z.array(z.string().max(40)).max(10).default([]),
  preferredProteins: z.array(z.string().max(40)).max(10).default([]),
  availableEquipment: z.array(z.string().max(40)).max(20).default([]),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
  budgetPreference: z.enum(['everyday', 'moderate', 'splurge']).default('everyday'),
  leftoverPreference: z.enum(['none', 'some', 'lots']).default('some'),
  measurementSystem: z.enum(['metric', 'imperial']).default('metric'),
  timezone: z.string().default('UTC'),
  onboardingCompleted: z.boolean().default(false),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/** Helper schemas for auth forms. */
export const SignUpSchema = z
  .object({
    displayName: z.string().min(1, 'Tell us how to greet you.').max(60),
    email: z.string().email('Enter a valid email.'),
    password: z
      .string()
      .min(8, 'At least 8 characters.')
      .max(128, 'Too long.'),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms to create an account.' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type SignUpValues = z.infer<typeof SignUpSchema>;

export const SignInSchema = z.object({
  email: z.string().email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type SignInValues = z.infer<typeof SignInSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email.'),
});
export type ForgotPasswordValues = z.infer<typeof ForgotPasswordSchema>;
