import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        alt?: string;
        "camera-controls"?: boolean;
        autoplay?: boolean;
        ar?: boolean;
        exposure?: string;
        shadowIntensity?: string;
        style?: React.CSSProperties;
      };
    }
  }
}
