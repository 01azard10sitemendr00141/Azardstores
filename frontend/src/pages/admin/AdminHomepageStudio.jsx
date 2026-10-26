import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight, ArrowRight, CheckCircle2, Clock3, ExternalLink, Image,
  Layers3, LayoutPanelTop, RefreshCw, Sparkles, Store,
} from "lucide-react";
import api from "../../api/client";

const EDITORS = [
  {
    to: "/admin/hero",
    number: "01",
    title: "Top banner & campaigns",
    description: "Set the banner shoppers see first—its image, message and button, plus which campaign is live, when it runs and its order.",
    icon: Image,
    detail: "Opening message",
    tone: "accent",
  },
  {
    to: "/admin/home-sections",
    number: "02",
    title: "Homepage product rows",
    description: "Choose the badge, shop and category rows shoppers can browse, then set their headings and order.",
    icon: Layers3,
    detail: "What shoppers browse",
    tone: "orange",
  },
  {
    to: "/admin/home-content",
    number: "03",
    title: "Page details",
    description: "Set the fallback opening message, section labels and backgrounds, purpose tiles and closing panel.",
    icon: LayoutPanelTop,
    detail: "Supporting content",
    tone: "cream",
  },
];

function readableDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function HeroArtwork({ slide, fallback, previewUnavailable }) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const mediaUrl = slide?.mediaUrl;
  const posterUrl = slide?.posterUrl;
  const showMedia = Boolean(mediaUrl) && !mediaFailed;

  return (
    <div className="relative isolate flex min-h-[290px] overflow-hidden rounded-2xl border border-cream/10 bg-[#101a2a] sm:min-h-[360px]">
      {showMedia && slide.mediaType === "video" ? (
        <video
          src={mediaUrl}
          poster={posterUrl || undefined}
          muted
          loop
          autoPlay
          playsInline
          onError={() => setMediaFailed(true)}
          aria-hidden="true"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
      ) : showMedia ? (
        <img
          src={mediaUrl}
          alt={slide.altText || ""}
          onError={() => setMediaFailed(true)}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
      ) : posterUrl && !mediaFailed ? (
        <img
          src={posterUrl}
          alt=""
          onError={() => setMediaFailed(true)}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_80%_15%,rgba(201,161,94,0.2),transparent_35%),linear-gradient(130deg,#1b2b40,#101a2a_62%)]">
          <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full border border-cream/10" />
          <div className="absolute -right-2 -top-6 h-44 w-44 rounded-full border border-cream/10" />
        </div>
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-mall-900/95 via-mall-900/75 to-mall-900/20" />
      <div className="flex w-full flex-col justify-between gap-8 p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-cream/15 bg-mall-900/55 px-3 py-1.5 font-mono-tag text-[10px] uppercase tracking-[0.16em] text-cream/75">
            <span className="h-1.5 w-1.5 rounded-full bg-mall-accent" />
            Storefront preview
          </span>
          {previewUnavailable ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-mall-orange/25 bg-mall-900/55 px-3 py-1.5 text-[11px] font-medium text-mall-orange">
              <Clock3 size={13} /> Campaign status unavailable
            </span>
          ) : slide ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-950/50 px-3 py-1.5 text-[11px] font-medium text-emerald-200">
              <CheckCircle2 size={13} /> Live now
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-mall-orange/25 bg-mall-900/55 px-3 py-1.5 text-[11px] font-medium text-mall-orange">
              <Sparkles size={13} /> Fallback content
            </span>
          )}
        </div>

        <div className="max-w-xl">
          {mediaFailed && (
            <p className="mb-3 text-xs text-cream/60">Campaign media could not be displayed; copy is shown instead.</p>
          )}
          <p className="mb-3 font-mono-tag text-[10px] uppercase tracking-[0.18em] text-mall-orange">
            {previewUnavailable ? "Campaign preview could not be confirmed" : slide ? "Current homepage campaign" : "Shown when no campaign is live"}
          </p>
          <h2 className="font-display text-3xl leading-tight text-cream sm:text-4xl">
            {slide?.headline || fallback.headline}
          </h2>
          {(slide?.supportingText || fallback.supportingText) && (
            <p className="mt-3 max-w-lg text-sm leading-6 text-cream/70 sm:text-base">
              {slide?.supportingText || fallback.supportingText}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              to={slide?.destination || fallback.destination || "/directory"}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-mall-accent px-4 py-2.5 text-sm font-semibold text-mall-900 transition hover:bg-mall-accentDark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mall-accent"
            >
              {slide?.ctaLabel || fallback.ctaLabel}
              <ArrowRight size={15} />
            </Link>
            {slide && (slide.startsAt || slide.endsAt) && (
              <span className="inline-flex items-center gap-1.5 text-xs text-cream/65">
                <Clock3 size={13} />
                {slide.endsAt ? `Live until ${readableDate(slide.endsAt)} EAT` : "No end date set"}
              </span>
            )}
          </div>
        </div>
        {mediaFailed && slide?.mediaUrl && (
          <div className="sr-only" role="status">Campaign media failed to load.</div>
        )}
      </div>
      {!mediaUrl && !slide && (
        <div className="absolute bottom-5 right-5 hidden text-cream/20 sm:block" aria-hidden="true">
          <Store size={70} strokeWidth={0.8} />
        </div>
      )}
    </div>
  );
}

function EditorCard({ editor, status }) {
  const Icon = editor.icon;
  const colors = {
    accent: "border-mall-accent/30 group-hover:border-mall-accent/60 text-mall-accent bg-mall-accent/10",
    orange: "border-mall-orange/25 group-hover:border-mall-orange/50 text-mall-orange bg-mall-orange/10",
    cream: "border-cream/15 group-hover:border-cream/30 text-cream/75 bg-cream/5",
  };
  return (
    <Link
      to={editor.to}
      className="group flex min-h-[230px] flex-col rounded-2xl border border-cream/10 bg-mall-800/45 p-5 transition duration-200 hover:-translate-y-0.5 hover:bg-mall-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mall-accent sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${colors[editor.tone]}`}>
          <Icon size={20} strokeWidth={1.7} />
        </span>
        <span className="font-mono-tag text-[10px] tracking-[0.16em] text-cream/30">{editor.number} / 03</span>
      </div>
      <p className="mt-6 font-mono-tag text-[10px] uppercase tracking-[0.16em] text-mall-orange">{editor.detail}</p>
      <h3 className="mt-1 font-display text-xl text-cream">{editor.title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-cream/55">{editor.description}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
        <span className="text-xs text-cream/45">{status}</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-cream/75 transition group-hover:text-mall-accent">
          Open editor <ArrowDownRight size={15} />
        </span>
      </div>
    </Link>
  );
}

export default function AdminHomepageStudio() {
  const [data, setData] = useState({ slides: null, allSlides: null, content: null, sections: null });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErrors({});
    const requests = [
      ["slides", "/hero-slides"],
      ["allSlides", "/hero-slides/admin/list"],
      ["content", "/homepage-content"],
      ["sections", "/home-sections"],
    ];
    const results = await Promise.allSettled(requests.map(([, path]) => api.get(path)));
    const nextData = { slides: null, allSlides: null, content: null, sections: null };
    const nextErrors = {};
    results.forEach((result, index) => {
      const [key] = requests[index];
      if (result.status === "rejected") {
        nextErrors[key] = true;
      } else {
        const value = result.value.data;
        if ((key === "slides" || key === "allSlides" || key === "sections") && !Array.isArray(value)) {
          nextErrors[key] = true;
        } else if (key === "content" && value !== null && (typeof value !== "object" || Array.isArray(value))) {
          nextErrors[key] = true;
        } else {
          nextData[key] = value;
        }
      }
    });
    setData(nextData);
    setErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, attempt]);

  const slide = data.slides?.[0] || null;
  const content = data.content || {};
  const fallback = {
    headline: content.fallbackHeroHeadline || "Welcome to Azard Stores.",
    supportingText: content.fallbackHeroSupportingText || "Explore products and shops across the mall.",
    ctaLabel: content.fallbackHeroCtaLabel || "Explore the mall",
    destination: content.fallbackHeroDestination || "/directory",
  };
  const liveCount = data.slides?.length;
  const scheduledCount = data.allSlides?.filter((item) => {
    const startsAt = item.startsAt ? new Date(item.startsAt).getTime() : null;
    const endsAt = item.endsAt ? new Date(item.endsAt).getTime() : null;
    return item.isActive && startsAt && startsAt > Date.now() && (!endsAt || endsAt > startsAt);
  }).length;
  const sectionCount = data.sections?.length;
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="border-b border-cream/10 pb-6 sm:pb-8">
        <p className="mb-3 inline-flex items-center gap-2 font-mono-tag text-[10px] uppercase tracking-[0.2em] text-mall-orange">
          <span className="h-px w-6 bg-mall-orange/60" /> Storefront / Homepage
        </p>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-display text-3xl text-cream sm:text-4xl">Homepage Studio</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cream/55 sm:text-base">
              Choose what to refresh: the top banner, the product rows shoppers browse, or the details below them.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-lg border border-cream/15 px-4 py-2.5 text-sm text-cream/75 transition hover:border-mall-accent/50 hover:text-mall-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mall-accent"
          >
            View live storefront <ExternalLink size={14} />
          </Link>
        </div>
      </header>

      <section aria-labelledby="preview-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono-tag text-[10px] uppercase tracking-[0.18em] text-cream/35">A view from the storefront</p>
            <h2 id="preview-title" className="mt-1 font-display text-xl text-cream">What visitors see first</h2>
          </div>
          {!loading && slide?.mediaType && (
            <span className="font-mono-tag text-[10px] uppercase tracking-[0.12em] text-cream/40">
              {slide.mediaType} campaign
            </span>
          )}
        </div>

        {hasErrors && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-mall-orange/25 bg-mall-orange/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-cream">Some homepage data could not be loaded.</p>
              <p className="mt-1 text-xs leading-5 text-cream/55">
                The preview may be incomplete. Editor links remain available; retry to refresh the data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border border-cream/15 px-4 py-2 text-sm font-medium text-cream/75 transition hover:border-mall-accent/50 hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mall-accent"
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[290px] items-center justify-center rounded-2xl border border-cream/10 bg-mall-800/35 text-sm text-cream/45 sm:min-h-[360px]" role="status">
            <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-mall-accent/30 border-t-mall-accent" />
            Loading the current homepage preview…
          </div>
        ) : (
          <HeroArtwork slide={slide} fallback={fallback} previewUnavailable={errors.slides} />
        )}
      </section>

      <section aria-labelledby="editors-title">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono-tag text-[10px] uppercase tracking-[0.18em] text-cream/35">Pick up where you need</p>
            <h2 id="editors-title" className="mt-1 font-display text-2xl text-cream">Three ways to shape the page</h2>
          </div>
          <p className="max-w-sm text-xs leading-5 text-cream/40">Each editor handles one part of the same storefront homepage.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <EditorCard
            editor={EDITORS[0]}
            status={errors.allSlides || errors.slides ? "Campaign status unavailable" : loading ? "Checking campaign status…" : `${liveCount} currently live · ${scheduledCount} scheduled`}
          />
          <EditorCard
            editor={EDITORS[1]}
            status={errors.sections ? "Section count unavailable" : loading ? "Loading sections…" : `${sectionCount} configured ${sectionCount === 1 ? "section" : "sections"}`}
          />
          <EditorCard
            editor={EDITORS[2]}
            status={errors.content ? "Content status unavailable" : loading ? "Loading content…" : "Fallback copy, labels & tiles"}
          />
        </div>
      </section>

      {!loading && !hasErrors && !slide && !data.content && (
        <p role="status" className="text-xs text-cream/40">No saved homepage content is available yet. The preview uses the same default copy as the storefront.</p>
      )}
    </div>
  );
}
