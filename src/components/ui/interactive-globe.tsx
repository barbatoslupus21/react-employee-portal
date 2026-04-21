"use client";

import { cn } from "@/lib/utils";
import { useRef, useEffect, useCallback, useState } from "react";

interface GlobeProps {
  className?: string;
  size?: number;
  autoRotateSpeed?: number;
}

const MARKERS = [
  { lat: 36.20, lng: 138.25, label: "Japan" },
  { lat: 12.88, lng: 121.77, label: "Philippines" },
  { lat: 20.59, lng: 78.96, label: "India" },
  { lat: 14.06, lng: 108.28, label: "Vietnam" },
  { lat: 35.86, lng: 104.20, label: "China" },
  { lat: 49.82, lng: 15.47, label: "Czech Republic" },
  { lat: 1.35, lng: 103.82, label: "Singapore" },
  { lat: -0.79, lng: 113.92, label: "Indonesia" },
  { lat: 15.87, lng: 100.99, label: "Thailand" },
];

const CONNECTIONS: { from: [number, number]; to: [number, number] }[] = [
  { from: [36.20, 138.25], to: [12.88, 121.77] },    // Japan → Philippines
  { from: [36.20, 138.25], to: [35.86, 104.20] },    // Japan → China
  { from: [36.20, 138.25], to: [14.06, 108.28] },    // Japan → Vietnam
  { from: [36.20, 138.25], to: [1.35, 103.82] },     // Japan → Singapore
  { from: [36.20, 138.25], to: [20.59, 78.96] },     // Japan → India
  { from: [36.20, 138.25], to: [49.82, 15.47] },     // Japan → Czech Republic
  { from: [12.88, 121.77], to: [1.35, 103.82] },     // Philippines → Singapore
  { from: [12.88, 121.77], to: [-0.79, 113.92] },    // Philippines → Indonesia
  { from: [14.06, 108.28], to: [15.87, 100.99] },    // Vietnam → Thailand
  { from: [35.86, 104.20], to: [20.59, 78.96] },     // China → India
];

function latLngToXYZ(
  lat: number,
  lng: number,
  radius: number
): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    -radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

function rotateY(
  x: number,
  y: number,
  z: number,
  angle: number
): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function rotateX(
  x: number,
  y: number,
  z: number,
  angle: number
): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x, y * cos - z * sin, y * sin + z * cos];
}

function project(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  fov: number
): [number, number, number] {
  const scale = fov / (fov + z);
  return [x * scale + cx, y * scale + cy, z];
}

