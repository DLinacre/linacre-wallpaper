/**
 * Font Registration Utility
 * Registers local fonts for linacre.site theme
 */

export async function registerFonts() {
  // Fonts are loaded via @font-face in CSS (index.html preloads)
  // This function ensures they're ready before rendering

  const fonts = [
    { family: 'Inter', weight: '400 700', style: 'normal' },
    { family: 'JetBrains Mono', weight: '400 600', style: 'normal' },
    { family: 'Space Grotesk', weight: '400 700', style: 'normal' },
  ];

  // Wait for fonts to load (with timeout)
  await Promise.all(fonts.map(font =>
    document.fonts.load(`16px "${font.family}"`).catch(() => {})
  ));

  // Additional wait for font-display: swap fallback
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('[Fonts] Registered: Inter, JetBrains Mono, Space Grotesk');
}