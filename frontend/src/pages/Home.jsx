import { useEffect, useState, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Zap, Star, Shirt, Cpu, Sparkles,
  ShoppingBasket, Sofa, Dumbbell, Blocks, Gem,
  BookOpen, Wrench, ChevronLeft, Flame, Package, Home as HomeIcon,
  TrendingUp, Lock, Store, Target,
  Briefcase, Gamepad2, Plane, Activity,
  Award, Heart, Tag, Gift, Crown, ThumbsUp, ShoppingBag,
  MapPin, Truck, Clock3,
} from "lucide-react";
import api from "../api/client";
import StripProductCard from "../components/StripProductCard";
import { getHomeCache, isHomeCacheFresh, setHomeCache } from "../utils/homeCache";
import { normalizeHomepageContent } from "../utils/homepageContent";
import { organizeHomepageSections } from "../utils/homepageProducts";
import { productImageUrl } from "../utils/productImageUrl";
import {
  readRecentlyViewed,
  RECENTLY_VIEWED_EVENT,
} from "../utils/recentlyViewed";
import { useSettings } from "../context/SettingsContext";

// Matches the icon whitelist admins pick from in AdminBadges.jsx — a badge's
// saved icon name resolves here to the actual component. Falls back to Tag
// for anything unrecognized (e.g. an option removed after being saved).
const BADGE_ICON_BY_NAME = {
  Star, Flame, Gem, Lock, Package, TrendingUp, Sparkles, Zap,
  Award, Heart, Tag, Gift, Crown, ThumbsUp, ShoppingBag,
};
const SECTION_PADDING = "px-4 sm:px-6";
const HOME_REQUEST_TIMEOUT_MS = 15_000;

// ─── Zone video background ────────────────────────────────────────────────────
// NOTE: `src` should point at a self-hosted, full-resolution (720p/1080p) mp4.
// Don't hotlink assets.mixkit.co "-360" files — those are Mixkit's low-res
// hover-preview thumbnails, not the real clips, which is why they look
// blurry and play back looking sped up. Download the real file from the
// clip's page on mixkit.co and host it yourself.
function ZoneBg({ src, type = "video", poster, overlay = "bg-mall-900/60", alt = "", mobileSrc = "", mediumSrc = "", deferMedia = false }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [mediaReady, setMediaReady] = useState(!deferMedia);
  const mediaFitClass = "object-cover";

  useEffect(() => {
    if (!deferMedia) {
      setMediaReady(true);
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    if (!("IntersectionObserver" in window)) {
      setMediaReady(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setMediaReady(true);
        observer.disconnect();
      }
    }, { rootMargin: "0px 0px 120px 0px" });
    observer.observe(container);
    return () => observer.disconnect();
  }, [deferMedia]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener?.("change", update);
    return () => preference.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    setMediaFailed(false);
    const video = videoRef.current;
    if (!video || type !== "video" || !mediaReady) return;
    video.playbackRate = 1;
    if (reducedMotion) video.pause();
    else video.play().catch(() => {});
  }, [src, type, reducedMotion, mediaReady]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 overflow-hidden">
      {mediaReady && type === "image" ? (
        src && !mediaFailed && (
          (mobileSrc || mediumSrc) ? (
            <picture className="absolute inset-0 h-full w-full">
              {mediumSrc && <source media="(min-width: 640px) and (max-width: 1023px)" srcSet={mediumSrc} />}
              {mobileSrc && <source media="(max-width: 639px)" srcSet={mobileSrc} />}
              <img src={src} alt={alt} loading={deferMedia ? "lazy" : "eager"} fetchPriority={deferMedia ? "low" : "high"} decoding="async" onError={() => setMediaFailed(true)} className={`h-full w-full ${mediaFitClass}`} />
            </picture>
          ) : (
            <picture className="absolute inset-0 h-full w-full">
              <img src={src} alt={alt} loading={deferMedia ? "lazy" : "eager"} fetchPriority={deferMedia ? "low" : "high"} decoding="async" onError={() => setMediaFailed(true)} className={`h-full w-full ${mediaFitClass}`} />
            </picture>
          )
        )
      ) : mediaReady ? (
        <>
          {poster && <img src={poster} alt="" loading={deferMedia ? "lazy" : "eager"} fetchPriority={deferMedia ? "low" : "high"} decoding="async" onError={(e) => e.currentTarget.remove()} className={`absolute inset-0 w-full h-full ${mediaFitClass}`} />}
          {src && !mediaFailed && <video ref={videoRef} autoPlay={!reducedMotion} muted loop playsInline preload={reducedMotion ? "none" : "metadata"} onError={() => setMediaFailed(true)} className={`absolute inset-0 w-full h-full ${mediaFitClass}`}>
            <source src={src} type="video/mp4" />
          </video>}
        </>
      ) : null}
      <div className={`absolute inset-0 ${overlay}`} />
    </div>
  );
}

// ─── Still-photo accent background ─────────────────────────────────────────────
// ─── Floor icons ──────────────────────────────────────────────────────────────
const FLOOR_ICONS = {
  1: Shirt, 2: Cpu, 3: Sparkles, 4: ShoppingBasket,
  5: Sofa, 6: Dumbbell, 7: Blocks, 8: Gem, 9: BookOpen, 10: Wrench,
};

