"use client";
// React Bits · StarBorder (Animations)
// https://reactbits.dev/animations/star-border
import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from "react";
import "./star-border.css";

type StarBorderProps<T extends ElementType> = ComponentPropsWithoutRef<T> & {
  as?: T;
  className?: string;
  children?: ReactNode;
  color?: string;
  speed?: CSSProperties["animationDuration"];
  thickness?: number;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
};

export default function StarBorder<T extends ElementType = "button">({
  as,
  className = "",
  color = "#bf6047",
  speed = "6s",
  thickness = 1,
  backgroundColor = "var(--primary)",
  textColor = "var(--primary-foreground)",
  borderColor = "transparent",
  children,
  ...rest
}: StarBorderProps<T>) {
  const Component = (as || "button") as ElementType;

  return (
    <Component
      className={`rb-star-border ${className}`}
      {...rest}
      style={{
        padding: `${thickness}px 0`,
        ...(rest as { style?: CSSProperties }).style,
      }}
    >
      <div
        className="rb-star-border-bottom"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="rb-star-border-top"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="rb-star-border-inner"
        style={{ background: backgroundColor, color: textColor, borderColor }}
      >
        {children}
      </div>
    </Component>
  );
}
