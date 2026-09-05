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
}: {
  src: string;
  alt: string;
  label: string;
  title: string;
  body: string;
  align?: 'left' | 'right';
}) {
  return (
    <article className={`heritage-story-frame ${align === 'right' ? 'heritage-story-frame-right' : ''}`}>
      <div className="heritage-story-media">
        <Image
          alt={alt}
          className="heritage-story-image object-cover"
          fill
          sizes="(max-width: 900px) 100vw, 72vw"
          src={src}
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
      <section className="heritage-hero">
        <video
          autoPlay
          className="heritage-hero-video"
          loop
          muted
          playsInline
          poster="/heritage-user-03.webp"
          preload="metadata"
        >
          <source src="/heritage-motion-01.webm" type="video/webm" />
        </video>
        <span className="heritage-hero-overlay" aria-hidden="true" />
        <div className="heritage-hero-copy">
          <p className="eyebrow text-white/65">
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
              'A slower visual journey through the photographs and films you shared — presented as atmosphere, memory and place rather than a wall of cards.',
              'ਤੁਹਾਡੇ ਸਾਂਝੇ ਕੀਤੇ ਫੋਟੋਆਂ ਅਤੇ ਫ਼ਿਲਮਾਂ ਰਾਹੀਂ ਇੱਕ ਹੌਲੀ ਦ੍ਰਿਸ਼ ਯਾਤਰਾ — ਕਾਰਡਾਂ ਦੀ ਭੀੜ ਨਹੀਂ, ਸਗੋਂ ਮਾਹੌਲ, ਯਾਦ ਅਤੇ ਥਾਂ ਵਜੋਂ।',
            )}
          </p>
        </div>
        <div className="heritage-hero-index" aria-hidden="true">
          <span>01</span>
          <span className="heritage-hero-index-line" />
          <span>04</span>
        </div>
      </section>

      <section className="heritage-story-sequence">
        <HeritageFrame
          alt="Illuminated gurdwara facade at night"
          body={copy(
            locale,
            'Night isolates the architecture from distraction. Light becomes the visual guide, while the original photographic character remains intact.',
            'ਰਾਤ ਇਮਾਰਤ ਨੂੰ ਭਟਕਾਵੇ ਤੋਂ ਵੱਖ ਕਰਦੀ ਹੈ। ਰੌਸ਼ਨੀ ਦ੍ਰਿਸ਼ ਮਾਰਗਦਰਸ਼ਕ ਬਣਦੀ ਹੈ ਅਤੇ ਮੂਲ ਫੋਟੋਗ੍ਰਾਫ਼ਿਕ ਸੁਭਾਵ ਕਾਇਮ ਰਹਿੰਦਾ ਹੈ।',
          )}
          label={copy(locale, 'Night light', 'ਰਾਤ ਦੀ ਰੌਸ਼ਨੀ')}
          src="/heritage-user-01.webp"
          title={copy(locale, 'A luminous presence', 'ਰੌਸ਼ਨ ਹਾਜ਼ਰੀ')}
        />
        <HeritageFrame
          align="right"
          alt="Close view of illuminated dome and marble architecture"
          body={copy(
            locale,
            'The closer frame rewards attention: marble relief, domes, lights and the Ik Onkar form become a layered composition rather than decoration.',
            'ਨੇੜਲਾ ਦ੍ਰਿਸ਼ ਧਿਆਨ ਦਾ ਇਨਾਮ ਦਿੰਦਾ ਹੈ: ਸੰਗਮਰਮਰ, ਗੁੰਬਦ, ਰੌਸ਼ਨੀ ਅਤੇ ਇਕ ਓਅੰਕਾਰ ਦੀ ਰੂਪ-ਰਚਨਾ ਸਿਰਫ਼ ਸਜਾਵਟ ਨਹੀਂ ਰਹਿੰਦੀ।',
          )}
          label={copy(locale, 'Detail', 'ਵਿਸਥਾਰ')}
          src="/heritage-user-02.webp"
          title={copy(locale, 'Craft in every surface', 'ਹਰ ਸਤ੍ਹਾ ਵਿੱਚ ਕਲਾ')}
        />
        <HeritageFrame
          alt="Gurdwara courtyard with Sangat and Nishan Sahib"
          body={copy(
            locale,
            'The wider courtyard brings people back into the frame. Heritage is not only architecture; it is movement, arrival, Sangat and shared presence.',
            'ਵਿਸ਼ਾਲ ਪਰਿਸਰ ਲੋਕਾਂ ਨੂੰ ਮੁੜ ਦ੍ਰਿਸ਼ ਵਿੱਚ ਲਿਆਉਂਦਾ ਹੈ। ਵਿਰਾਸਤ ਸਿਰਫ਼ ਇਮਾਰਤ ਨਹੀਂ; ਇਹ ਚਲਹਲ-ਪਹਿਲ, ਆਗਮਨ, ਸੰਗਤ ਅਤੇ ਸਾਂਝੀ ਹਾਜ਼ਰੀ ਹੈ।',
          )}
          label={copy(locale, 'Sangat', 'ਸੰਗਤ')}
          src="/heritage-user-03.webp"
          title={copy(locale, 'A place that is lived', 'ਇੱਕ ਜੀਵੰਤ ਥਾਂ')}
        />
      </section>

      <section className="heritage-film-break">
        <div className="heritage-film-copy">
          <p className="eyebrow">{copy(locale, 'In motion', 'ਚਲਦੀ ਵਿਰਾਸਤ')}</p>
          <h2>
            {copy(
              locale,
              'Let the scene breathe.',
              'ਦ੍ਰਿਸ਼ ਨੂੰ ਸਾਹ ਲੈਣ ਦਿਓ।',
            )}
          </h2>
          <p>
            {copy(
              locale,
              'The second film is intentionally quiet and full-width. It creates a pause between stories and makes the scroll feel cinematic instead of interface-heavy.',
              'ਦੂਜੀ ਫ਼ਿਲਮ ਜਾਣਬੁੱਝ ਕੇ ਸ਼ਾਂਤ ਅਤੇ ਪੂਰੀ ਚੌੜਾਈ ਵਿੱਚ ਹੈ। ਇਹ ਕਹਾਣੀਆਂ ਵਿਚਕਾਰ ਠਹਿਰਾਅ ਬਣਾਉਂਦੀ ਹੈ ਅਤੇ ਸਕ੍ਰੋਲ ਨੂੰ ਇੰਟਰਫੇਸ-ਭਾਰੀ ਨਹੀਂ, ਸਿਨੇਮੈਟਿਕ ਮਹਿਸੂਸ ਕਰਦੀ ਹੈ।',
            )}
          </p>
        </div>
        <div className="heritage-film-window">
          <video
            autoPlay
            loop
            muted
            playsInline
            poster="/heritage-user-02.webp"
            preload="metadata"
          >
            <source src="/heritage-motion-02.webm" type="video/webm" />
          </video>
          <span className="heritage-film-window-overlay" aria-hidden="true" />
        </div>
      </section>

      <section className="heritage-archive">
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
