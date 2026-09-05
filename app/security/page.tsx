import Link from 'next/link';

export const metadata = {
  title: 'Security — Sehaj Jaap',
  description: 'Account-security information for Sehaj Jaap.',
};

export default function SecurityPage() {
  return (
    <main className="min-h-dvh bg-background px-5 py-12 text-foreground sm:px-8">
      <article className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold text-primary hover:underline" href="/">
          ← Back to Sehaj Jaap
        </Link>
        <h1 className="mt-8 font-heading text-4xl font-semibold tracking-[-.04em] sm:text-5xl">
          Account security
        </h1>
        <p className="mt-5 text-base leading-8 text-muted-foreground">
          A Sehaj Jaap account is used only to identify your practice data and synchronize it
          across devices.
        </p>

        <div className="mt-10 grid gap-8 text-[15px] leading-7">
          <section>
            <h2 className="text-xl font-semibold">What we will ask for</h2>
            <p className="mt-2 text-muted-foreground">
              Sign-in uses your Sehaj Jaap username and password. We do not ask for a bank
              password, card number, payment credentials or another website&apos;s password.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Use a unique password</h2>
            <p className="mt-2 text-muted-foreground">
              Do not reuse a password from email, banking, social-media or other important
              accounts. A password unique to Sehaj Jaap prevents password reuse from putting
              another account at risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Same-origin sign-in</h2>
            <p className="mt-2 text-muted-foreground">
              The browser submits account requests to the Sehaj Jaap website itself. Backend
              account processing is performed server-side rather than by sending a password
              directly from your browser to an unrelated third-party page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Report a security concern</h2>
            <p className="mt-2 text-muted-foreground">
              Security concerns can be reported through the public project issue tracker linked
              from the site&apos;s security.txt file.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
