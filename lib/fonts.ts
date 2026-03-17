"use client";

const loadedFonts = new Set<string>();

/**
 * Dynamically load a Google Font by injecting a <link> tag.
 * Uses variable font axis (wght@100..900) which works for all fonts.
 * Falls back to no weight spec if the font doesn't support variable weights.
 */
export function loadGoogleFont(fontFamily: string) {
  if (!fontFamily || loadedFonts.has(fontFamily)) return;
  loadedFonts.add(fontFamily);

  const encoded = fontFamily.replace(/\s+/g, "+");
  
  // Load with just the family name — Google Fonts will serve whatever weights are available
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;700&display=swap`;
  
  // If this fails (font doesn't have 700), try without weight specification
  link.onerror = () => {
    const fallback = document.createElement("link");
    fallback.rel = "stylesheet";
    fallback.href = `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
    document.head.appendChild(fallback);
  };
  
  document.head.appendChild(link);
}

/**
 * Check if a Google Font exists.
 */
export async function checkGoogleFont(fontFamily: string): Promise<boolean> {
  try {
    const encoded = fontFamily.replace(/\s+/g, "+");
    const res = await fetch(
      `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`
    );
    return res.ok;
  } catch {
    return false;
  }
}
