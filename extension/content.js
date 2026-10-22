/**
 * Attendease CCBP Sync — Content Script
 * ══════════════════════════════════════
 * Injected into niat-instructor-platform.ccbp.in
 * 
 * This script adds a small floating badge on the CCBP page to remind
 * the instructor they have the Attendease extension active.
 * The actual scraping is done via chrome.scripting.executeScript from popup.js.
 */

(function () {
  'use strict';

  // Don't inject twice
  if (document.getElementById('attendease-ext-badge')) return;

  // Create the floating badge
  const badge = document.createElement('div');
  badge.id = 'attendease-ext-badge';
  badge.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke-linecap="round"/>
    </svg>
    <span>Attendease Ready</span>
  `;
  
  document.body.appendChild(badge);

  // Auto-hide after 5 seconds, show on hover
  setTimeout(() => {
    badge.classList.add('minimized');
  }, 5000);

  badge.addEventListener('mouseenter', () => {
    badge.classList.remove('minimized');
  });

  badge.addEventListener('mouseleave', () => {
    setTimeout(() => {
      badge.classList.add('minimized');
    }, 2000);
  });
})();
