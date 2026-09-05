import Link from 'next/link';

export const metadata = {
  title: 'Privacy — Sehaj Jaap',
  description: 'How Sehaj Jaap handles account and practice information.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-5 py-12 text-foreground sm:px-8">
      <article className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold text-primary hover:underline" href="/">
          ← Back to Sehaj Jaap
        </Link>
        <h1 className="mt-8 font-heading text-4xl font-semibold tracking-[-.04em] sm:text-5xl">
          Privacy
        </h1>
        <p className="mt-5 text-base leading-8 text-muted-foreground">
          Sehaj Jaap uses your account to keep your Jaap progress, saved sessions and Sangat
          membership associated with you across devices.
        </p>

        <div className="mt-10 grid gap-8 text-[15px] leading-7">
          <section>
            <h2 className="text-xl font-semibold">Information you provide</h2>
            <p className="mt-2 text-muted-foreground">
              Account creation asks for a display name, a unique username and a password.
              Sehaj Jaap does not ask for payment-card information, banking information or a
              phone number to create an account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Passwords</h2>
            <p className="mt-2 text-muted-foreground">
              Passwords are processed for authentication and stored as salted password hashes,
              not as readable passwords. You should still use a password that you do not reuse
              on another website.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Practice information</h2>
            <p className="mt-2 text-muted-foreground">
              Your Jaap totals, sessions, preferences and Sangat-related state may be stored so
              that your account can continue across devices. Sangat privacy controls determine
              how much of your practice is shown to other members.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">No advertising profile</h2>
            <p className="mt-2 text-muted-foreground">
              Sehaj Jaap is designed as a spiritual practice utility and does not require
              payment information to use its core account and Jaap features.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
