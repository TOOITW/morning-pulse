/**
 * Content Hash Generator
 * Generates SHA256 hash from canonical URL + stripped title for deduplication
 */

import { createHash } from 'crypto';

/**
 * Strip title of extra whitespace and special characters
 */
export function stripTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s]/g, ''); // Remove special characters
}

/**
 * Generate content hash from URL and title
 * Used for article deduplication
 */
export function generateContentHash(canonicalUrl: string, title: string): string {
  const strippedTitle = stripTitle(title);
  const content = `${canonicalUrl}|${strippedTitle}`;
  
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Generate SimHash for similarity detection
 * This is a simplified version; full implementation in Python worker
 */
export function generateSimpleHash(text: string): string {
  // Simple hash for quick comparison
  // Full SimHash implementation is in Python (datasketch library)
  return createHash('md5').update(text.toLowerCase()).digest('hex');
}
