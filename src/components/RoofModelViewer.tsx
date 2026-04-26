"use client";

import { useEffect } from "react";

export function RoofModelViewer(props: { modelKey: string }) {
  useEffect(() => {
    const existing = document.querySelector(
      'script[data-model-viewer="true"]'
    ) as HTMLScriptElement | null;
    if (existing) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src =
      "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";
    script.setAttribute("data-model-viewer", "true");
    document.head.appendChild(script);
  }, []);

  const src = `/models/${props.modelKey}.glb`;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-2">
      <model-viewer
        src={src}
        alt="Roof model"
        camera-controls
        autoplay
        exposure="1.0"
        shadowIntensity="1"
        style={{ width: "100%", height: "260px", background: "#020617" }}
      />
    </div>
  );
}
