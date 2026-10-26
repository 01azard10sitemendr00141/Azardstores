// Shared labeled input used across the auth pages (Login, Signup,
// ForgotPassword, ResetPassword). Extracted from 4 identical copies.
export default function AuthInput({ label, id, name, type = "text", value, onChange, placeholder, suffix, minLength, maxLength, autoComplete = "off" }) {
  const inputId = id || `auth-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return (
    <div className="mb-5">
      <label htmlFor={inputId} className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest block mb-2">
        {label}
      </label>
      <div className="flex items-center gap-2 border-b border-cream/15 pb-2 focus-within:border-mall-accent transition">
        <input
          id={inputId}
          name={name || inputId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          minLength={minLength}
          maxLength={maxLength}
          className="flex-1 min-w-0 bg-transparent text-cream placeholder-cream/20 text-sm appearance-none border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
          autoComplete={autoComplete}
        />
        {suffix}
      </div>
    </div>
  );
}
