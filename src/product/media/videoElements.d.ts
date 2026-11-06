// Phần tử tuỳ biến của Zoom Video SDK dùng để vẽ video trong JSX.
import "react";

type VideoElementProps = import("react").DetailedHTMLProps<
  import("react").HTMLAttributes<HTMLElement>,
  HTMLElement
> & { class?: string };

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "video-player-container": VideoElementProps;
      "video-player": VideoElementProps;
    }
  }
}
