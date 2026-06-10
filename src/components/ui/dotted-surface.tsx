'use client';
import { cn } from '@/lib/utils';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

type DottedSurfaceProps = Omit<React.ComponentProps<'div'>, 'ref'>;

export function DottedSurface({ className, ...props }: DottedSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getTheme = () => document.documentElement.getAttribute('data-theme') ?? 'light';
    let currentTheme = getTheme();

    const SEPARATION = 100;
    const AMOUNTX = 40;
    const AMOUNTY = 60;

    const rect = container.getBoundingClientRect();
    const initW = rect.width > 0 ? rect.width : window.innerWidth;
    const initH = rect.height > 0 ? rect.height : window.innerHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, initW / initH, 1, 10000);
    camera.position.set(0, 355, 1220);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(initW, initH);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const positions: number[] = [];
    const colors: number[] = [];

    const isDark = () => currentTheme === 'dark';

    const getMutedRGB = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-text-muted')
        .trim();
      const hex = raw.startsWith('#') ? raw.slice(1) : raw;
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
      };
    };

    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions.push(
          ix * SEPARATION - (AMOUNTX * SEPARATION) / 2,
          0,
          iy * SEPARATION - (AMOUNTY * SEPARATION) / 2,
        );
        const { r, g, b } = getMutedRGB();
        colors.push(r, g, b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 8,
      vertexColors: true,
      transparent: true,
      opacity: isDark() ? 0.55 : 0.6,
      sizeAttenuation: true,
    });

    scene.add(new THREE.Points(geometry, material));

    let count = 0;
    let animationId = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const posAttr = geometry.attributes.position;
      const posArr = posAttr.array as Float32Array;
      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          posArr[i * 3 + 1] =
            Math.sin((ix + count) * 0.3) * 50 +
            Math.sin((iy + count) * 0.5) * 50;
          i++;
        }
      }
      posAttr.needsUpdate = true;
      renderer.render(scene, camera);
      count += 0.1;
    };

    animate();

    // Resize to match the container, not the window
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        camera.aspect = r.width / r.height;
        camera.updateProjectionMatrix();
        renderer.setSize(r.width, r.height);
      }
    });
    ro.observe(container);

    // Update colors/opacity on theme change without recreating the scene
    const mo = new MutationObserver(() => {
      const next = getTheme();
      if (next === currentTheme) return;
      currentTheme = next;
      const colorAttr = geometry.attributes.color;
      const colorArr = colorAttr.array as Float32Array;
      const { r, g, b } = getMutedRGB();
      for (let j = 0; j < colorArr.length; j += 3) {
        colorArr[j] = r;
        colorArr[j + 1] = g;
        colorArr[j + 2] = b;
      }
      colorAttr.needsUpdate = true;
      material.opacity = isDark() ? 0.55 : 0.6;
      material.needsUpdate = true;
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelAnimationFrame(animationId);
      ro.disconnect();
      mo.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // single mount — theme & resize handled inside via observers

  return (
    <div
      ref={containerRef}
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      {...props}
    />
  );
}
