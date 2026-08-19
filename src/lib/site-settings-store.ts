import { getMongo } from "./mongo";

export type SocialLink = {
  platform: 'linkedin' | 'instagram' | 'github' | 'x';
  url: string;
  enabled: boolean;
};

export type PageLink = {
  label: string;
  url: string;
  enabled: boolean;
};

export type SiteSettings = {
  footerDescription: string;
  extensionDescription: string;
  socials: SocialLink[];
  pages: PageLink[];
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  // SEO Section
  seoTitle: string;
  seoParagraph: string;
  seoList: string[];
  seoImage: string;
};

export const defaultSocials: SocialLink[] = [
  { platform: 'linkedin', url: '#', enabled: true },
  { platform: 'instagram', url: '#', enabled: true },
  { platform: 'github', url: '#', enabled: true },
  { platform: 'x', url: '#', enabled: true }
];

export const defaultPages: PageLink[] = [
  { label: 'Acceptable use', url: '/acceptable-use', enabled: true },
  { label: 'Privacy', url: '/privacy', enabled: true },
  { label: 'Terms', url: '/terms', enabled: true },
  { label: 'Refunds', url: '/refund-policy', enabled: true },
  { label: 'Contact', url: '/contact', enabled: true }
];

export const defaultSiteSettings: SiteSettings = {
  footerDescription: "Fast, private, and thoughtfully designed sharing for developers. Built to keep your workflow moving.",
  extensionDescription: "Share text from any page in one click, right from Chrome.",
  socials: defaultSocials,
  pages: defaultPages,
  heroEyebrow: "Private by default · No account required",
  heroTitle: "Share text and code without the clutter.",
  heroSubtitle: "Paste anything, choose when it expires, and send one simple link.",
  seoTitle: "Why developers choose TextShare",
  seoParagraph: "TextShare is engineered to eliminate the friction of sharing sensitive code and logs. Chat tools index messages permanently, email chains are vulnerable to data leakage, and generic pastebins are bloated with trackers. TextShare provides an instantaneous, ad-free environment where your shared content remains strictly private, formatted perfectly, and auto-destroyed exactly when you specify.",
  seoList: [
    "Zero-friction workflow: no account or registration required to start sharing.",
    "Syntax highlighting for major programming languages, styled for readability.",
    "Strict security controls: AES-256-GCM encryption, single-use burn-after-reading rooms, and password gates.",
    "Fully optimized for speed: light, responsive, and cross-platform."
  ],
  seoImage: "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=600&auto=format&fit=crop"
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const { db } = await getMongo();
  const settings = await db.collection("siteSettings").findOne({ id: "global" });
  if (!settings) {
    return defaultSiteSettings;
  }
  return {
    footerDescription: settings.footerDescription || defaultSiteSettings.footerDescription,
    extensionDescription: settings.extensionDescription || defaultSiteSettings.extensionDescription,
    socials: settings.socials || defaultSiteSettings.socials,
    pages: settings.pages || defaultSiteSettings.pages,
    heroEyebrow: settings.heroEyebrow || defaultSiteSettings.heroEyebrow,
    heroTitle: settings.heroTitle || defaultSiteSettings.heroTitle,
    heroSubtitle: settings.heroSubtitle || defaultSiteSettings.heroSubtitle,
    seoTitle: settings.seoTitle || defaultSiteSettings.seoTitle,
    seoParagraph: settings.seoParagraph || defaultSiteSettings.seoParagraph,
    seoList: settings.seoList || defaultSiteSettings.seoList,
    seoImage: settings.seoImage || defaultSiteSettings.seoImage
  };
}

export async function saveSiteSettings(settings: SiteSettings) {
  const { db } = await getMongo();
  await db.collection("siteSettings").replaceOne(
    { id: "global" },
    { id: "global", ...settings, updatedAt: new Date() },
    { upsert: true }
  );
}