export function InteractiveGlobe({
  className,
  size = 1000,
  autoRotateSpeed = 0.002,
}: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotYRef = useRef(0.0);

  // ── Theme-aware colors ──────────────────────────────
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const root = document.documentElement;
    setIsDark((root.getAttribute('data-theme') ?? 'dark') === 'dark');
    const observer = new MutationObserver(() => {
      setIsDark((root.getAttribute('data-theme') ?? 'dark') === 'dark');
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const dotColor   = isDark ? 'rgba(100, 180, 255, ALPHA)' : 'rgba(40, 69, 214, ALPHA)';
  const arcColor   = isDark ? 'rgba(100, 180, 255, 0.5)'   : 'rgba(40, 69, 214, 0.35)';
  const markerColor = isDark ? 'rgba(100, 220, 255, 1)'    : 'rgba(40, 69, 214, 1)';
  // ────────────────────────────────────────────────────
  const rotXRef = useRef(0.0);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startRotY: number;
    startRotX: number;
  }>({ active: false, startX: 0, startY: 0, startRotY: 0, startRotX: 0 });
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  const dotsRef = useRef<[number, number, number][]>([]);

  useEffect(() => {
    const dots: [number, number, number][] = [];
    const numDots = 1200;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    for (let i = 0; i < numDots; i++) {
      const theta = (2 * Math.PI * i) / goldenRatio;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / numDots);
      const x = Math.cos(theta) * Math.sin(phi);
      const y = Math.cos(phi);
      const z = Math.sin(theta) * Math.sin(phi);
      dots.push([x, y, z]);
    }
    dotsRef.current = dots;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.38;
    const fov = 600;

    if (!dragRef.current.active) {
      rotYRef.current += autoRotateSpeed;
    }

    timeRef.current += 0.015;
    const time = timeRef.current;

    ctx.clearRect(0, 0, w, h);

    // Outer glow
    const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.5);
    glowGrad.addColorStop(0, "rgba(60, 140, 255, 0.03)");
    glowGrad.addColorStop(1, "rgba(60, 140, 255, 0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // Globe outline
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100, 180, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const ry = rotYRef.current;
    const rx = rotXRef.current;

    // Draw dots
    const dots = dotsRef.current;
    for (let i = 0; i < dots.length; i++) {
      let [x, y, z] = dots[i];
      x *= radius;
      y *= radius;
      z *= radius;

      [x, y, z] = rotateX(x, y, z, rx);
      [x, y, z] = rotateY(x, y, z, ry);

      if (z > 0) continue;

      const [sx, sy] = project(x, y, z, cx, cy, fov);
      const depthAlpha = Math.max(0.1, 1 - (z + radius) / (2 * radius));
      const dotSize = 1 + depthAlpha * 0.8;

      ctx.beginPath();
      ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = dotColor.replace("ALPHA", depthAlpha.toFixed(2));
      ctx.fill();
    }

    // Draw connections as arcs
    for (const conn of CONNECTIONS) {
      const [lat1, lng1] = conn.from;
      const [lat2, lng2] = conn.to;

      let [x1, y1, z1] = latLngToXYZ(lat1, lng1, radius);
      let [x2, y2, z2] = latLngToXYZ(lat2, lng2, radius);

      [x1, y1, z1] = rotateX(x1, y1, z1, rx);
      [x1, y1, z1] = rotateY(x1, y1, z1, ry);
      [x2, y2, z2] = rotateX(x2, y2, z2, rx);
      [x2, y2, z2] = rotateY(x2, y2, z2, ry);

      if (z1 > radius * 0.3 && z2 > radius * 0.3) continue;

      const [sx1, sy1] = project(x1, y1, z1, cx, cy, fov);
      const [sx2, sy2] = project(x2, y2, z2, cx, cy, fov);

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const midZ = (z1 + z2) / 2;
      const midLen = Math.sqrt(midX * midX + midY * midY + midZ * midZ);
      const arcHeight = radius * 1.25;
      const elevX = (midX / midLen) * arcHeight;
      const elevY = (midY / midLen) * arcHeight;
      const elevZ = (midZ / midLen) * arcHeight;
      const [scx, scy] = project(elevX, elevY, elevZ, cx, cy, fov);

      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.quadraticCurveTo(scx, scy, sx2, sy2);
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Traveling dot along arc
      const t = (Math.sin(time * 1.2 + lat1 * 0.1) + 1) / 2;
      const tx = (1 - t) * (1 - t) * sx1 + 2 * (1 - t) * t * scx + t * t * sx2;
      const ty = (1 - t) * (1 - t) * sy1 + 2 * (1 - t) * t * scy + t * t * sy2;

      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fillStyle = markerColor;
      ctx.fill();
    }

    // Draw markers
    for (const marker of MARKERS) {
      let [x, y, z] = latLngToXYZ(marker.lat, marker.lng, radius);
      [x, y, z] = rotateX(x, y, z, rx);
      [x, y, z] = rotateY(x, y, z, ry);

      if (z > radius * 0.1) continue;

      const [sx, sy] = project(x, y, z, cx, cy, fov);

      // Pulse ring
      const pulse = Math.sin(time * 2 + marker.lat) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = markerColor.replace("1)", `${0.2 + pulse * 0.15})`);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Core dot
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = markerColor;
      ctx.fill();

      // Label
      if (marker.label) {
        ctx.font = "13px system-ui, sans-serif";
        ctx.fillStyle = markerColor.replace("1)", "0.75)");
        ctx.fillText(marker.label, sx + 10, sy + 4);
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, [dotColor, arcColor, markerColor, autoRotateSpeed]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startRotY: rotYRef.current,
        startRotX: rotXRef.current,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      rotYRef.current = dragRef.current.startRotY - dx * 0.002;
      rotXRef.current = Math.max(
        -1,
        Math.min(1, dragRef.current.startRotX - dy * 0.002)
      );
    },
    []
  );

  const onPointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full h-full cursor-grab active:cursor-grabbing", className)}
      style={{ width: size, height: size }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
