// Images as colored ASCII art (the profile picture and the skill icons).
//
// The art is big, so it is not sent through the C engine. Instead the engine
// output contains placeholders ([[PROFILE_ART]], [[ICON:python]]) and
// expandPlaceholders() swaps in the art kept in `asciiCache`.

// Characters from "darkest" (most ink) to "lightest" (a space).
const ASCII_RAMP = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";

// Pixels more transparent than this become spaces.
const MIN_ALPHA = 20;

/** Art rendered during startup, looked up by expandPlaceholders(). */
export const asciiCache = {
  profile: "",
  icons: {}, // skill name (lowercase) -> art
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // needed to read the pixels of a CDN image
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Renders an image `width` characters wide as true-color ANSI ASCII art.
 * Resolves "" on any failure (missing URL, network, CORS).
 */
export async function generateAsciiArt(imageUrl, width = 60) {
  if (!imageUrl) return "";
  try {
    const img = await loadImage(imageUrl);
    // Terminal cells are about twice as tall as wide, so use half the rows.
    const height = Math.max(1, Math.floor((img.height / img.width) * width * 0.5));

    // Draw the image at one pixel per character and read the pixels back.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;

    let ascii = "";
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const [r, g, b, alpha] = pixels.subarray(offset, offset + 4);
        if (alpha < MIN_ALPHA) {
          ascii += " ";
          continue;
        }
        // Brighter pixel -> lighter character, drawn in the pixel's own color.
        const brightness = (r + g + b) / 3 / 255;
        const charIndex = Math.floor(brightness * (ASCII_RAMP.length - 1));
        const char = ASCII_RAMP[ASCII_RAMP.length - 1 - charIndex] || ".";
        ascii += `\x1b[38;2;${r};${g};${b}m${char}`;
      }
      ascii += "\x1b[0m\n";
    }
    return ascii;
  } catch {
    return "";
  }
}

/** Replaces the [[PROFILE_ART]] / [[ICON:key]] placeholders in engine output. */
export function expandPlaceholders(output) {
  // Function replacers, so "$" characters in the art are not treated as patterns.
  return output
    .replace("[[PROFILE_ART]]", () => asciiCache.profile)
    .replace(/\[\[ICON:(.*?)\]\]/g, (_, skillKey) => asciiCache.icons[skillKey] || "");
}
