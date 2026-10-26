export default function LegalPage({ eyebrow = "Azard Stores", title, updated, intro, sections }) {
  return (
    <div className="min-h-screen bg-mall-900 px-4 sm:px-6 py-16 sm:py-24">
      <div className="max-w-2xl mx-auto">
        {/* Heading */}
        <div className="mb-12 sm:mb-16">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
            {eyebrow}
          </p>
          <h1 className="font-display text-3xl sm:text-5xl text-cream mb-4 leading-tight">
            {title}
          </h1>
          {updated && (
            <p className="font-mono-tag text-[10px] uppercase text-cream/30 tracking-widest">
              Last updated: {updated}
            </p>
          )}
          {intro && (
            <p className="text-cream/50 text-sm sm:text-base leading-relaxed mt-4">{intro}</p>
          )}
        </div>

        {/* Sections */}
        <div className="space-y-8 sm:space-y-10">
          {sections.map((section) => (
            <div key={section.heading}>
              <h2 className="font-display text-cream text-lg sm:text-xl mb-3">{section.heading}</h2>
              {Array.isArray(section.body) ? (
                <ul className="space-y-2">
                  {section.body.map((line, i) => (
                    <li key={i} className="text-cream/50 text-sm leading-relaxed flex gap-2.5">
                      <span className="text-mall-orange shrink-0">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-cream/50 text-sm leading-relaxed">{section.body}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
