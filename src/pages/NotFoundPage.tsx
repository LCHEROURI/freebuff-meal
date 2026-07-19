import { Button } from '@/components/common/Button';

export const NotFoundPage = () => (
  <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 text-center">
    <p className="text-sm font-semibold uppercase text-sage-700">404</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
    <p className="mt-2 text-ink-500">
      The page you're looking for has either moved or doesn't exist.
    </p>
    <Button asChildLink to="/" variant="primary" className="mt-6">
      Back to home
    </Button>
  </main>
);
