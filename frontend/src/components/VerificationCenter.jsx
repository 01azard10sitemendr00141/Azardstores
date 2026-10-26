import { useEffect, useRef, useState } from "react";
import { MessageCircle, Phone, Send, ShieldCheck, ExternalLink, RefreshCw } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const buttonClass = "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition disabled:opacity-50";

function normalizeKenyanPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

export default function VerificationCenter({ embedded = false, open = false, phone, onPhoneChange }) {
  const { user, refreshUser, updateCurrentUser } = useAuth();
  const [caps, setCaps] = useState(null);
  const [capsError, setCapsError] = useState("");
  const [phoneExpanded, setPhoneExpanded] = useState(open);
  const [channel, setChannel] = useState("sms");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneMsg, setPhoneMsg] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [whatsappLink, setWhatsappLink] = useState("");
  const [polling, setPolling] = useState(false);
  const pollTimer = useRef(null);
  const verificationPhone = useRef("");

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/verification-methods")
      .then((res) => {
        if (cancelled) return;
        setCaps(res.data);
        setChannel(res.data.sms ? "sms" : "whatsapp");
      })
      .catch(() => { if (!cancelled) setCapsError("Could not load verification options. Refresh to try again."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => setPhoneExpanded(open), [open]);

  useEffect(() => () => clearInterval(pollTimer.current), []);

  useEffect(() => {
    const syncVerifiedUser = () => refreshUser().catch(() => {});
    window.addEventListener("focus", syncVerifiedUser);
    return () => window.removeEventListener("focus", syncVerifiedUser);
  }, [refreshUser]);

  async function handleSendCode() {
    setPhoneError("");
    setPhoneMsg("");
    if (!phone.trim()) { setPhoneError("Enter your phone number"); return; }
    if (otpSent && channel === "sms") setOtp("");
    setSending(true);
    try {
      const res = await api.post("/auth/send-phone-otp", { phone: phone.trim(), channel });
      const normalizedPhone = normalizeKenyanPhone(phone);
      verificationPhone.current = normalizedPhone;
      onPhoneChange?.(normalizedPhone);
      if (res.data.verified) {
        updateCurrentUser({ ...user, phone: normalizedPhone, isPhoneVerified: true });
        setPhoneMsg(res.data.message || "Your phone number is already verified.");
        return;
      }
      if (channel === "whatsapp") {
        setWhatsappLink(res.data.whatsappLink);
        startWhatsappPolling();
      } else {
        setPhoneMsg(res.data.message || "Verification code sent via SMS");
        setOtpSent(true);
      }
      // Sending the code has succeeded. A transient profile refresh failure
      // must not make the customer think the delivery failed.
      refreshUser().catch(() => {});
    } catch (err) {
      setPhoneError(err.response?.data?.message || "Couldn't send the code. Try again.");
    } finally {
      setSending(false);
    }
  }

  function startWhatsappPolling() {
    clearInterval(pollTimer.current);
    setPolling(true);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await api.get("/auth/phone-verification-status");
        if (res.data.verified) {
          clearInterval(pollTimer.current);
          setPolling(false);
          setWhatsappLink("");
          setPhoneMsg("Phone number verified successfully.");
          updateCurrentUser({ ...user, phone: verificationPhone.current || normalizeKenyanPhone(phone), isPhoneVerified: true });
          refreshUser().catch(() => {});
        } else if (!res.data.pending) {
          clearInterval(pollTimer.current);
          setPolling(false);
          setWhatsappLink("");
          setPhoneMsg("This verification request expired. Request a new code to try again.");
        }
      } catch {
        // Keep polling through temporary network errors.
      }
    }, 2500);
  }

  async function handleVerifySms() {
    setPhoneError("");
    if (!otp.trim()) { setPhoneError("Enter the code you received"); return; }
    setVerifying(true);
    try {
      const res = await api.post("/auth/verify-phone-otp", { otp: otp.trim() });
      const verifiedPhone = res.data.user?.phone || verificationPhone.current || normalizeKenyanPhone(phone);
      onPhoneChange?.(verifiedPhone);
      if (res.data.user) updateCurrentUser(res.data.user);
      else updateCurrentUser({ ...user, phone: verifiedPhone, isPhoneVerified: true });
      setOtpSent(false);
      setOtp("");
      setPhoneMsg(res.data.message || "Phone number verified successfully.");
      refreshUser().catch(() => {});
    } catch (err) {
      setPhoneError(err.response?.data?.message || "Incorrect or expired code");
    } finally {
      setVerifying(false);
    }
  }

  const smsAvailable = Boolean(caps?.sms);
  const whatsappAvailable = Boolean(caps?.whatsapp);
  const anyPhoneChannel = smsAvailable || whatsappAvailable;

  function chooseChannel(nextChannel) {
    setChannel(nextChannel);
    setPhoneError("");
    setPhoneMsg("");
    setOtpSent(false);
    setOtp("");
    setWhatsappLink("");
    clearInterval(pollTimer.current);
    setPolling(false);
  }

  function changePhoneNumber() {
    setPhoneError("");
    setPhoneMsg("");
    setOtpSent(false);
    setOtp("");
    setWhatsappLink("");
    clearInterval(pollTimer.current);
    setPolling(false);
  }

  return (
    <div className="space-y-0">
      <section aria-labelledby="phone-verification-title">
        <h3 id="phone-verification-title" className="sr-only">Phone number verification</h3>

        {user?.isPhoneVerified ? null : (
          embedded && !phoneExpanded ? null : !caps ? (
          <p className="text-cream/40 text-xs">{capsError || "Loading verification options..."}</p>
        ) : (
          <>
            {onPhoneChange && (
              <label className="block mt-3">
                <span className="block text-cream/45 text-[11px] uppercase tracking-wider mb-1.5">Mobile number</span>
                <input type="tel" autoComplete="tel" value={phone || ""} onChange={(event) => onPhoneChange(event.target.value)} placeholder="0712 345 678" className="w-full bg-mall-700 rounded-lg px-3 py-2.5 text-cream placeholder-cream/25 text-sm outline-none focus:ring-1 focus:ring-mall-accent" />
              </label>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <button type="button" onClick={() => chooseChannel("sms")} aria-pressed={channel === "sms"} disabled={!smsAvailable || otpSent || Boolean(whatsappLink)}
                className={`${buttonClass} border ${channel === "sms" ? "border-mall-accent text-mall-accent bg-mall-accent/10" : "border-cream/15 text-cream/55"}`}>
                <MessageCircle size={14} /> SMS {smsAvailable ? "- code by text" : "- not configured"}
              </button>
              <button type="button" onClick={() => chooseChannel("whatsapp")} aria-pressed={channel === "whatsapp"} disabled={!whatsappAvailable || otpSent || Boolean(whatsappLink)}
                className={`${buttonClass} border ${channel === "whatsapp" ? "border-mall-accent text-mall-accent bg-mall-accent/10" : "border-cream/15 text-cream/55"}`}>
                <ShieldCheck size={14} /> WhatsApp {whatsappAvailable ? "- confirm in chat" : "- not configured"}
              </button>
            </div>
            {anyPhoneChannel && !otpSent && !whatsappLink && (
              <div className="mt-3">
                <button type="button" onClick={handleSendCode} disabled={sending || (channel === "sms" ? !smsAvailable : !whatsappAvailable)} className={`${buttonClass} w-full bg-mall-accent text-mall-900 hover:bg-mall-accentDark`}>
                  <Send size={13} /> {sending ? "Preparing..." : channel === "sms" ? "Send SMS code" : "Continue with WhatsApp"}
                </button>
              </div>
            )}

            {otpSent && channel === "sms" && (
              <div className="mt-3 space-y-2">
                <p className="text-cream/50 text-xs">Enter the 6-digit code sent to your phone. The code expires in 10 minutes.</p>
                <div className="flex gap-2">
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="6-digit verification code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" className="min-w-0 flex-1 bg-mall-700 rounded-lg px-3 py-2.5 text-cream placeholder-cream/25 text-sm outline-none focus:ring-1 focus:ring-mall-accent" />
                  <button type="button" onClick={handleVerifySms} disabled={verifying || otp.length !== 6} className={`${buttonClass} bg-mall-accent text-mall-900`}>{verifying ? "Verifying..." : "Verify"}</button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button type="button" onClick={handleSendCode} disabled={sending || verifying} className="text-mall-accent hover:underline disabled:opacity-50">{sending ? "Sending code..." : "Resend code"}</button>
                  <button type="button" onClick={changePhoneNumber} disabled={sending || verifying} className="text-cream/45 hover:text-cream/75 disabled:opacity-50">Change number</button>
                </div>
              </div>
            )}

            {whatsappLink && channel === "whatsapp" && (
              <div className="mt-3">
                <p className="text-cream/50 text-xs mb-2">Send the prefilled message from the phone number you are verifying. We will confirm when it arrives.</p>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className={`${buttonClass} w-full bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366] hover:text-white`}>
                  Open WhatsApp and send code <ExternalLink size={13} />
                </a>
                {polling && <div role="status" className="flex items-center justify-center gap-2 text-cream/45 text-xs mt-3"><div className="w-3 h-3 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />Waiting for WhatsApp confirmation...</div>}
                <button type="button" onClick={() => chooseChannel("whatsapp")} className="flex items-center gap-1 text-cream/35 hover:text-cream/60 text-xs mt-3"><RefreshCw size={11} /> Use another number</button>
              </div>
            )}

            {phoneMsg && <p role="status" className="text-emerald-300/80 text-xs mt-3">{phoneMsg}</p>}
            {phoneError && <p role="alert" className="text-red-400 text-xs mt-3">{phoneError}</p>}
            {!anyPhoneChannel && <p role="status" className="text-cream/45 text-xs mt-3">SMS and WhatsApp verification are not configured yet. Add the provider credentials to enable verification.</p>}
          </>
        ))}
      </section>
    </div>
  );
}
