export type Metadata = {
  title?: string;
  description?: string;
  manifest?: string;
  appleWebApp?: { capable?: boolean; statusBarStyle?: string; title?: string };
  other?: Record<string, string>;
};

export type Viewport = {
  width?: string;
  initialScale?: number;
  viewportFit?: string;
};
