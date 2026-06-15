"use client";

import { useEffect, useRef } from "react";

/*
 * NodeNetwork
 * -----------
 * An abstract peer-to-peer network: drifting nodes connected by hairlines when
 * close, with a few "confidential" violet nodes that pulse. Pure canvas, capped
 * device-pixel-ratio, and paused for users who prefer reduced motion. It is
 * decorative only and sits behind the hero content.
 */

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  accent: boolean;
  phase: number;
}

const LINK_DISTANCE = 150;
const FOREGROUND = "236, 236, 241"; // --foreground
const ACCENT = "139, 109, 255"; // --accent

export function NodeNetwork({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let raf = 0;
    let mouseX = -9999;
    let mouseY = -9999;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function buildNodes() {
      // Scale node count to area, but keep it bounded for performance.
      const count = Math.min(64, Math.floor((width * height) / 16000));
      nodes = Array.from({ length: count }, () => {
        const accent = Math.random() < 0.18;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: accent ? 2.4 : 1.5,
          accent,
          phase: Math.random() * Math.PI * 2,
        };
      });
    }

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildNodes();
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);

      // Links
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DISTANCE) {
            const strength = 1 - dist / LINK_DISTANCE;
            const accentLink = a.accent || b.accent;
            const color = accentLink ? ACCENT : FOREGROUND;
            ctx!.strokeStyle = `rgba(${color}, ${strength * (accentLink ? 0.32 : 0.14)})`;
            ctx!.lineWidth = accentLink ? 0.9 : 0.6;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // Nodes
      const t = performance.now() / 1000;
      for (const n of nodes) {
        const pulse = n.accent ? 0.6 + 0.4 * Math.sin(t * 1.6 + n.phase) : 1;
        const color = n.accent ? ACCENT : FOREGROUND;
        if (n.accent) {
          ctx!.shadowColor = `rgba(${ACCENT}, 0.8)`;
          ctx!.shadowBlur = 12 * pulse;
        } else {
          ctx!.shadowBlur = 0;
        }
        ctx!.fillStyle = `rgba(${color}, ${n.accent ? 0.9 * pulse : 0.55})`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.shadowBlur = 0;
    }

    function step() {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;

        // Gentle attraction toward the pointer for a hint of interactivity.
        const dx = mouseX - n.x;
        const dy = mouseY - n.y;
        const d = Math.hypot(dx, dy);
        if (d < 160 && d > 0.001) {
          n.x += (dx / d) * 0.25;
          n.y += (dy / d) * 0.25;
        }

        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        n.x = Math.max(0, Math.min(width, n.x));
        n.y = Math.max(0, Math.min(height, n.y));
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    }
    function onPointerLeave() {
      mouseX = -9999;
      mouseY = -9999;
    }

    resize();
    draw();

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);

    if (!reduceMotion) {
      raf = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: "block" }}
    />
  );
}
