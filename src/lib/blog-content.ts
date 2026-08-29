import sanitizeHtml from "sanitize-html";

// Width used when generating a resized/compressed WebP for content images.
const IMAGE_WIDTH = 960;

// Rewrites /api/blog-images/* srcs to a resized WebP variant and injects
// accessibility/perf attributes (alt, loading, decoding).
function imageTransform(fallbackAlt: string) {
  return (_tagName: string, attribs: Record<string, string>) => {
    const src = attribs.src || "";
    const resizedSrc = src.startsWith("/api/blog-images/")
      ? `${src}${src.includes("?") ? "&" : "?"}w=${IMAGE_WIDTH}`
      : src;
    return {
      tagName: "img",
      attribs: {
        ...attribs,
        src: resizedSrc,
        alt: attribs.alt || fallbackAlt,
        loading: "lazy",
        decoding: "async",
      },
    };
  };
}

export function sanitizeBlogHtml(input: string, fallbackAlt = "TextShare image") {
  return sanitizeHtml(input, {
    allowedTags: [
      "p",
      "br",
      "h2",
      "h3",
      "h4",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "blockquote",
      "pre",
      "code",
      "ul",
      "ol",
      "li",
      "a",
      "img",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https", "data"] },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" },
      }),
      h1: "h2",
      img: imageTransform(fallbackAlt),
    },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}

// Lightweight image-only pass used for admin-authored rich content (e.g. the
// home SEO section). It preserves all existing markup and only enriches image
// tags (alt + lazy loading + resized WebP src), without altering links/headings.
export function enrichContentImages(
  input: string,
  fallbackAlt = "TextShare image",
) {
  return sanitizeHtml(input, {
    allowedTags: false,
    allowedAttributes: false,
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https", "data"] },
    transformTags: { img: imageTransform(fallbackAlt) },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}

export function blogTextExcerpt(html: string, length = 170) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}
