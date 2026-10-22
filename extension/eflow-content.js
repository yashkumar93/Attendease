/**
 * eFlow Content Script — Attendease eFlow Sync
 * ══════════════════════════════════════════════
 * Injected on eflow.geetauniversity.com pages.
 * Provides a floating badge so the instructor can
 * trigger auto-mark from directly on the eFlow page.
 * All heavy logic runs in popup.js via chrome.scripting.executeScript.
 */

(function () {
  if (document.getElementById('attendease-eflow-badge')) return;

  const badge = document.createElement('div');
  badge.id = 'attendease-eflow-badge';
  badge.innerHTML = `
    <span id="attendease-eflow-icon">🎓</span>
    <span id="attendease-eflow-label">Attendease</span>
  `;
  badge.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    font-family: Inter, sans-serif;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: 50px;
    box-shadow: 0 4px 20px rgba(99,102,241,0.45);
    cursor: pointer;
    user-select: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  `;
  badge.title = 'Open Attendease eFlow Sync';
  badge.addEventListener('mouseenter', () => {
    badge.style.transform = 'scale(1.05)';
    badge.style.boxShadow = '0 6px 28px rgba(99,102,241,0.6)';
  });
  badge.addEventListener('mouseleave', () => {
    badge.style.transform = 'scale(1)';
    badge.style.boxShadow = '0 4px 20px rgba(99,102,241,0.45)';
  });

  document.body.appendChild(badge);
})();
