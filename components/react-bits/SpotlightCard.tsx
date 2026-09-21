"use client";
// React Bits · SpotlightCard (Components)
// https://reactbits.dev/components/spotlight-card
import { useRef, type ElementType, type MouseEvent, type PropsWithChildren } from "react";
import "./spotlight-card.css";

type SpotlightCardProps = PropsWithChildren<{
  className?: string;
  spotlightColor?: string;
  as?: ElementType;
}>;

export default function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(191, 96, 71, 0.16)",
  as,
}: SpotlightCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  const Component = (as || "div") as ElementType;

  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
    el.style.setProperty("--spotlight-color", spotlightColor);
  };

  return (
    <Component
      ref={ref}
      className={`rb-spotlight ${className}`}
      onMouseMove={handleMouseMove}
    >
      {children}
    </Component>
  );
}
