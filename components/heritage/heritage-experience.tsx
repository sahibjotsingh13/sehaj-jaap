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
  width,
  height,
  align = 'left',
}: {
  src: string;
  alt: string;
  label: string;
  title: string;
  body: string;
  width: number;
  height: number;
  align?: 'left' | 'right';
}) {
  return (
    <article
      className={`heritage-story-frame supplied-story-frame ${align === 'right' ? 'heritage-story-frame-right' : ''}`}
      data-reveal
    >
      <div className="heritage-story-media supplied-gallery-media">
        <Image
          alt={alt}
          className="supplied-gallery-image"
          width={width}
          height={height}
          sizes="(max-width: 700px) 92vw, (max-width: 1100px) 65vw, 720px"
          src={src}
        />
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
    <div className="heritage-experience supplied-heritage view-stage">
      <section className="heritage-hero supplied-heritage-hero" data-reveal>
        <div className="supplied-heritage-hero-photo">
          <Image
            alt="Golden dome and illuminated marble facade of Takht Sri Hazur Sahib at night"
            className="supplied-gallery-image"
            width={960}
            height={1280}
            priority
            sizes="(max-width: 700px) 92vw, 650px"
            src="/media/sangat/hazur-golden-dome.jpeg"
          />
        </div>
        <div className="heritage-hero-copy">
          <p className="eyebrow text-white/70">
            {copy(locale, 'Sikh heritage', 'ਸਿੱਖ ਵਿਰਾਸਤ')}
          </p>
          <h1>
            {copy(locale, 'A journey of remembrance.', 'ਯਾਦਾਂ ਅਤੇ ਸ਼ਰਧਾ ਦੀ ਯਾਤਰਾ।')}
          </h1>
          <p>
            {copy(locale, 'Sacred places, treasured art and the light of Sangat.', 'ਪਵਿੱਤਰ ਅਸਥਾਨ, ਅਨਮੋਲ ਕਲਾ ਅਤੇ ਸੰਗਤ ਦਾ ਚਾਨਣ।')}
          </p>
        </div>
      </section>

      <section className="heritage-story-sequence">
        <HeritageFrame
          alt="Golden domes above the facade of Gurdwara Sis Ganj Sahib in Delhi"
          body={copy(locale, 'Golden domes rise above the red and cream facade in Delhi.', 'ਦਿੱਲੀ ਵਿਖੇ ਲਾਲ ਅਤੇ ਕਰੀਮ ਰੰਗ ਦੇ ਮੁੱਖ ਦਰਵਾਜ਼ੇ ਉੱਪਰ ਸੁਨਹਿਰੀ ਗੁੰਬਦ।')}
          label={copy(locale, 'Delhi', 'ਦਿੱਲੀ')}
          src="/media/sangat/sis-ganj-sahib.jpg"
          width={2601}
          height={1960}
          title={copy(locale, 'Gurdwara Sis Ganj Sahib', 'ਗੁਰਦੁਆਰਾ ਸੀਸ ਗੰਜ ਸਾਹਿਬ')}
        />
        <HeritageFrame
          align="right"
          alt="Sangat arriving beneath the illuminated dome of Takht Sri Hazur Sahib"
          body={copy(locale, 'An evening view of Takht Sri Hazur Sahib, Nanded.', 'ਨੰਦੇੜ ਵਿਖੇ ਤਖ਼ਤ ਸ੍ਰੀ ਹਜ਼ੂਰ ਸਾਹਿਬ ਦਾ ਸ਼ਾਮ ਦਾ ਦ੍ਰਿਸ਼।')}
          label={copy(locale, 'Nanded', 'ਨੰਦੇੜ')}
          src="/media/sangat/hazur-night-darshan.jpeg"
          width={960}
          height={1280}
          title={copy(locale, 'Takht Sri Hazur Sahib', 'ਤਖ਼ਤ ਸ੍ਰੀ ਹਜ਼ੂਰ ਸਾਹਿਬ')}
        />
        <HeritageFrame
          alt="Traditional Sikh portrait with a gold turban, green robes and a manuscript"
          body={copy(locale, 'A portrait in gold, green and warm earth tones.', 'ਸੁਨਹਿਰੀ, ਹਰੇ ਅਤੇ ਮਿੱਟੀ ਦੇ ਨਿੱਘੇ ਰੰਗਾਂ ਵਿੱਚ ਚਿੱਤਰ।')}
          label={copy(locale, 'Sikh art', 'ਸਿੱਖ ਕਲਾ')}
          src="/media/sangat/traditional-sikh-portrait.jpg"
          width={500}
          height={500}
          title={copy(locale, 'A treasured portrait', 'ਇੱਕ ਅਨਮੋਲ ਚਿੱਤਰ')}
        />
      </section>

      <section className="heritage-photo-break supplied-photo-break" data-reveal>
        <div className="heritage-photo-break-copy">
          <p className="eyebrow">{copy(locale, 'Darbar', 'ਦਰਬਾਰ')}</p>
          <h2>{copy(locale, 'Shastar and remembrance.', 'ਸ਼ਸਤਰ ਅਤੇ ਯਾਦ।')}</h2>
          <p>{copy(locale, 'A glimpse of the darbar, its shastar and golden detail.', 'ਦਰਬਾਰ, ਸ਼ਸਤਰਾਂ ਅਤੇ ਸੁਨਹਿਰੀ ਕਾਰੀਗਰੀ ਦੀ ਇੱਕ ਝਲਕ।')}</p>
        </div>
        <div className="heritage-photo-break-window supplied-gallery-media">
          <Image
            alt="Shastar and a Sikh portrait within a gold-decorated darbar"
            className="supplied-gallery-image"
            width={720}
            height={1278}
            sizes="(max-width: 700px) 92vw, 560px"
            src="/media/sangat/darbar-shastar.jpg"
          />
        </div>
      </section>

      <section className="heritage-archive" data-reveal>
        <div className="heritage-archive-heading">
          <p className="eyebrow">{copy(locale, 'Hazur Sahib', 'ਹਜ਼ੂਰ ਸਾਹਿਬ')}</p>
          <h2>{copy(locale, 'Marble, light and devotion.', 'ਸੰਗਮਰਮਰ, ਚਾਨਣ ਅਤੇ ਸ਼ਰਧਾ।')}</h2>
        </div>
        <div className="heritage-archive-track supplied-archive-grid">
          {[
            {
              src: '/media/sangat/hazur-marble-detail.jpeg',
              title: copy(locale, 'Illuminated marble', 'ਰੌਸ਼ਨ ਸੰਗਮਰਮਰ'),
              alt: 'A close view of the marble arches and illuminated Ik Onkar at Hazur Sahib',
            },
            {
              src: '/media/sangat/hazur-illuminated-arches.jpeg',
              title: copy(locale, 'An evening in Nanded', 'ਨੰਦੇੜ ਦੀ ਇੱਕ ਸ਼ਾਮ'),
              alt: 'Marble facade of Hazur Sahib lit against the night sky',
            },
          ].map(({ src, title, alt }, index) => (
            <figure className="heritage-archive-item" key={src}>
              <div className="heritage-archive-image supplied-gallery-media">
                <Image
                  alt={alt}
                  className="supplied-gallery-image"
                  width={960}
                  height={1280}
                  sizes="(max-width: 700px) 92vw, 46vw"
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
