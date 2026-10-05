"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ImageRef } from "@/lib/content/types";

const backgroundImages: ImageRef[] = [
  { url: "/images/hero/padel.webp", alt: "" },
  { url: "/images/hero/cricket.webp", alt: "" },
  { url: "/images/hero/futsal.webp", alt: "" },
  { url: "/images/hero/cafe-v2.webp", alt: "", hotspot: { x: 0.5, y: 0.48 } },
];

/** Decorative sport and café backgrounds; the CMS image can lead the sequence. */
export function HeroImages({ image }: { image: ImageRef | null }) {
  const images = useMemo(() => image ? [image, ...backgroundImages] : backgroundImages, [image]);
  const [active, setActive] = useState(0);
  const [loadedUrls, setLoadedUrls] = useState<string[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setActive((current) => {
        for (let offset = 1; offset < images.length; offset++) {
          const next = (current + offset) % images.length;
          if (loadedUrls.includes(images[next].url)) return next;
        }
        return current;
      });
    }, 7000);
    return () => window.clearInterval(timer);
  }, [reducedMotion, images, loadedUrls]);

  const cafeIsActive = images[active]?.url === "/images/hero/cafe-v2.webp";

  return (
    <div className="absolute inset-0 -z-10 bg-charcoal" aria-hidden="true">
      {images.map((item, index) => (
        <Image
          key={item.url}
          src={item.url}
          alt=""
          fill
          sizes="100vw"
          preload={index === 0}
          loading={index === 0 ? undefined : "eager"}
          onLoad={() => setLoadedUrls((current) => current.includes(item.url) ? current : [...current, item.url])}
          className={`object-cover transition-opacity duration-[1500ms] motion-reduce:transition-none ${index === active ? "opacity-100" : "opacity-0"}`}
          style={{ objectPosition: item.hotspot ? `${item.hotspot.x * 100}% ${item.hotspot.y * 100}%` : "65% center" }}
        />
      ))}
      <div className={`absolute inset-0 ${cafeIsActive
        ? "bg-gradient-to-r from-charcoal/75 via-charcoal/30 to-charcoal/10"
        : "bg-gradient-to-r from-charcoal/85 via-charcoal/45 to-charcoal/20"}`} />
      <div className={`absolute inset-0 ${cafeIsActive
        ? "bg-gradient-to-t from-charcoal via-charcoal/15 to-charcoal/20"
        : "bg-gradient-to-t from-charcoal via-charcoal/25 to-charcoal/35"}`} />
    </div>
  );
}
