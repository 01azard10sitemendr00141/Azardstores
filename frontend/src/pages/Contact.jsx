import { useState } from "react";
import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, MessageCircle, Send, CheckCircle2 } from "lucide-react";
import api from "../api/client";
import { useSettings } from "../context/SettingsContext";
import { formatPhoneDisplay } from "../utils/formatPhone";

export default function Contact() {
  const { settings } = useSettings();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      await api.post("/contact", {
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setStatus("sent");
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.response?.data?.message || "Something went wrong — please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-mall-900 px-4 sm:px-6 py-16 sm:py-24">
      <div className="max-w-4xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-12 sm:mb-16">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
            Azard Stores
          </p>
          <h1 className="font-display text-3xl sm:text-5xl text-cream mb-4 leading-tight">
            Get in touch
          </h1>
          <p className="text-cream/50 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
            Questions, order issues, or just want to say hi — we're happy to help.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 sm:gap-8">
          {/* Contact info */}
          <div className="md:col-span-2 space-y-4">
            <a
              href={`https://wa.me/${settings.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 bg-mall-800/60 border border-cream/10 rounded-2xl p-5 hover:border-mall-accent/30 transition"
            >
              <div className="w-10 h-10 rounded-xl bg-mall-accent/10 flex items-center justify-center shrink-0">
                <Phone size={16} className="text-mall-accent" />
              </div>
              <div>
                <p className="text-cream text-sm font-medium">{formatPhoneDisplay(settings.whatsappNumber)}</p>
                <p className="text-cream/40 text-xs mt-0.5">WhatsApp & Calls</p>
              </div>
            </a>

            <a
              href={`mailto:${settings.contactEmail}`}
              className="flex items-start gap-3 bg-mall-800/60 border border-cream/10 rounded-2xl p-5 hover:border-mall-accent/30 transition"
            >
              <div className="w-10 h-10 rounded-xl bg-mall-accent/10 flex items-center justify-center shrink-0">
                <Mail size={16} className="text-mall-accent" />
              </div>
              <div>
                <p className="text-cream text-sm font-medium">{settings.contactEmail}</p>
                <p className="text-cream/40 text-xs mt-0.5">Email support</p>
              </div>
            </a>

            <div className="flex items-start gap-3 bg-mall-800/60 border border-cream/10 rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-mall-accent/10 flex items-center justify-center shrink-0">
                <MapPin size={16} className="text-mall-accent" />
              </div>
              <div>
                <p className="text-cream text-sm font-medium">Nairobi, Kenya</p>
                <p className="text-cream/40 text-xs mt-0.5">Online storefront based in Kenya</p>
              </div>
            </div>

            <a
              href={`https://wa.me/${settings.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-sm font-medium px-4 py-3 rounded-2xl hover:bg-[#25D366]/20 transition"
            >
              <MessageCircle size={16} />
              Chat with us on WhatsApp
            </a>
          </div>

          {/* Form */}
          <div className="md:col-span-3">
            <form
              onSubmit={handleSubmit}
              aria-busy={status === "sending"}
              className="bg-mall-800/60 border border-cream/10 rounded-2xl p-5 sm:p-7 space-y-4"
            >
              {status === "sent" ? (
                <div className="flex flex-col items-center text-center gap-3 py-10">
                  <div className="w-14 h-14 rounded-full bg-mall-accent/10 flex items-center justify-center">
                    <CheckCircle2 size={26} className="text-mall-accent" />
                  </div>
                  <h3 className="font-display text-cream text-xl">Message sent</h3>
                  <p className="text-cream/50 text-sm max-w-xs">
                    Thanks for reaching out — we'll get back to you shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="text-mall-accent text-sm font-medium hover:text-mall-accentDark transition mt-2"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contact-name" className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest block mb-1.5">
                        Name
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        maxLength={100}
                        className="w-full bg-mall-900 text-cream placeholder-cream/30 text-sm px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-mall-accent border border-cream/10 focus:border-mall-accent transition"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-email" className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest block mb-1.5">
                        Email
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                        maxLength={254}
                        className="w-full bg-mall-900 text-cream placeholder-cream/30 text-sm px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-mall-accent border border-cream/10 focus:border-mall-accent transition"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-subject" className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest block mb-1.5">
                      Subject
                    </label>
                    <input
                      id="contact-subject"
                      type="text"
                      name="subject"
                      value={form.subject}
                      onChange={handleChange}
                      maxLength={120}
                      className="w-full bg-mall-900 text-cream placeholder-cream/30 text-sm px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-mall-accent border border-cream/10 focus:border-mall-accent transition"
                      placeholder="What's this about?"
                    />
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="font-mono-tag text-[10px] uppercase text-cream/40 tracking-widest block mb-1.5">
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      required
                      maxLength={5000}
                      rows={5}
                      className="w-full bg-mall-900 text-cream placeholder-cream/30 text-sm px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-mall-accent border border-cream/10 focus:border-mall-accent transition resize-none"
                      placeholder="Tell us what's going on..."
                    />
                  </div>

                  {status === "error" && (
                    <p role="alert" className="text-red-400 text-xs">{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="w-full flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold text-sm px-5 py-3 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === "sending" ? "Sending..." : "Send Message"}
                    {status !== "sending" && <Send size={14} />}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>

        {/* FAQ nudge */}
        <p className="text-center text-cream/40 text-xs mt-10">
          Looking for a quick answer instead?{" "}
          <Link to="/faq" className="text-mall-accent hover:text-mall-accentDark transition">
            Check the FAQ
          </Link>
        </p>
      </div>
    </div>
  );
}
