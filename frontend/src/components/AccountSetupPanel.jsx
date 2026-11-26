import { useState } from "react";
import { KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { isValidPassword } from "../utils/passwordPolicy";

export default function AccountSetupPanel() {
  const { user, updateCurrentUser, refreshUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function sendCode() {
    setError("");
    setBusy(true);
    try {
      const response = await api.post("/auth/send-checkout-email-otp");
      setMessage(response.data.message || "A verification code has been sent to your email.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "We couldn't send the verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!isValidPassword(password)) {
      setError("Use a password with at least 12 characters and no more than 72 UTF-8 bytes.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await api.post("/auth/set-checkout-password", { password });
      updateCurrentUser(response.data.user);
      setPassword("");
      setConfirmPassword("");
      setMessage(response.data.message);
      try {
        await sendCode();
      } catch {
        // sendCode reports its own error and leaves setup available for retry.
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Your password could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await api.post("/auth/verify-checkout-email-otp", { code });
      updateCurrentUser(response.data.user);
      await refreshUser();
      setMessage("Email verified. Your account is now unlocked.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "That code could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  const needsPassword = user?.accountSetupStage === "password_required";

  return (
    <section className="mt-6 rounded-2xl border border-mall-accent/25 bg-mall-accent/5 p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        {needsPassword ? <KeyRound size={19} className="mt-0.5 text-mall-accent" /> : <MailCheck size={19} className="mt-0.5 text-mall-accent" />}
        <div>
          <h2 className="font-display text-xl text-cream">{needsPassword ? "Secure your account" : "Verify your email"}</h2>
          <p className="mt-1 text-xs leading-relaxed text-cream/55">
            {needsPassword
              ? "Your order is saved. Set a password to continue, then we’ll email you a one-time verification code."
              : `Your order is saved. Enter the code sent to ${user?.email} to unlock your account and continue.`}
          </p>
        </div>
      </div>

      {needsPassword ? (
        <form onSubmit={savePassword} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-cream/60">Create password<input required type="password" autoComplete="new-password" minLength={12} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream" /></label>
          <label className="text-xs text-cream/60">Confirm password<input required type="password" autoComplete="new-password" minLength={12} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream" /></label>
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-cream/40 sm:col-span-2"><ShieldCheck size={13} className="mt-0.5 shrink-0" />Use at least 12 characters. Your account remains limited until your email code is verified.</p>
          {error && <p role="alert" className="text-xs text-red-300 sm:col-span-2">{error}</p>}
          {message && <p role="status" className="text-xs text-emerald-200 sm:col-span-2">{message}</p>}
          <button type="submit" disabled={busy || !password || !confirmPassword} className="min-h-11 rounded-xl bg-mall-orange px-4 text-sm font-semibold text-mall-900 disabled:opacity-50 sm:col-span-2">{busy ? "Securing account…" : "Set password and send verification code"}</button>
        </form>
      ) : (
        <form onSubmit={verifyEmail} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-xs text-cream/60 sm:col-span-2">6-digit email code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm tracking-[0.3em] text-cream" /></label>
          {error && <p role="alert" className="text-xs text-red-300 sm:col-span-2">{error}</p>}
          {message && <p role="status" className="text-xs text-emerald-200 sm:col-span-2">{message}</p>}
          <button type="submit" disabled={busy || code.length !== 6} className="min-h-11 rounded-xl bg-mall-orange px-4 text-sm font-semibold text-mall-900 disabled:opacity-50">{busy ? "Verifying…" : "Verify email and unlock account"}</button>
          <button type="button" onClick={sendCode} disabled={busy} className="min-h-11 rounded-xl border border-cream/15 px-4 text-xs text-cream/70 disabled:opacity-50">Send another code</button>
        </form>
      )}
    </section>
  );
}
