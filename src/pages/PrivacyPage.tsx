import { Link } from 'react-router-dom';

export const PrivacyPage = () => (
  <main className="mx-auto w-full max-w-2xl px-4 py-12">
    <Link to="/" className="text-sm text-sage-700 hover:underline">← Back</Link>
    <h1 className="mt-4 text-3xl font-semibold tracking-tight">Privacy summary</h1>
    <p className="mt-2 text-sm text-ink-500">Last updated: pre-launch</p>
    <article className="prose prose-sm mt-6 max-w-none text-ink-700">
      <p>
        This MVP is pre-release. The following is a summary, not a final
        privacy policy. Have it reviewed before commercial launch.
      </p>
      <h2 className="mt-6 text-lg font-semibold">What we store</h2>
      <ul className="list-disc pl-5">
        <li>Your account email and display name (Firebase Authentication).</li>
        <li>Your meal-plan preferences (household, diet, allergens, equipment).</li>
        <li>Your saved meal plans, recipes, and shopping lists.</li>
        <li>Anonymous usage counts (e.g. daily generation count).</li>
      </ul>
      <h2 className="mt-6 text-lg font-semibold">What we don't do</h2>
      <ul className="list-disc pl-5">
        <li>We do not sell your data.</li>
        <li>We do not use your free-text meal requests for advertising.</li>
        <li>We do not place dietary or allergy information in public URLs.</li>
      </ul>
      <h2 className="mt-6 text-lg font-semibold">Sharing</h2>
      <p>
        When you share a plan, we publish a snapshot that excludes your email,
        profile, and free-text request. Revoke a share at any time.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Account deletion</h2>
      <p>
        Account deletion removes your profile, saved plans, and share links.
        Anonymous usage records may be retained for fraud prevention.
      </p>
    </article>
  </main>
);
