import { Link } from 'react-router-dom';

export const TermsPage = () => (
  <main className="mx-auto w-full max-w-2xl px-4 py-12">
    <Link to="/" className="text-sm text-sage-700 hover:underline">← Back</Link>
    <h1 className="mt-4 text-3xl font-semibold tracking-tight">Terms summary</h1>
    <p className="mt-2 text-sm text-ink-500">Last updated: pre-launch</p>
    <article className="prose prose-sm mt-6 max-w-none text-ink-700">
      <p>
        This MVP is pre-release. The following is a summary, not a final
        terms of service document. Have it reviewed before commercial launch.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Use of the service</h2>
      <p>
        You agree to use the service for personal, non-commercial meal
        planning and to keep your account credentials safe.
      </p>
      <h2 className="mt-6 text-lg font-semibold">AI-generated content</h2>
      <p>
        Recipes are AI-generated and provided for inspiration. Always review
        them against personal allergies and any dietary advice from your
        healthcare provider. The service does not provide medical or
        nutritional advice.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Availability</h2>
      <p>
        Availability, performance, and pricing may change during the beta.
        Paid features, if introduced, will be clearly labeled.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Account suspension</h2>
      <p>
        We may suspend accounts that abuse the service or violate these
        terms.
      </p>
    </article>
  </main>
);
