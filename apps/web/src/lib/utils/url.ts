/**
 * URL Normalization Utility
 * Removes UTM parameters, follows redirects, and extracts canonical URLs
 */

/**
 * Remove tracking parameters from URL
 */
export function removeTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Common tracking parameters to remove
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'msclkid',
      '_ga',
      'mc_cid',
      'mc_eid',
    ];
    
    trackingParams.forEach((param) => {
      urlObj.searchParams.delete(param);
    });
    
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Extract canonical URL from HTML content
 */
export function extractCanonicalUrl(html: string, fallbackUrl: string): string {
  // Look for <link rel="canonical" href="...">
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonicalMatch) {
    return canonicalMatch[1];
  }
  
  // Look for og:url meta tag
  const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  if (ogUrlMatch) {
    return ogUrlMatch[1];
  }
  
  return fallbackUrl;
}

/**
 * Normalize URL: remove fragments, sort query params, lowercase domain
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Lowercase hostname
    urlObj.hostname = urlObj.hostname.toLowerCase();
    
    // Remove fragment
    urlObj.hash = '';
    
    // Sort query parameters
    const params = Array.from(urlObj.searchParams.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    urlObj.search = '';
    params.forEach(([key, value]) => {
      urlObj.searchParams.append(key, value);
    });
    
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Full URL normalization pipeline
 */
export function normalizeArticleUrl(url: string): string {
  // Step 1: Remove tracking parameters
  let normalized = removeTrackingParams(url);
  
  // Step 2: Normalize structure
  normalized = normalizeUrl(normalized);
  
  return normalized;
}

/**
 * Follow HTTP redirects to get final URL
 * Note: This requires server-side execution
 */
export async function followRedirects(
  url: string,
  maxRedirects: number = 5
): Promise<string> {
  let currentUrl = url;
  let redirectCount = 0;
  
  while (redirectCount < maxRedirects) {
    try {
      const response = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
      });
      
      // Check for redirect status codes
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        
        // Handle relative URLs
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount++;
      } else {
        // No redirect, return current URL
        break;
      }
    } catch {
      // Network error, return current URL
      break;
    }
  }
  
  return currentUrl;
}
