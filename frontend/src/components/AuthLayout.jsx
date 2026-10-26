// Shared two-column layout used by Login, Signup, ForgotPassword, and
// ResetPassword. Previously each page defined its own identical copy —
// extracted here so the auth pages' shell only needs to change in one place.
export default function AuthLayout({ children, quote, subquote, image }) {
  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-12">
      {/* Full screen background image — all screen sizes */}
      <img
        src={image}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Dark overlay — heavier on mobile so form is readable */}
      <div className="absolute inset-0 bg-mall-900/80 lg:bg-transparent" />
      {/* Split overlay for large screens — left lighter, right darker */}
      <div className="absolute inset-0 hidden lg:block bg-gradient-to-r from-mall-900/50 via-mall-900/40 to-mall-900/90" />
      {/* Bottom to top fade always */}
      <div className="absolute inset-0 bg-gradient-to-t from-mall-900/60 to-transparent" />

      {/* Content wrapper */}
      <div className="relative z-10 w-full max-w-5xl mx-auto lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">

        {/* Left — quote (hidden on mobile, shown lg+) */}
        <div className="hidden lg:block text-center lg:text-left">
          <p className="font-display text-3xl xl:text-4xl text-cream leading-tight mb-4">
            {quote}
          </p>
          <p className="text-cream/50 text-sm leading-relaxed mb-6">{subquote}</p>
          <div className="flex items-center gap-1.5 lg:justify-start justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-mall-orange" />
            <span className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest">
              Azard Stores · Always Open
            </span>
          </div>
        </div>

        {/* Right — form (full width on mobile/tablet, half on lg) */}
        <div className="w-full max-w-sm mx-auto lg:mx-0">
          {/* Mobile quote — shown below lg */}
          <div className="lg:hidden text-center mb-8">
            <p className="font-display text-2xl sm:text-3xl text-cream leading-tight mb-2">
              {quote}
            </p>
            <p className="text-cream/40 text-xs sm:text-sm leading-relaxed">{subquote}</p>
          </div>

          {/* Form container */}
          <div className="bg-mall-900/70 backdrop-blur-md rounded-2xl p-6 sm:p-8 border border-cream/10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