// ─── Product strip ────────────────────────────────────────────────────────────
function ProductStrip({ products, cardSize, priorityCount = 0, loading = false }) {
  const ref = useRef(null);
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * (cardSize === "large" ? 280 : 200), behavior: "smooth" });
  if (!products.length && !loading) return null;
  return (
    <div className="relative -mx-4 sm:mx-0">
      <button onClick={() => scroll(-1)} aria-label="Scroll left"
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-9 h-9 rounded-full bg-mall-900/80 text-cream border border-cream/10 shadow-lg items-center justify-center hover:bg-mall-900 transition">
        <ChevronLeft size={18} />
      </button>
      <div ref={ref} className={`flex ${cardSize === "large" ? "gap-3.5 sm:gap-4" : "gap-2.5 sm:gap-3"} overflow-x-auto px-4 sm:px-0 pb-3`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
        {products.map((p, index) => <StripProductCard key={p._id} product={p} size={cardSize} priority={index < priorityCount} />)}
        {loading && Array.from({ length: 4 }, (_, index) => (
          <div key={`loading-${index}`} aria-hidden="true" className={`shrink-0 animate-pulse overflow-hidden rounded-xl bg-mall-800 ${cardSize === "large" ? "w-[76vw] max-w-[19rem] sm:w-64 md:w-72" : "w-36 sm:w-40 md:w-44"}`}>
            <div className="aspect-square bg-cream/5" />
            <div className="space-y-2 p-3"><div className="h-3 w-4/5 rounded bg-cream/10" /><div className="h-3 w-2/5 rounded bg-cream/10" /></div>
          </div>
        ))}
        <div className="shrink-0 w-2 sm:hidden" />
      </div>
      <button onClick={() => scroll(1)} aria-label="Scroll right"
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-9 h-9 rounded-full bg-mall-900/80 text-cream border border-cream/10 shadow-lg items-center justify-center hover:bg-mall-900 transition">
        <ChevronLeft size={18} className="rotate-180" />
      </button>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHeading({ icon: Icon, label, tag, linkTo, linkLabel = "See all" }) {
  return (
    <div className="flex items-center justify-between mb-4 sm:mb-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Icon size={16} className="text-mall-accent shrink-0" />
        <h2 className="font-display text-lg sm:text-xl md:text-2xl text-cream">{label}</h2>
        {tag && <span className="font-mono-tag text-[9px] uppercase bg-mall-orange/20 text-mall-orange px-2 py-0.5 rounded-full">{tag}</span>}
      </div>
      {linkTo && (
        <Link to={linkTo} className="flex items-center gap-1 text-xs text-cream/50 hover:text-mall-accent transition shrink-0 ml-2">
          {linkLabel} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

// ─── Homepage section ───────────────────────────────────────────────────────
// One of these renders per entry in AdminHomeSections.jsx, in admin-set
// order — replaces what used to be 6 hand-written badge sections plus a
// separately hardcoded Featured Shop. `section.products` is attached by
// the fetch effect below; everything else comes straight from the backend.
function HomeSectionBlock({ section, homepageContent }) {
  if (section.type === "featured-shop") {
    return (
      <section className="py-6 sm:py-8 relative z-10">
        <div className={SECTION_PADDING}>
          <SectionHeading
            icon={Store}
            label={section.heading || "Featured Shop"}
            tag={section.tag || "Spotlight"}
            linkTo={section.shop ? `/shop/${section.shop.slug}` : undefined}
            linkLabel={homepageContent.featuredShopLinkLabel}
          />
          <FeaturedShop shop={section.shop} products={section.products} productsLoading={section.productsLoading} />
        </div>
      </section>
    );
  }

  if (section.type === "featured-category") {
    return (
      <section className="py-6 sm:py-8 relative z-10">
        <div className={SECTION_PADDING}>
          <SectionHeading
            icon={Tag}
            label={section.heading || `Featured: ${section.category}`}
            tag={section.tag}
            linkTo={`/categories/${encodeURIComponent(section.category)}`}
            linkLabel={homepageContent.sectionLinkLabel}
          />
        </div>
        <div className={SECTION_PADDING}><ProductStrip products={section.products} cardSize="large" loading={section.productsLoading} /></div>
      </section>
    );
  }

  // type === "badge"
  const Icon = BADGE_ICON_BY_NAME[section.badge?.icon] || Tag;
  return (
    <section className="py-6 sm:py-8 relative z-10">
      <div className={SECTION_PADDING}>
        <SectionHeading
          icon={Icon}
          label={section.heading || section.badge?.sectionHeading}
          tag={section.tag || section.badge?.sectionTag}
            linkTo={section.badge ? `/search?badge=${section.badge.slug}` : undefined}
            linkLabel={homepageContent.sectionLinkLabel}
        />
      </div>
      <div className={SECTION_PADDING}><ProductStrip products={section.products} cardSize="large" loading={section.productsLoading} /></div>
    </section>
  );
}

function RecentlyViewedSection({ products }) {
  if (!products.length) return null;
  return (
    <section aria-labelledby="recently-viewed-heading" className="border-y border-cream/5 bg-mall-800/35 py-7 sm:py-9">
      <div className={SECTION_PADDING}>
        <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
          <div className="min-w-0">
            <p className="mb-1 font-mono-tag text-[9px] uppercase tracking-[0.2em] text-mall-orange">Pick up where you left off</p>
            <h2 id="recently-viewed-heading" className="font-display text-xl text-cream sm:text-2xl">Recently viewed</h2>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 text-xs text-cream/45 sm:flex">
            <Clock3 size={14} aria-hidden="true" /> Saved on this device
          </span>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {products.map((product) => (
            <Link
              key={product.slug}
              to={`/product/${encodeURIComponent(product.slug)}`}
              aria-label={`View ${product.name}`}
              className="group flex min-h-[88px] w-[min(76vw,280px)] shrink-0 items-center gap-3 rounded-xl border border-cream/10 bg-mall-900/70 p-2.5 transition hover:border-mall-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent sm:w-[280px]"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-mall-800">
                <ProductThumbnail image={product.image} width={160} quality={68} />
              </div>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm font-medium leading-snug text-cream">{product.name}</span>
                <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-mall-accent">
                  View product <ArrowRight size={12} aria-hidden="true" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductThumbnail({ image, width, quality, alt = "", className = "h-full w-full object-cover" }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [image]);

  if (!image || imageFailed) {
    return (
      <span className="flex h-full w-full items-center justify-center" aria-hidden="true">
        <Package size={22} className="text-cream/30" />
      </span>
    );
  }

  return (
    <img
      src={productImageUrl(image, { width, quality })}
      alt={alt}
      width={width}
      height={width}
      loading="lazy"
      decoding="async"
      onError={() => setImageFailed(true)}
      className={className}
    />
  );
}

// ─── Floor card ───────────────────────────────────────────────────────────────
function FloorCard({ floor }) {
  const Icon = FLOOR_ICONS[floor.floorNumber] || Cpu;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [floor.image]);
  const hasImage = Boolean(floor.image && !imageFailed);
  return (
    <Link to={`/floor/${floor.slug}`}
      className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border border-cream/10 bg-mall-800/80 transition hover:border-mall-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent focus-visible:ring-offset-2 focus-visible:ring-offset-mall-900">
      {hasImage ? (
        <img src={floor.image} alt="" loading="lazy" decoding="async" sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-mall-800 to-mall-700">
          <Icon size={34} strokeWidth={1.2} className="text-cream/15" aria-hidden="true" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/5" />
      <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-mall-900/70 text-mall-accent">
            <Icon size={11} aria-hidden="true" />
          </span>
          <span className="font-mono-tag text-[9px] uppercase tracking-widest text-mall-orange">Floor {floor.floorNumber}</span>
        </div>
        <h3 className="line-clamp-1 font-display text-sm leading-tight text-cream sm:text-base">{floor.name}</h3>
        <p className="mt-0.5 font-mono-tag text-[10px] text-cream/70">{floor.shopCount} {floor.shopCount === 1 ? "shop" : "shops"} open</p>
      </div>
      <div aria-hidden="true" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-cream/80 transition group-hover:bg-mall-accent group-hover:text-mall-900">
        <ArrowRight size={12} />
      </div>
    </Link>
  );
}

function FloorShowcase({ floors, shopsByFloor }) {
  const activeFloors = floors.map((f) => ({ ...f, shopCount: (shopsByFloor[f._id] || []).filter((shop) => shop.status !== "closed").length })).filter((f) => f.shopCount > 0);
  if (activeFloors.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-5">
      {activeFloors.map((floor) => <FloorCard key={floor._id} floor={floor} />)}
    </div>
  );
}

// ─── Purpose tiles ────────────────────────────────────────────────────────────
const PURPOSES = [
  { purposeTag: "work", label: "Work", tagline: "Tools for your workday", icon: "Briefcase", color: "#0096D6", active: true },
  { purposeTag: "gaming", label: "Gaming", tagline: "Gear up and play", icon: "Gamepad2", color: "#FF6900", active: true },
  { purposeTag: "travel", label: "Travel", tagline: "Ready for the journey", icon: "Plane", color: "#00C853", active: true },
  { purposeTag: "home", label: "Home", tagline: "Make home feel right", icon: "House", color: "#E8A33D", active: true },
  { purposeTag: "fitness", label: "Fitness", tagline: "Move with confidence", icon: "Dumbbell", color: "#CC0000", active: true },
];
const PURPOSE_ICONS = { Briefcase, Gamepad2, Plane, House: HomeIcon, Dumbbell, Shirt, Cpu, Sparkles, ShoppingBag, BookOpen, Activity, Heart };

const HOME_CONTENT_FALLBACK = {
  flashSaleHeading: "Flash Sale", flashSaleTag: "Limited time",
  purposeHeading: "Shop by Purpose", purposeTagline: "Find what fits your life",
  exploreHeading: "Explore the Mall", exploreLinkLabel: "Full directory",
  featuredShopBackdropUrl: "https://images.pexels.com/photos/27677152/pexels-photo-27677152.jpeg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920",
  exploreBackdropUrl: "https://images.pexels.com/photos/32340449/pexels-photo-32340449.jpeg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920",
  closingEyebrow: "Azard Stores", closingHeadline: "Discover more.", closingAccent: "Shop it all.",
  closingPrimaryLabel: "Enter the Mall", closingPrimaryDestination: "/directory",
  closingSecondaryLabel: "Chat on WhatsApp", closingSecondaryDestination: "whatsapp",
  closingFooterLine: "The Whole Mall. One Cart. Zero Hassle.",
  closingMediaType: "video",
  closingMediaUrl: "https://videos.pexels.com/video-files/3243946/3243946-uhd_2560_1440_30fps.mp4",
  closingPosterUrl: "https://images.pexels.com/videos/3243946/free-video-3243946.jpg?auto=compress&cs=tinysrgb&h=1080&fit=crop&w=1920",
  purposeTiles: PURPOSES,
};

function PurposeTile({ purpose }) {
  const Icon = PURPOSE_ICONS[purpose.icon] || Tag;
  return (
    <Link to={`/search?purpose=${encodeURIComponent(purpose.purposeTag)}`}
      style={{ background: `linear-gradient(180deg, ${purpose.color}24, rgba(12, 19, 32, .94))` }}
      className="group relative rounded-xl overflow-hidden border border-cream/10 hover:border-mall-accent transition p-4 sm:p-5 flex flex-col gap-3 min-h-[100px] sm:min-h-[120px] backdrop-blur-sm">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${purpose.color}20` }}>
        <Icon size={16} style={{ color: purpose.color }} />
      </div>
      <div>
        <p className="font-display text-cream text-sm sm:text-base">{purpose.label}</p>
        <p className="text-cream/50 text-[10px] font-mono-tag tracking-wide mt-0.5">{purpose.tagline}</p>
      </div>
      <ArrowRight size={12} className="text-cream/0 group-hover:text-mall-accent transition absolute bottom-3 right-3" />
    </Link>
  );
}

// ─── Featured shop ────────────────────────────────────────────────────────────
function FeaturedShop({ shop, products = [], productsLoading = false }) {
  const productsRailRef = useRef(null);
  const [productsRailState, setProductsRailState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });
  useEffect(() => {
    const rail = productsRailRef.current;
    if (!rail) return undefined;

    const updateScrollState = () => {
      const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
      const nextState = {
        hasOverflow: maxScrollLeft > 1,
        canScrollLeft: rail.scrollLeft > 1,
        canScrollRight: rail.scrollLeft < maxScrollLeft - 1,
      };
      setProductsRailState((current) => (
        current.hasOverflow === nextState.hasOverflow
          && current.canScrollLeft === nextState.canScrollLeft
          && current.canScrollRight === nextState.canScrollRight
          ? current
          : nextState
      ));
    };

    updateScrollState();
    rail.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateScrollState);
    observer?.observe(rail);
    window.addEventListener("resize", updateScrollState);
    return () => {
      rail.removeEventListener("scroll", updateScrollState);
      observer?.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, [products.length, shop?._id]);
  if (!shop) return null;
  const Icon = FLOOR_ICONS[shop.floor?.floorNumber] || Store;
  const scrollProducts = (direction) => {
    productsRailRef.current?.scrollBy({ left: direction * 180, behavior: "smooth" });
  };
  return (
    <article className="overflow-hidden rounded-2xl border border-cream/10 bg-mall-900/80">
      <div className="relative h-24 overflow-hidden bg-mall-700 sm:h-32">
        {shop.banner ? (
          <img src={shop.banner} alt={shop.name} loading="lazy" decoding="async" onError={(e) => e.currentTarget.remove()} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-mall-700 to-mall-900 flex items-center justify-center">
            <Store size={40} className="text-cream/10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-mall-900/80 via-transparent to-transparent" />
        <div className="absolute bottom-2.5 left-4 flex items-center gap-2 font-mono-tag text-[10px] uppercase tracking-wide text-cream/80 sm:bottom-3 sm:left-5">
          <span>Shop #{shop.shopNumber}</span>
          <span aria-hidden="true" className="text-cream/40">/</span>
          <span><Icon size={10} className="mr-1 inline" />Floor {shop.floor?.floorNumber}</span>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="font-display text-lg text-cream sm:text-xl">{shop.name}</h3>
          {shop.description && <p className="mt-1 line-clamp-2 max-w-3xl text-xs leading-relaxed text-cream/65 sm:text-sm">{shop.description}</p>}
        </div>
        {(products.length > 0 || productsLoading) && (
          <div className="relative -mx-4 sm:-mx-5">
            <div
              ref={productsRailRef}
              role="region"
              aria-label={`${shop.name} featured products`}
              tabIndex={0}
              className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:gap-3 sm:px-5 md:px-10"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
            >
              {products.slice(0, 6).map((p) => (
                <Link
                  key={p._id}
                  to={`/product/${p.slug}`}
                  className="group w-24 shrink-0 snap-start overflow-hidden rounded-lg border border-cream/10 bg-mall-800/70 transition-colors hover:border-mall-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent sm:w-28"
                >
                  <div className="aspect-square overflow-hidden bg-mall-700">
                    <ProductThumbnail image={p.images?.[0]} width={160} quality={72} alt={p.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  </div>
                  <p className="break-words px-2 py-2 text-[11px] leading-snug text-cream/80">{p.name}</p>
                </Link>
              ))}
              {productsLoading && Array.from({ length: 4 }, (_, index) => (
                <div key={`loading-${index}`} aria-hidden="true" className="w-24 shrink-0 snap-start animate-pulse overflow-hidden rounded-lg border border-cream/10 bg-mall-800/70 sm:w-28">
                  <div className="aspect-square bg-cream/5" />
                  <div className="space-y-2 p-2"><div className="h-2 w-4/5 rounded bg-cream/10" /><div className="h-2 w-2/5 rounded bg-cream/10" /></div>
                </div>
              ))}
            </div>
            {productsRailState.hasOverflow && (
              <>
                <button
                  type="button"
                  onClick={() => scrollProducts(-1)}
                  aria-label="Scroll featured products left"
                  disabled={!productsRailState.canScrollLeft}
                  className="absolute left-1 top-[40%] z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-cream/10 bg-mall-900/90 text-cream shadow-md transition hover:bg-mall-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent disabled:cursor-not-allowed disabled:opacity-40 md:flex"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollProducts(1)}
                  aria-label="Scroll featured products right"
                  disabled={!productsRailState.canScrollRight}
                  className="absolute right-1 top-[40%] z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-cream/10 bg-mall-900/90 text-cream shadow-md transition hover:bg-mall-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent disabled:cursor-not-allowed disabled:opacity-40 md:flex"
                >
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Hero slideshow ───────────────────────────────────────────────────────────
const HERO_FALLBACK = {
  headline: "Welcome to Azard Stores.",
  supportingText: "Explore products and shops across the mall.",
  ctaLabel: "Explore the mall",
  destination: "/directory",
  mediaType: "image",
  mediaUrl: "",
  posterUrl: "",
};

function getHeroFallback(content) {
  return {
    ...HERO_FALLBACK,
    headline: content.fallbackHeroHeadline || HERO_FALLBACK.headline,
    supportingText: content.fallbackHeroSupportingText || HERO_FALLBACK.supportingText,
    ctaLabel: content.fallbackHeroCtaLabel || HERO_FALLBACK.ctaLabel,
    destination: content.fallbackHeroDestination || HERO_FALLBACK.destination,
  };
}

function HeroSlideshow({ heroSlides, fallbackSlide, onSlideChange, containerRef }) {
  const slides = useMemo(() => heroSlides.length ? heroSlides : [fallbackSlide || HERO_FALLBACK], [heroSlides, fallbackSlide]);
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef(null);
  const touchStartRef = useRef(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener?.("change", update);
    return () => preference.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    setIndex((current) => current % slides.length);
  }, [slides.length]);
  useEffect(() => {
    onSlideChange?.(slides[index] || slides[0]);
  }, [index, slides, onSlideChange]);
  useEffect(() => {
    if (slides.length <= 1 || reducedMotion) return;
    const duration = Math.min(12000, Math.max(6000, 6200 + String(slides[index]?.headline || "").length * 70));
    timerRef.current = setTimeout(() => setIndex((i) => (i + 1) % slides.length), duration);
    return () => clearTimeout(timerRef.current);
  }, [index, slides.length, reducedMotion]);
  useEffect(() => {
    const container = containerRef?.current;
    if (!container || slides.length <= 1) return;

    const handleTouchStart = (event) => {
      if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [role='button']")) {
        touchStartRef.current = null;
        return;
      }
      const touch = event.changedTouches[0];
      touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const handleTouchEnd = (event) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
      setIndex((current) => (current + (deltaX < 0 ? 1 : slides.length - 1)) % slides.length);
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [containerRef, slides.length]);

  const slide = slides[index] || slides[0];
  const showCampaignCopy = slide.mediaType === "video" || !slide.mediaUrl;

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-8 z-10 sm:inset-x-6 sm:bottom-8">
      <div className="flex items-end justify-between gap-4">
        {showCampaignCopy ? (
          <div key={index} className="hero-copy-enter pointer-events-auto w-[72%] max-w-2xl -translate-y-8 sm:translate-y-0">
            <h1 className="font-display text-[clamp(1.5rem,8vw,5.75rem)] max-[359px]:text-2xl sm:text-[clamp(2.5rem,7vw,5.75rem)] text-cream leading-[0.98] tracking-[-0.035em] mb-1 sm:mb-4 drop-shadow-[0_3px_18px_rgba(0,0,0,0.55)] [text-wrap:balance]">
              {slide.headline}
            </h1>
            {slide.supportingText && <p className="mb-2 sm:mb-5 max-w-lg text-sm sm:text-base leading-snug sm:leading-relaxed text-cream drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">{slide.supportingText}</p>}
            <Link to={slide.destination} className="group relative top-11 inline-flex min-h-11 items-center gap-2 rounded-full bg-mall-accent px-5 py-2.5 text-sm font-semibold text-mall-900 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream sm:top-0 sm:min-h-12 sm:gap-3 sm:px-5 sm:py-3">
              {slide.ctaLabel}
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mall-900/10">
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        ) : <div className="flex-1" aria-hidden="true" />}

        {slides.length > 1 && (
          <div className="pointer-events-auto mb-1 flex shrink-0 items-center gap-1.5 rounded-full border border-cream/15 bg-mall-900/60 px-3 py-2 backdrop-blur-sm sm:mb-2">
            {slides.map((item, i) => (
              <button key={item._id || i} onClick={() => setIndex(i)} aria-label={`Show slide ${i + 1}: ${item.headline}`} aria-pressed={i === index}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-mall-accent" : "w-1.5 bg-cream/55 hover:bg-cream"}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { settings } = useSettings();
  const [initialCache] = useState(() => getHomeCache());
  const heroContainerRef = useRef(null);
  const [floors, setFloors] = useState(() => initialCache?.floors || []);
  const [shopsByFloor, setShopsByFloor] = useState(() => initialCache?.shopsByFloor || {});
  const [flashSale, setFlashSale] = useState(() => initialCache?.flashSale || []);
  const [homeSections, setHomeSections] = useState(() => organizeHomepageSections(initialCache?.homeSections || [], initialCache?.flashSale || []));
  const [heroSlides, setHeroSlides] = useState(() => initialCache?.heroSlides || []);
  const [activeHeroSlide, setActiveHeroSlide] = useState(null);
  const [homepageContent, setHomepageContent] = useState(() => normalizeHomepageContent(initialCache?.homepageContent || HOME_CONTENT_FALLBACK));
  const [recentlyViewed, setRecentlyViewed] = useState(() => readRecentlyViewed());
  const [loadError, setLoadError] = useState(false);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const trendingSection = homeSections.find((section) => section.type === "badge" && section.badge?.slug === "trending");

  useEffect(() => {
    const refreshRecentlyViewed = () => setRecentlyViewed(readRecentlyViewed());
    window.addEventListener(RECENTLY_VIEWED_EVENT, refreshRecentlyViewed);
    window.addEventListener("storage", refreshRecentlyViewed);
    return () => {
      window.removeEventListener(RECENTLY_VIEWED_EVENT, refreshRecentlyViewed);
      window.removeEventListener("storage", refreshRecentlyViewed);
    };
  }, []);

  // Applies a fully-fetched data bundle to state. Shared by the cache-hit
  // path and the fresh-fetch path so they can't drift out of sync.
  function applyData(bundle) {
    setFloors(bundle.floors);
    setShopsByFloor(bundle.shopsByFloor);
    setFlashSale(bundle.flashSale);
    setHomeSections(organizeHomepageSections(bundle.homeSections, bundle.flashSale));
    setHeroSlides(bundle.heroSlides || []);
    setHomepageContent(normalizeHomepageContent(bundle.homepageContent || HOME_CONTENT_FALLBACK));
  }

  useEffect(() => {
    const cached = getHomeCache();
    if (cached) {
      applyData(cached);
      if (isHomeCacheFresh()) return;
    }

    let active = true;
    setLoadError(false);
    Promise.all([
      api.get("/home-sections", { timeout: HOME_REQUEST_TIMEOUT_MS }).catch(() => ({ data: [] })),
      api.get("/floors", { timeout: HOME_REQUEST_TIMEOUT_MS }),
      api.get("/shops", { params: { includeCounts: false }, timeout: HOME_REQUEST_TIMEOUT_MS }),
      api.get("/products", { params: { flashSale: true, limit: 12 }, timeout: HOME_REQUEST_TIMEOUT_MS }),
      api.get("/hero-slides", { timeout: HOME_REQUEST_TIMEOUT_MS }).catch(() => ({ data: [] })),
      api.get("/homepage-content", { timeout: HOME_REQUEST_TIMEOUT_MS }).catch(() => ({ data: null })),
    ]).then(async ([sectionsRes, floorsRes, shopsRes, flashRes, heroRes, contentRes]) => {
      if (!active) return;

      const grouped = {};
      shopsRes.data.forEach((shop) => {
        const floorId = shop.floor?._id;
        if (!grouped[floorId]) grouped[floorId] = [];
        grouped[floorId].push(shop);
      });

      const sectionConfigs = (sectionsRes.data || []).filter((section) =>
        (section.type === "badge" && section.badge) ||
        (section.type === "featured-shop" && section.shop && section.shop.isActive !== false) ||
        (section.type === "featured-category" && section.category)
      );
      const flashSaleProducts = flashRes.data.products || [];
      const coreBundle = {
        floors: floorsRes.data,
        shopsByFloor: grouped,
        flashSale: flashSaleProducts,
        heroSlides: heroRes.data || [],
        homepageContent: contentRes.data || HOME_CONTENT_FALLBACK,
        homeSections: cached?.homeSections || [],
      };

      applyData(coreBundle);
      setHomeCache({ ...coreBundle, sectionsPending: true });
      setLoadError(false);

      const sectionResults = await Promise.all(sectionConfigs.map((section) => {
        const request = section.type === "badge"
          ? api.get("/products", { params: { badge: section.badge?.slug, limit: 12 }, timeout: HOME_REQUEST_TIMEOUT_MS })
          : section.type === "featured-shop"
            ? api.get("/products", { params: { shop: section.shop?._id, limit: 12 }, timeout: HOME_REQUEST_TIMEOUT_MS })
            : api.get("/products", { params: { category: section.category, limit: 12 }, timeout: HOME_REQUEST_TIMEOUT_MS });
        return request.catch(() => ({ data: { products: [] } }));
      }));

      if (!active) return;
      const homeSectionsResult = sectionConfigs
        .map((section, index) => ({ ...section, products: sectionResults[index].data.products || [] }))
        .filter((section) => section.products.length > 0);
      const bundle = { ...coreBundle, homeSections: homeSectionsResult };
      setHomeSections(organizeHomepageSections(homeSectionsResult, flashSaleProducts));
      setHomeCache(bundle);
    }).catch(() => {
      if (active) setLoadError(true);
    });

    return () => { active = false; };
  }, [refreshAttempt]);

  const activeFloorCount = floors.filter((f) => (shopsByFloor[f._id] || []).some((shop) => shop.status !== "closed")).length;
  const si = SECTION_PADDING;
  const currentHeroSlide = activeHeroSlide || heroSlides[0] || getHeroFallback(homepageContent);
  const fallbackHeroSlide = useMemo(() => getHeroFallback(homepageContent), [homepageContent]);
  const hasResponsiveBrandBanner = currentHeroSlide.mediaType === "image" && /^\/pics\/azard-stores-banner\.(?:png|webp)(?:[?#]|$)/i.test(currentHeroSlide.mediaUrl || "");
  const heroImageUrl = hasResponsiveBrandBanner ? "/pics/azard-stores-banner.webp" : currentHeroSlide.mediaUrl;
  const heroFrameClass = "aspect-[4/5] sm:aspect-video lg:aspect-[5/2]";

  return (
    <div className="bg-mall-900 min-h-screen">
      {loadError && (
        <div role="alert" className="flex items-center justify-center gap-3 bg-amber-300/10 px-4 py-2 text-center text-xs text-amber-100">
          Some homepage content could not be refreshed.
          <button type="button" onClick={() => setRefreshAttempt((attempt) => attempt + 1)} className="underline">Retry</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ZONE 1 — THE ARRIVAL
          Campaign image or video, selected per slide
          Campaign media and copy only; promotions follow below.
      ══════════════════════════════════════════════════════════════ */}
      <section ref={heroContainerRef} className={`relative isolate flex items-center overflow-hidden bg-mall-900 ${heroFrameClass}`}>
        <ZoneBg
          src={heroImageUrl}
          type={currentHeroSlide.mediaType}
          poster={currentHeroSlide.posterUrl}
          alt={currentHeroSlide.altText || currentHeroSlide.headline}
          overlay={currentHeroSlide.mediaType === "video" ? "bg-mall-900/10 sm:bg-mall-900/20" : "bg-transparent"}
          mobileSrc={hasResponsiveBrandBanner ? "/pics/azard-stores-banner-mobile.webp" : ""}
          mediumSrc={hasResponsiveBrandBanner ? "/pics/azard-stores-banner-md.webp" : ""}
        />
        {currentHeroSlide.mediaType === "video" && <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-mall-900/95 via-mall-900/30 to-transparent" />}

        {/* Hero slideshow */}
        <HeroSlideshow heroSlides={heroSlides} fallbackSlide={fallbackHeroSlide} onSlideChange={setActiveHeroSlide} containerRef={heroContainerRef} />
      </section>

      <div className="relative bg-mall-900">
        {/* Flash Sale */}
        {flashSale.length > 0 && (
          <section className="relative z-10 overflow-hidden border-b border-cream/5 py-6 sm:py-8">
            <div className={`${si} mb-4 sm:mb-5`}>
              <SectionHeading
                icon={Zap}
                label={homepageContent.flashSaleHeading}
                tag={homepageContent.flashSaleTag}
                linkTo="/search?flashSale=true"
                linkLabel={homepageContent.sectionLinkLabel || "See all"}
              />
            </div>
            <div className={si}><ProductStrip products={flashSale} cardSize="large" priorityCount={2} /></div>
          </section>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ZONE 2 — THE CORRIDORS (no video — calm content zone)
          Covers: Shop by Purpose + Trending Now + Explore Floors
      ══════════════════════════════════════════════════════════════ */}
      <div className="relative">
        {/* Shop by Purpose */}
        {(homepageContent.purposeTiles || []).length > 0 && <section className="pt-7 pb-1 sm:pt-9 sm:pb-2 relative z-10">
          <div className={si}>
            <SectionHeading icon={Target} label={homepageContent.purposeHeading} tag={homepageContent.purposeTagline} linkTo="/search" linkLabel={homepageContent.sectionLinkLabel} />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
              {(homepageContent.purposeTiles || []).map((purpose) => <PurposeTile key={purpose.purposeTag} purpose={purpose} />)}
            </div>
          </div>
        </section>}

        {trendingSection?.products?.length > 0 && (
          <HomeSectionBlock section={trendingSection} homepageContent={homepageContent} />
        )}

        {/* Explore Floors */}
        {activeFloorCount > 0 && (
          <section className="relative z-10 pt-5 pb-6 sm:pt-7 sm:pb-8">
            <div className={si}>
              <div className="mb-3 flex items-center gap-3 font-mono-tag text-[9px] uppercase tracking-[0.18em] text-cream/45 sm:mb-4">
                <span className="h-px flex-1 bg-cream/10" />
                <span>Browse by floor</span>
                <span className="h-px flex-1 bg-cream/10" />
              </div>
              <SectionHeading
                icon={Store}
                label={homepageContent.exploreHeading}
                tag={`${activeFloorCount} of ${floors.length} floors open`}
                linkTo="/directory"
                linkLabel={homepageContent.exploreLinkLabel}
              />
              <FloorShowcase floors={floors} shopsByFloor={shopsByFloor} />
            </div>
          </section>
        )}

      </div>

      {/* ══════════════════════════════════════════════════════════════
          ZONE 3 — INSIDE THE SHOPS (no video — calm content zone)
          Remaining homepage sections (AdminHomeSections.jsx) render here in
          admin-set order; Trending Now is placed earlier in the home flow.
      ══════════════════════════════════════════════════════════════ */}
      <div className="relative">
        {homeSections.filter((section) => section !== trendingSection).map((section) => (
          <HomeSectionBlock key={section._id} section={section} homepageContent={homepageContent} />
        ))}
      </div>

      <RecentlyViewedSection products={recentlyViewed} />

      {/* Compact summary with a link to the complete shopping guide. */}
      <section aria-labelledby="shopping-steps-heading" className="relative overflow-hidden border-y border-cream/5 bg-mall-800/25 py-6 sm:py-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-0 h-56 w-56 rounded-full bg-mall-accent/5 blur-3xl" />
        <div className={`${si} relative`}>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 font-mono-tag text-[9px] uppercase tracking-[0.2em] text-mall-orange">One mall, one easy journey</p>
              <h2 id="shopping-steps-heading" className="font-display text-xl text-cream sm:text-2xl">How shopping works</h2>
            </div>
            <Link to="/how-it-works" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 text-xs font-medium text-mall-accent transition hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent sm:text-sm">
              Full guide <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="flex snap-x snap-proximity flex-nowrap gap-3 overflow-x-auto overscroll-x-contain pb-2 sm:gap-4" style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}>
            {[
              { number: "01", icon: MapPin, title: "Browse the mall", body: "Explore products across floors and shops to find what fits your day." },
              { number: "02", icon: ShoppingBasket, title: "Bring it all together", body: "Add items from different shops to one cart. See available delivery and payment options at checkout." },
              { number: "03", icon: Truck, title: "Follow your order", body: "Check order status online, and review collection details when your delivery option requires it." },
            ].map(({ number, icon: Icon, title, body }) => (
              <article key={number} className="flex min-h-[112px] w-[min(78vw,300px)] shrink-0 snap-start gap-3 rounded-xl border border-cream/10 bg-mall-900/65 p-3.5 sm:w-[min(32vw,360px)] sm:p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mall-accent/20 bg-mall-accent/10 text-mall-accent">
                  <Icon size={19} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 font-mono-tag text-[9px] uppercase tracking-[0.18em] text-mall-orange">Step {number}</p>
                  <h3 className="font-display text-base leading-tight text-cream">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-cream/55">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          ZONE 5 — THE FINALE
          Video: People walking inside the mall (evening energy)
          Covers: Closing statement + Footer entry
      ══════════════════════════════════════════════════════════════ */}
      <div className="relative">
        <ZoneBg
          src={homepageContent.closingMediaUrl}
          type={homepageContent.closingMediaType}
          poster={homepageContent.closingPosterUrl}
          alt={homepageContent.closingEyebrow}
          overlay="bg-mall-900/60"
          deferMedia
        />

        {/* Closing statement */}
        <section className="relative z-10 min-h-[60vh] sm:min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-16 sm:py-20 md:py-24">
          <p className="font-mono-tag text-[9px] sm:text-[10px] uppercase text-mall-orange tracking-[0.3em] mb-5 sm:mb-7">{homepageContent.closingEyebrow}</p>
          <h2 className="font-display max-w-full text-4xl sm:text-6xl md:text-7xl lg:text-8xl text-cream leading-[0.95] tracking-tight mb-8 sm:mb-10 [overflow-wrap:anywhere]">
            {homepageContent.closingHeadline}<br /><span className="text-mall-accent">{homepageContent.closingAccent}</span>
          </h2>
          <div className="flex w-full max-w-md flex-col sm:w-auto sm:max-w-none sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
            <Link to={homepageContent.closingPrimaryDestination} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-mall-orange px-6 py-3 text-sm sm:text-base font-semibold text-mall-900 shadow-lg shadow-black/20 transition hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-mall-900">
              <span>{homepageContent.closingPrimaryLabel}</span>
              <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </Link>
            {homepageContent.closingSecondaryDestination === "whatsapp" ? (
              <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-cream/40 bg-mall-900/35 px-5 py-3 text-sm sm:text-base font-medium text-cream/90 transition hover:border-cream/70 hover:bg-mall-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-mall-900">
                <span>{homepageContent.closingSecondaryLabel}</span><ArrowRight size={14} className="transition group-hover:translate-x-1" />
              </a>
            ) : (
              <Link to={homepageContent.closingSecondaryDestination} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-cream/40 bg-mall-900/35 px-5 py-3 text-sm sm:text-base font-medium text-cream/90 transition hover:border-cream/70 hover:bg-mall-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-mall-900">
                <span>{homepageContent.closingSecondaryLabel}</span><ArrowRight size={14} className="transition group-hover:translate-x-1" />
              </Link>
            )}
          </div>
          <p className="mt-12 max-w-full px-3 font-mono-tag text-[9px] sm:text-[10px] uppercase text-cream/70 tracking-[0.16em] leading-relaxed">
            {homepageContent.closingFooterLine}
          </p>
        </section>
      </div>

    </div>
  );
}
