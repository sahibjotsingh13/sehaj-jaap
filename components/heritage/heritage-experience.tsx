import Image from 'next/image';

type Locale = 'en' | 'pa';

function copy(locale: Locale, english: string, punjabi: string) {
  return locale === 'pa' ? punjabi : english;
}

function HeritageFrame({
  src,
  alt,
  label,
  title,
  body,
  align = 'left',
  position = 'center',
}: {
  src: string;
  alt: string;
  label: string;
  title: string;
  body: string;
  align?: 'left' | 'right';
  position?: string;
}) {
  return (
    <article
      className={`heritage-story-frame ${align === 'right' ? 'heritage-story-frame-right' : ''}`}
      data-reveal
    >
      <div className="heritage-story-media">
        <Image
          alt={alt}
          className="heritage-story-image object-cover"
          fill
          quality={92}
          sizes="(max-width: 900px) 100vw, 72vw"
          src={src}
          style={{ objectPosition: position }}
        />
        <span className="heritage-story-vignette" aria-hidden="true" />
      </div>
      <div className="heritage-story-copy">
        <p className="eyebrow">{label}</p>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </article>
  );
}

export function HeritageExperience({ locale }: { locale: Locale }) {
  return (
    <div className="heritage-experience view-stage">
      <section className="heritage-hero heritage-photo-hero" data-reveal>
        <Image
          alt="Illuminated Sikh heritage architecture"
          className="heritage-hero-image object-cover"
          fill
          priority
          quality={94}
          sizes="100vw"
          src="/hazur-sahib.jpg"
          style={{ objectPosition: 'center 44%' }}
        />
        <span className="heritage-hero-overlay" aria-hidden="true" />
        <div className="heritage-hero-copy">
          <p className="eyebrow text-white/70">
            {copy(locale, 'Living heritage', 'ਜੀਵੰਤ ਵਿਰਾਸਤ')}
          </p>
          <h1>
            {copy(
              locale,
              'Sacred architecture, living light.',
              'ਪਵਿੱਤਰ ਵਾਸਤੁਕਲਾ, ਜੀਵੰਤ ਰੌਸ਼ਨੀ।',
            )}
          </h1>
          <p>
            {copy(
              locale,
              'A calm visual journey through Sikh heritage, built around high-resolution photography, generous space and deliberate motion.',
              'ਉੱਚ-ਗੁਣਵੱਤਾ ਫੋਟੋਗ੍ਰਾਫੀ, ਖੁੱਲ੍ਹੀ ਥਾਂ ਅਤੇ ਸੋਚ-ਸਮਝ ਕੇ ਕੀਤੇ ਮੋਸ਼ਨ ਨਾਲ ਸਿੱਖ ਵਿਰਾਸਤ ਦੀ ਇੱਕ ਸ਼ਾਂਤ ਦ੍ਰਿਸ਼ ਯਾਤਰਾ।',
            )}
          </p>
        </div>
        <div className="heritage-hero-index" aria-hidden="true">
          <span>01</span>
          <span className="heritage-hero-index-line" />
          <span>05</span>
        </div>
      </section>

      <section className="heritage-story-sequence">
        <HeritageFrame
          alt="Sri Harmandir Sahib"
          body={copy(
            locale,
            'A wide architectural frame creates a sense of arrival. The image remains clear and unobstructed while typography stays secondary.',
            'ਵਿਸ਼ਾਲ ਵਾਸਤੁਕ ਦ੍ਰਿਸ਼ ਆਗਮਨ ਦੀ ਭਾਵਨਾ ਪੈਦਾ ਕਰਦਾ ਹੈ। ਤਸਵੀਰ ਸਾਫ਼ ਅਤੇ ਬਿਨਾਂ ਰੁਕਾਵਟ ਰਹਿੰਦੀ ਹੈ, ਜਦਕਿ ਲਿਖਤ ਦੂਜੇ ਪੱਧਰ ਤੇ ਰਹਿੰਦੀ ਹੈ।',
          )}
          label={copy(locale, 'Sacred light', 'ਪਵਿੱਤਰ ਰੌਸ਼ਨੀ')}
          position="center 48%"
          src="/golden-temple.jpg"
          title={copy(locale, 'A luminous presence', 'ਰੌਸ਼ਨ ਹਾਜ਼ਰੀ')}
        />
        <HeritageFrame
          align="right"
          alt="Takht Sri Hazur Sahib"
          body={copy(
            locale,
            'The closer composition draws attention to geometry, material and illuminated detail without placing opaque panels over the photograph.',
            'ਨੇੜਲੀ ਰਚਨਾ ਫੋਟੋ ਉੱਤੇ ਭਾਰੀ ਪੈਨਲ ਰੱਖੇ ਬਿਨਾਂ ਰੇਖਾਵਾਂ, ਸਮੱਗਰੀ ਅਤੇ ਰੌਸ਼ਨ ਵਿਸਥਾਰ ਵੱਲ ਧਿਆਨ ਲਿਆਉਂਦੀ ਹੈ।',
          )}
          label={copy(locale, 'Detail', 'ਵਿਸਥਾਰ')}
          position="center 42%"
          src="/hazur-sahib.jpg"
          title={copy(locale, 'Craft in every surface', 'ਹਰ ਸਤ੍ਹਾ ਵਿੱਚ ਕਲਾ')}
        />
        <HeritageFrame
          alt="Sri Hemkund Sahib"
          body={copy(
            locale,
            'The landscape becomes part of the story. Space, stillness and architecture are allowed to breathe as one composition.',
            'ਦ੍ਰਿਸ਼ ਵੀ ਕਹਾਣੀ ਦਾ ਹਿੱਸਾ ਬਣਦਾ ਹੈ। ਥਾਂ, ਸ਼ਾਂਤੀ ਅਤੇ ਵਾਸਤੁਕਲਾ ਨੂੰ ਇੱਕ ਹੀ ਰਚਨਾ ਵਜੋਂ ਖੁੱਲ੍ਹ ਕੇ ਸਾਹ ਲੈਣ ਦਿੱਤਾ ਗਿਆ ਹੈ।',
          )}
          label={copy(locale, 'Stillness', 'ਸ਼ਾਂਤੀ')}
          position="center 50%"
          src="/hemkund-sahib.jpg"
          title={copy(locale, 'Space for reflection', 'ਮਨਨ ਲਈ ਥਾਂ')}
        />
      </section>

      <section className="heritage-photo-break" data-reveal>
        <div className="heritage-photo-break-copy">
          <p className="eyebrow">{copy(locale, 'Pause', 'ਠਹਿਰਾਅ')}</p>
          <h2>
            {copy(
              locale,
              'Let the image hold the moment.',
              'ਪਲ ਨੂੰ ਤਸਵੀਰ ਵਿੱਚ ਠਹਿਰਣ ਦਿਓ।',
            )}
          </h2>
          <p>
            {copy(
              locale,
              'Low-resolution background videos have been removed. This section now uses a single high-quality photograph with subtle depth motion so the experience stays sharp and smooth.',
              'ਘੱਟ-ਗੁਣਵੱਤਾ ਵਾਲੇ ਬੈਕਗ੍ਰਾਊਂਡ ਵੀਡੀਓ ਹਟਾ ਦਿੱਤੇ ਗਏ ਹਨ। ਹੁਣ ਇਹ ਹਿੱਸਾ ਹੌਲੀ ਡੈਪਥ ਮੋਸ਼ਨ ਨਾਲ ਇੱਕ ਉੱਚ-ਗੁਣਵੱਤਾ ਤਸਵੀਰ ਵਰਤਦਾ ਹੈ, ਤਾਂ ਜੋ ਅਨੁਭਵ ਸਾਫ਼ ਅਤੇ ਸੁਚੱਜਾ ਰਹੇ।',
            )}
          </p>
        </div>
        <div className="heritage-photo-break-window">
          <Image
            alt="Takht Sri Kesgarh Sahib"
            className="object-cover"
            fill
            quality={92}
            sizes="(max-width: 900px) 100vw, 68vw"
            src="/kesgarh-sahib.jpg"
            style={{ objectPosition: 'center 48%' }}
          />
          <span className="heritage-photo-break-overlay" aria-hidden="true" />
        </div>
      </section>

      <section className="heritage-archive" data-reveal>
        <div className="heritage-archive-heading">
          <p className="eyebrow">{copy(locale, 'Archive', 'ਅਰਕਾਈਵ')}</p>
          <h2>{copy(locale, 'Places, memory, continuity.', 'ਥਾਵਾਂ, ਯਾਦ, ਨਿਰੰਤਰਤਾ।')}</h2>
        </div>
        <div className="heritage-archive-track">
          {[
            ['/golden-temple.jpg', 'Sri Harmandir Sahib'],
            ['/hazur-sahib.jpg', 'Takht Sri Hazur Sahib'],
            ['/hemkund-sahib.jpg', 'Sri Hemkund Sahib'],
            ['/kesgarh-sahib.jpg', 'Takht Sri Kesgarh Sahib'],
            ['/bangla-sahib.jpg', 'Gurdwara Bangla Sahib'],
          ].map(([src, title], index) => (
            <figure className="heritage-archive-item" key={src}>
              <div className="heritage-archive-image">
                <Image
                  alt={title}
                  className="object-cover"
                  fill
                  quality={90}
                  sizes="(max-width: 700px) 78vw, 34vw"
                  src={src}
                />
              </div>
              <figcaption>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{title}</strong>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
