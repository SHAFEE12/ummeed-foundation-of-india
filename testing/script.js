const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const pageSections = document.querySelectorAll('.section');
const mobileNavQuery = window.matchMedia('(max-width: 900px)');
const fallbackFormspreeEndpoint = 'https://formspree.io/f/mqeyppqb';
const configuredFormspreeEndpoint = (document.body?.dataset?.formspreeEndpoint || '').trim();
const formspreeEndpoint = /^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(configuredFormspreeEndpoint)
  ? configuredFormspreeEndpoint
  : fallbackFormspreeEndpoint;
const isFormspreeReady = /^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(formspreeEndpoint);

function ensureStatusElement(form) {
  let statusElement = form.querySelector('.form-status');
  if (statusElement instanceof HTMLElement) return statusElement;

  statusElement = document.createElement('p');
  statusElement.className = 'form-status';
  statusElement.setAttribute('role', 'status');
  statusElement.setAttribute('aria-live', 'polite');
  form.appendChild(statusElement);
  return statusElement;
}

function setFormStatus(form, message, tone = '') {
  const statusElement = ensureStatusElement(form);
  statusElement.textContent = message;
  statusElement.classList.remove('is-error', 'is-success');
  if (tone === 'error') statusElement.classList.add('is-error');
  if (tone === 'success') statusElement.classList.add('is-success');
}

function upsertHiddenInput(form, name, value) {
  let input = form.querySelector(`input[name="${name}"]`);
  if (!(input instanceof HTMLInputElement)) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    form.prepend(input);
  }
  input.value = value;
}

function ensureAntiSpamFields(form) {
  let honeypotInput = form.querySelector('input[name="_gotcha"]');
  if (!(honeypotInput instanceof HTMLInputElement)) {
    const honeypotWrap = document.createElement('label');
    honeypotWrap.className = 'form-honeypot';
    honeypotWrap.setAttribute('aria-hidden', 'true');
    honeypotWrap.style.position = 'absolute';
    honeypotWrap.style.left = '-5000px';
    honeypotWrap.style.width = '1px';
    honeypotWrap.style.height = '1px';
    honeypotWrap.style.overflow = 'hidden';
    honeypotWrap.style.opacity = '0';
    honeypotWrap.style.pointerEvents = 'none';
    honeypotWrap.textContent = 'Leave this field empty';

    honeypotInput = document.createElement('input');
    honeypotInput.type = 'text';
    honeypotInput.name = '_gotcha';
    honeypotInput.autocomplete = 'off';
    honeypotInput.tabIndex = -1;
    honeypotInput.setAttribute('aria-hidden', 'true');
    honeypotInput.setAttribute('autocomplete', 'new-password');
    honeypotWrap.appendChild(honeypotInput);
    form.appendChild(honeypotWrap);
  }

  let startedAtInput = form.querySelector('input[name="formStartedAt"]');
  if (!(startedAtInput instanceof HTMLInputElement)) {
    startedAtInput = document.createElement('input');
    startedAtInput.type = 'hidden';
    startedAtInput.name = 'formStartedAt';
    startedAtInput.value = String(Date.now());
    form.prepend(startedAtInput);
  } else if (!startedAtInput.value) {
    startedAtInput.value = String(Date.now());
  }

  const minLengthRules = [
    { name: 'message', min: 20 },
    { name: 'partnershipMessage', min: 30 },
    { name: 'chapterReason', min: 30 },
    { name: 'proposedActivities', min: 20 }
  ];

  minLengthRules.forEach((rule) => {
    const field = form.querySelector(`[name="${rule.name}"]`);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    if (!field.required) return;
    if (field.minLength < rule.min) {
      field.minLength = rule.min;
    }
  });
}

function validateAntiSpamSubmission(form) {
  const honeypot = form.querySelector('input[name="_gotcha"]');
  if (honeypot instanceof HTMLInputElement && honeypot.value.trim() !== '') {
    return 'Unable to send right now. Please refresh and try again.';
  }

  const startedAtField = form.querySelector('input[name="formStartedAt"]');
  if (startedAtField instanceof HTMLInputElement) {
    const startedAt = Number(startedAtField.value);
    const elapsedMs = Number.isFinite(startedAt) ? Date.now() - startedAt : NaN;
    if (Number.isFinite(elapsedMs) && elapsedMs < 4000) {
      return 'Please wait a few seconds before submitting.';
    }
  }

  const lengthChecks = [
    { name: 'message', min: 20, label: 'Message' },
    { name: 'partnershipMessage', min: 30, label: 'Partnership idea' },
    { name: 'chapterReason', min: 30, label: 'Chapter reason' },
    { name: 'proposedActivities', min: 20, label: 'Proposed activities' }
  ];

  for (const check of lengthChecks) {
    const field = form.querySelector(`[name="${check.name}"]`);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) continue;
    if (!field.required || field.disabled) continue;
    if (field.value.trim().length < check.min) {
      return `${check.label} should be at least ${check.min} characters.`;
    }
  }

  return '';
}

function configureFormspreeForm(form, formType) {
  form.setAttribute('method', 'POST');
  form.method = 'POST';
  // Required for file inputs (for example payment screenshot uploads).
  form.setAttribute('enctype', 'multipart/form-data');
  form.enctype = 'multipart/form-data';
  if (isFormspreeReady) {
    form.setAttribute('action', formspreeEndpoint);
    form.action = formspreeEndpoint;
  }

  if (formType) {
    upsertHiddenInput(form, 'formType', formType);
    upsertHiddenInput(form, '_subject', `${formType} Submission`);
  }
  upsertHiddenInput(form, 'sourcePage', window.location.href);
  ensureAntiSpamFields(form);
}

async function submitFormToFormspree(form, submitButton, options = {}) {
  const sendingLabel = options.sendingLabel || 'Sending...';

  if (!isFormspreeReady) {
    setFormStatus(
      form,
      'Set your Formspree endpoint first in the body data-formspree-endpoint attribute.',
      'error'
    );
    return;
  }

  const antiSpamError = validateAntiSpamSubmission(form);
  if (antiSpamError) {
    setFormStatus(form, antiSpamError, 'error');
    return;
  }

  setFormStatus(form, 'Redirecting to secure submission...', 'success');
  submitButton.disabled = true;
  submitButton.textContent = sendingLabel;
  configureFormspreeForm(form, '');
  HTMLFormElement.prototype.submit.call(form);
}

function buildUpiIntentUrl(upiSupport) {
  const upiId = (upiSupport?.upiId || '').trim();
  if (!upiId) return '';

  const params = new URLSearchParams({
    pa: upiId,
    cu: 'INR'
  });
  return `upi://pay?${params.toString()}`;
}

// Defensive guard: ensure involved/contact forms always submit as POST to Formspree.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches('.contact-form, .ufi-modal-form')) return;

  const typeField = form.querySelector('input[name="formType"]');
  const formType = typeField instanceof HTMLInputElement ? typeField.value : 'Get Involved';
  configureFormspreeForm(form, formType);
}, true);

function closeMenu() {
  if (!menuToggle || !nav) return;
  nav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

if (menuToggle && nav) {
  menuToggle.setAttribute('aria-expanded', 'false');

  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('open', !expanded);
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      closeMenu();
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!nav.contains(target) && !menuToggle.contains(target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  const syncMenuByViewport = () => {
    if (!mobileNavQuery.matches) {
      closeMenu();
    }
  };

  window.addEventListener('resize', syncMenuByViewport);
  syncMenuByViewport();
}

if (pageSections.length) {
  pageSections.forEach((section) => {
    section.setAttribute('data-reveal', '');
  });

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );

  pageSections.forEach((section) => revealObserver.observe(section));
}

const counters = document.querySelectorAll('.impact-num');
const counterObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const el = entry.target;
      const target = Number(el.getAttribute('data-target'));
      const duration = 1400;
      const start = performance.now();

      const animate = (time) => {
        const progress = Math.min((time - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(target * eased).toLocaleString();
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          el.textContent = target.toLocaleString();
        }
      };

      requestAnimationFrame(animate);
      observer.unobserve(el);
    });
  },
  { threshold: 0.4 }
);

counters.forEach((counter) => counterObserver.observe(counter));

const testimonials = [
  {
    quote: 'Because of ummeed foundation, i received guidance for my studies. Their support helped me continue my education with confidance.',
    author: 'Ashutosh, Student'
  },
  {
    quote: 'I truly believe this initiative will grow into something meaningful for many people. Every step we take is driven by passion and a commitment to making a difference.',
    author: 'Shafee Ahmad'
  },
  {
    quote: 'The team is dedicated and genuinely cares about helping people. Their work is bringing hope to the  community.',
    author: 'Raushan'
  }
];

const testimonialTrack = document.getElementById('testimonialTrack');

function createTestimonialCard(item) {
  const card = document.createElement('article');
  card.className = 'testimonial-card';

  const quote = document.createElement('blockquote');
  quote.textContent = `"${item.quote}"`;

  const author = document.createElement('cite');
  author.textContent = item.author;

  card.append(quote, author);
  return card;
}

if (testimonialTrack && testimonials.length) {
  const loopItems = testimonials.concat(testimonials);
  const fragment = document.createDocumentFragment();
  loopItems.forEach((item) => {
    fragment.appendChild(createTestimonialCard(item));
  });
  testimonialTrack.replaceChildren(fragment);
}

const legacyGalleryItems = Array.from(document.querySelectorAll('#gallery .gallery-item'));
const modernGalleryCards = Array.from(document.querySelectorAll('#gallery .v-gallery-card'));
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const closeLightbox = document.getElementById('closeLightbox');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const lightboxCounter = document.getElementById('lightboxCounter');

const galleryItems = [];

modernGalleryCards.forEach((card) => {
  const image = card.querySelector('img');
  if (!(image instanceof HTMLImageElement)) return;

  const src = (
    card.getAttribute('data-full') ||
    image.getAttribute('data-full') ||
    image.currentSrc ||
    image.getAttribute('src') ||
    ''
  ).trim();
  if (!src) return;

  const caption = (card.getAttribute('data-caption') || image.getAttribute('data-caption') || '').trim();
  const alt = (image.getAttribute('alt') || '').trim();

  if (!(card instanceof HTMLButtonElement || card instanceof HTMLAnchorElement)) {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    if (!card.getAttribute('aria-label')) {
      card.setAttribute('aria-label', alt ? `Open image: ${alt}` : 'Open gallery image');
    }
  }

  galleryItems.push({ trigger: card, src, caption, alt });
});

legacyGalleryItems.forEach((item) => {
  const src = (item.getAttribute('data-full') || '').trim();
  if (!src) return;
  const caption = (item.getAttribute('data-caption') || '').trim();
  const image = item.querySelector('img');
  const alt = image instanceof HTMLImageElement ? (image.getAttribute('alt') || '').trim() : '';
  galleryItems.push({ trigger: item, src, caption, alt });
});

if (galleryItems.length && lightbox && lightboxImage && closeLightbox) {
  const galleryEntries = galleryItems.map((item) => ({
    src: item.src,
    caption: item.caption,
    alt: item.alt
  }));

  let activeGalleryIndex = 0;
  let lastOpenScrollY = 0;

  const normalizeGalleryIndex = (index) => {
    if (!galleryEntries.length) return 0;
    const lastIndex = galleryEntries.length - 1;
    if (index < 0) return lastIndex;
    if (index > lastIndex) return 0;
    return index;
  };

  const renderLightboxFrame = (index) => {
    if (!galleryEntries.length) return;
    activeGalleryIndex = normalizeGalleryIndex(index);
    const activeEntry = galleryEntries[activeGalleryIndex];
    lightboxImage.setAttribute('src', activeEntry.src);
    lightboxImage.setAttribute('alt', activeEntry.alt || 'Gallery preview');

    if (lightboxCounter instanceof HTMLElement) {
      const baseCounter = `${activeGalleryIndex + 1} / ${galleryEntries.length}`;
      lightboxCounter.textContent = activeEntry.caption ? `${baseCounter} - ${activeEntry.caption}` : baseCounter;
    }
  };

  const openLightboxAt = (index) => {
    lastOpenScrollY = window.scrollY || window.pageYOffset || 0;
    renderLightboxFrame(index);
    if (!lightbox.open) {
      lightbox.showModal();
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: lastOpenScrollY, left: 0, behavior: 'auto' });
    });
  };

  const stepLightbox = (step) => {
    if (!galleryEntries.length) return;
    renderLightboxFrame(activeGalleryIndex + step);
  };

  galleryItems.forEach((item, index) => {
    item.trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openLightboxAt(index);
    });

    if (!(item.trigger instanceof HTMLButtonElement || item.trigger instanceof HTMLAnchorElement)) {
      item.trigger.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openLightboxAt(index);
      });
    }
  });

  closeLightbox.addEventListener('click', () => lightbox.close());
  if (lightboxPrev instanceof HTMLButtonElement) {
    lightboxPrev.addEventListener('click', () => stepLightbox(-1));
  }
  if (lightboxNext instanceof HTMLButtonElement) {
    lightboxNext.addEventListener('click', () => stepLightbox(1));
  }

  lightbox.addEventListener('click', (event) => {
    const rect = lightbox.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (clickedOutside) {
      lightbox.close();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && lightbox.open) {
      lightbox.close();
    }
    if (event.key === 'ArrowRight' && lightbox.open && galleryEntries.length) {
      stepLightbox(1);
    }
    if (event.key === 'ArrowLeft' && lightbox.open && galleryEntries.length) {
      stepLightbox(-1);
    }
  });
}

function initMobileGalleryProgressiveReveal() {
  const gallerySection = document.getElementById('gallery');
  if (!(gallerySection instanceof HTMLElement)) return;

  const allGalleryItems = Array.from(gallerySection.querySelectorAll('.gallery-item'));
  if (allGalleryItems.length <= 3) return;

  const mobileGalleryQuery = window.matchMedia('(max-width: 768px)');
  let visibleCount = allGalleryItems.length;
  let onScrollReveal = null;
  let lastScrollY = 0;
  let lastRevealAtScrollY = 0;

  const unbindScrollReveal = () => {
    if (typeof onScrollReveal === 'function') {
      window.removeEventListener('scroll', onScrollReveal);
      onScrollReveal = null;
    }
  };

  const setItemVisible = (item, isVisible) => {
    item.hidden = !isVisible;
    if (!isVisible) {
      item.classList.remove('gallery-item-revealed');
    }
  };

  const showAllGalleryItems = () => {
    allGalleryItems.forEach((item) => {
      setItemVisible(item, true);
    });
  };

  const revealNextItem = () => {
    if (visibleCount >= allGalleryItems.length) return;
    const nextItem = allGalleryItems[visibleCount];
    setItemVisible(nextItem, true);
    nextItem.classList.add('gallery-item-revealed');
    window.setTimeout(() => nextItem.classList.remove('gallery-item-revealed'), 350);
    visibleCount += 1;

    if (visibleCount >= allGalleryItems.length) {
      unbindScrollReveal();
    }
  };

  const bindScrollReveal = () => {
    if (typeof onScrollReveal === 'function') return;

    onScrollReveal = () => {
      if (!mobileGalleryQuery.matches) return;
      if (visibleCount >= allGalleryItems.length) return;

      const currentScrollY = window.scrollY || window.pageYOffset || 0;
      const scrollingDown = currentScrollY > lastScrollY;
      lastScrollY = currentScrollY;
      if (!scrollingDown) return;

      const sectionRect = gallerySection.getBoundingClientRect();
      const viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
      const isGalleryInView = sectionRect.top < viewportBottom && sectionRect.bottom > 0;
      if (!isGalleryInView) return;

      const nearSectionBottom = sectionRect.bottom <= viewportBottom + 96;
      const scrolledEnoughSinceLastReveal = currentScrollY - lastRevealAtScrollY >= 140;

      if (nearSectionBottom || scrolledEnoughSinceLastReveal) {
        revealNextItem();
        lastRevealAtScrollY = currentScrollY;
      }
    };

    window.addEventListener('scroll', onScrollReveal, { passive: true });
  };

  const enableMobileProgressiveReveal = () => {
    unbindScrollReveal();

    visibleCount = Math.min(3, allGalleryItems.length);
    allGalleryItems.forEach((item, index) => {
      setItemVisible(item, index < visibleCount);
    });

    if (visibleCount >= allGalleryItems.length) return;

    lastScrollY = window.scrollY || window.pageYOffset || 0;
    lastRevealAtScrollY = lastScrollY;
    bindScrollReveal();
    onScrollReveal();
  };

  const syncRevealMode = () => {
    if (mobileGalleryQuery.matches) {
      enableMobileProgressiveReveal();
      return;
    }

    unbindScrollReveal();
    showAllGalleryItems();
  };

  if (typeof mobileGalleryQuery.addEventListener === 'function') {
    mobileGalleryQuery.addEventListener('change', syncRevealMode);
  } else {
    window.addEventListener('resize', syncRevealMode);
  }

  syncRevealMode();
}

initMobileGalleryProgressiveReveal();

const contactForm = document.querySelector('.contact-form');
if (contactForm) {
  configureFormspreeForm(contactForm, 'Contact Form');
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = contactForm.querySelector('button[type="submit"]');
    if (!(submitButton instanceof HTMLButtonElement)) return;
    await submitFormToFormspree(contactForm, submitButton, {
      idleLabel: 'Send Message',
      sendingLabel: 'Sending...',
      successLabel: 'Message Sent',
      successDelayMs: 1800
    });
  });
}

function injectModalStyles() {
  if (document.getElementById('ufi-modal-styles')) return;

  const style = document.createElement('style');
  style.id = 'ufi-modal-styles';
  style.textContent = `
    .ufi-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(2, 6, 23, 0.56);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.24s ease, visibility 0.24s ease;
    }

    .ufi-modal-overlay.is-open {
      opacity: 1;
      visibility: visible;
    }

    .ufi-modal-panel {
      width: min(640px, 92vw);
      max-height: 90vh;
      overflow-y: auto;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 18px;
      box-shadow: 0 22px 52px rgba(15, 23, 42, 0.28);
      padding: 20px 20px 18px;
      transform: translateY(14px) scale(0.98);
      transition: transform 0.24s ease;
    }

    .ufi-modal-panel,
    .ufi-modal-panel * {
      font-family: "Inter", sans-serif;
    }

    .ufi-modal-overlay.is-open .ufi-modal-panel {
      transform: translateY(0) scale(1);
    }

    .ufi-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 12px;
    }

    .ufi-modal-title {
      margin: 0;
      font-size: clamp(1.1rem, 2.4vw, 1.4rem);
      color: #0f4c81;
    }

    .ufi-modal-title,
    .ufi-modal-section,
    .ufi-upi-donate h3 {
      background: none;
      -webkit-background-clip: border-box;
      background-clip: border-box;
      -webkit-text-fill-color: currentColor;
      text-shadow: none;
      letter-spacing: 0;
      padding-block: 0;
    }

    .ufi-modal-description {
      margin: 0 0 8px;
      color: #475569;
      font-size: 0.92rem;
      line-height: 1.55;
    }

    .ufi-modal-section {
      margin: 8px 0 2px;
      color: #0f4c81;
      font-size: 0.94rem;
      font-weight: 700;
    }

    .ufi-modal-close {
      border: 0;
      background: transparent;
      font-size: 1.7rem;
      line-height: 1;
      color: #334155;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 8px;
    }

    .ufi-modal-close:hover,
    .ufi-modal-close:focus-visible {
      background: rgba(15, 76, 129, 0.1);
    }

    .ufi-modal-form {
      display: grid;
      gap: 11px;
    }

    .ufi-modal-field {
      display: grid;
      gap: 6px;
      font-size: 0.92rem;
      color: #334155;
      font-weight: 600;
    }

    .ufi-modal-field input,
    .ufi-modal-field textarea,
    .ufi-modal-field select {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 10px 11px;
      font: inherit;
      color: #1f2937;
      background: #ffffff;
    }

    .ufi-modal-field textarea {
      resize: vertical;
      min-height: 92px;
    }

    .ufi-modal-field select[multiple] {
      min-height: 132px;
      padding-right: 6px;
    }

    .ufi-modal-help {
      color: #64748b;
      font-size: 0.82rem;
      line-height: 1.45;
      font-weight: 500;
    }

    .ufi-modal-actions {
      margin-top: 4px;
      display: flex;
      justify-content: flex-end;
    }

    .ufi-donation-options {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .ufi-donation-amount-field {
      gap: 4px;
      font-size: 0.86rem;
    }

    .ufi-donation-choice {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #334155;
      background: rgba(241, 245, 249, 0.9);
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px 6px;
      min-height: 42px;
    }

    .ufi-donation-choice input[type="radio"] {
      margin: 0;
      transform: scale(0.85);
    }

    .ufi-donation-choice-content {
      display: flex;
      align-items: center;
    }

    .ufi-donation-choice-title {
      color: #1e293b;
      font-weight: 700;
      font-size: 0.78rem;
      line-height: 1.1;
    }

    .ufi-donation-choice-note {
      display: none;
    }

    .ufi-custom-amount-field {
      margin-top: 4px;
    }

    .ufi-custom-amount-field[hidden] {
      display: none;
    }

    @media (max-width: 700px) {
      .ufi-donation-options {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .ufi-modal-list {
      margin: 2px 0 4px;
      padding-left: 18px;
      color: #475569;
      font-size: 0.9rem;
      line-height: 1.45;
      display: grid;
      gap: 4px;
    }

    .ufi-upi-donate {
      margin-top: 10px;
      border: 1px dashed #94a3b8;
      border-radius: 12px;
      background: rgba(248, 250, 252, 0.9);
      padding: 12px;
      text-align: center;
      display: grid;
      gap: 6px;
      justify-items: center;
    }

    .ufi-upi-donate h3 {
      margin: 0;
      font-family: "Inter", sans-serif;
      font-size: 0.96rem;
      font-weight: 700;
      color: #0f4c81;
      background: none;
      -webkit-text-fill-color: currentColor;
      text-shadow: none;
    }

    .ufi-upi-qr {
      width: min(200px, 58vw);
      max-width: 200px;
      aspect-ratio: 1 / 1;
      object-fit: contain;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #ffffff;
      padding: 6px;
    }

    .ufi-upi-link {
      display: inline-flex;
      border-radius: 10px;
      text-decoration: none;
      cursor: pointer;
    }

    .ufi-upi-id-line {
      margin: 0;
      color: #334155;
      font-size: 0.9rem;
      line-height: 1.45;
      word-break: break-word;
    }

    .ufi-upi-id {
      color: #0f4c81;
      font-weight: 700;
    }

    .ufi-upi-id-link {
      text-decoration: underline;
      text-underline-offset: 2px;
      text-decoration-thickness: 0.08em;
      cursor: pointer;
    }

    .ufi-upi-pay-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
      padding: 8px 14px;
      border-radius: 999px;
      border: 1px solid #0f4c81;
      background: #0f4c81;
      color: #ffffff;
      text-decoration: none;
      font-size: 0.86rem;
      font-weight: 600;
      line-height: 1.2;
    }

    @media (max-width: 768px) {
      .ufi-modal-overlay {
        padding: 12px;
      }

      .ufi-modal-panel {
        width: min(430px, calc(100vw - 40px));
        max-height: calc(100vh - 96px);
        border-radius: 16px;
        padding: 10px 10px 8px;
      }

      .ufi-modal-header {
        margin-bottom: 6px;
      }

      .ufi-modal-form {
        gap: 6px;
      }

      .ufi-modal-field {
        gap: 3px;
        font-size: 0.86rem;
      }

      .ufi-modal-field input,
      .ufi-modal-field textarea,
      .ufi-modal-field select {
        padding: 7px 9px;
        border-radius: 9px;
      }

      .ufi-modal-field textarea {
        min-height: 64px;
      }

      .ufi-modal-description {
        margin: 0 0 4px;
        font-size: 0.86rem;
      }

      .ufi-upi-donate {
        padding: 8px;
        gap: 5px;
      }

      .ufi-upi-qr {
        width: min(145px, 44vw);
        max-width: 145px;
      }
    }

    @media (max-width: 520px) {
      .ufi-modal-overlay {
        padding: 10px;
      }

      .ufi-modal-panel {
        width: min(370px, calc(100vw - 22px));
        max-height: calc(100vh - 76px);
        border-radius: 14px;
        padding: 9px 8px 7px;
      }

      .ufi-modal-form {
        gap: 5px;
      }

      .ufi-modal-field {
        font-size: 0.82rem;
      }

      .ufi-modal-field textarea {
        min-height: 58px;
      }

      .ufi-donation-options {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 360px) {
      .ufi-donation-options {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

// Shared field renderer used by all form types.
function createFieldElement(field) {
  const fieldLabel = document.createElement('label');
  fieldLabel.className = 'ufi-modal-field';
  fieldLabel.textContent = field.label;

  let inputElement;

  if (field.type === 'textarea') {
    inputElement = document.createElement('textarea');
  } else if (field.type === 'select') {
    inputElement = document.createElement('select');

    const options = Array.isArray(field.options) ? field.options : [];
    options.forEach((option) => {
      const optionElement = document.createElement('option');
      if (typeof option === 'string') {
        optionElement.value = option;
        optionElement.textContent = option;
      } else {
        optionElement.value = option.value;
        optionElement.textContent = option.label;
      }
      inputElement.appendChild(optionElement);
    });

    if (field.multiple) {
      inputElement.multiple = true;
      inputElement.size = field.size || Math.min(options.length, 6);
    }
  } else {
    inputElement = document.createElement('input');
    inputElement.type = field.type || 'text';
  }

  inputElement.name = field.name;
  inputElement.required = field.required !== false;
  inputElement.placeholder = field.placeholder || '';
  if (field.autocomplete) inputElement.autocomplete = field.autocomplete;
  if (field.inputMode && inputElement instanceof HTMLInputElement) {
    inputElement.inputMode = field.inputMode;
  }

  if (field.rows && inputElement instanceof HTMLTextAreaElement) {
    inputElement.rows = field.rows;
  }

  if (typeof field.min !== 'undefined' && inputElement instanceof HTMLInputElement) {
    inputElement.min = String(field.min);
  }

  if (typeof field.max !== 'undefined' && inputElement instanceof HTMLInputElement) {
    inputElement.max = String(field.max);
  }

  if (field.accept && inputElement instanceof HTMLInputElement) {
    inputElement.accept = field.accept;
  }

  fieldLabel.appendChild(inputElement);

  if (field.help) {
    const helpText = document.createElement('small');
    helpText.className = 'ufi-modal-help';
    helpText.textContent = field.help;
    fieldLabel.appendChild(helpText);
  }

  return fieldLabel;
}

function createFormInfoBlock(field) {
  if (field.type === 'list') {
    const listElement = document.createElement('ul');
    listElement.className = 'ufi-modal-list';
    const items = Array.isArray(field.items) ? field.items : [];
    items.forEach((item) => {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      listElement.appendChild(listItem);
    });
    return listElement;
  }

  const element = document.createElement(field.type === 'section' ? 'h4' : 'p');
  element.className = field.type === 'section' ? 'ufi-modal-section' : 'ufi-modal-description';
  element.textContent = field.text;
  return element;
}

function wireModalSubmit(form, config, closeModal) {
  const submitLabel = config.submitLabel || 'Submit';
  const formType = config.title || 'Get Involved';
  configureFormspreeForm(form, formType);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    if (!(submitButton instanceof HTMLButtonElement)) return;
    await submitFormToFormspree(form, submitButton, {
      idleLabel: submitLabel,
      sendingLabel: 'Sending...',
      successLabel: 'Submitted',
      successDelayMs: 900,
      closeOnSuccess: closeModal
    });
  });
}

function createStandardForm(config, closeModal) {
  const form = document.createElement('form');
  form.className = 'ufi-modal-form';
  configureFormspreeForm(form, config.title || 'Get Involved');

  config.fields.forEach((field) => {
    if (field.type === 'section' || field.type === 'description' || field.type === 'list') {
      form.appendChild(createFormInfoBlock(field));
      return;
    }

    form.appendChild(createFieldElement(field));
  });

  const actions = document.createElement('div');
  actions.className = 'ufi-modal-actions';

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'btn';
  submitButton.textContent = config.submitLabel;

  actions.appendChild(submitButton);
  form.appendChild(actions);

  wireModalSubmit(form, config, closeModal);
  return form;
}

function createDonateForm(config, closeModal) {
  const form = document.createElement('form');
  form.className = 'ufi-modal-form';

  if (config.introText) {
    form.appendChild(createFormInfoBlock({ type: 'description', text: config.introText }));
  }

  if (Array.isArray(config.impactStatements) && config.impactStatements.length) {
    form.appendChild(createFormInfoBlock({ type: 'list', items: config.impactStatements }));
  }

  if (config.upiSupport) {
    const upiIntentUrl = buildUpiIntentUrl(config.upiSupport);
    const upiDonate = document.createElement('div');
    upiDonate.className = 'ufi-upi-donate';

    const upiHeading = document.createElement('h3');
    upiHeading.textContent = 'Donate via UPI';
    upiDonate.appendChild(upiHeading);

    const upiQr = document.createElement('img');
    upiQr.className = 'ufi-upi-qr';
    upiQr.src = config.upiSupport.qrImage || 'qr.png';
    upiQr.alt = 'UPI QR Code';
    upiQr.width = 200;
    upiQr.height = 200;
    upiQr.loading = 'lazy';

    if (upiIntentUrl) {
      const upiQrLink = document.createElement('a');
      upiQrLink.className = 'ufi-upi-link';
      upiQrLink.href = upiIntentUrl;
      upiQrLink.setAttribute('aria-label', 'Open UPI app');
      upiQrLink.appendChild(upiQr);
      upiDonate.appendChild(upiQrLink);
    } else {
      upiDonate.appendChild(upiQr);
    }

    const upiIdLine = document.createElement('p');
    upiIdLine.className = 'ufi-upi-id-line';
    upiIdLine.textContent = 'UPI ID: ';

    if (upiIntentUrl) {
      const upiIdLink = document.createElement('a');
      upiIdLink.className = 'ufi-upi-id ufi-upi-id-link';
      upiIdLink.href = upiIntentUrl;
      upiIdLink.textContent = config.upiSupport.upiId || 'ummeedfoundation@upi';
      upiIdLine.appendChild(upiIdLink);
    } else {
      const upiId = document.createElement('span');
      upiId.className = 'ufi-upi-id';
      upiId.textContent = config.upiSupport.upiId || 'ummeedfoundation@upi';
      upiIdLine.appendChild(upiId);
    }
    upiDonate.appendChild(upiIdLine);

    if (upiIntentUrl) {
      const upiPayNow = document.createElement('a');
      upiPayNow.className = 'ufi-upi-pay-btn';
      upiPayNow.href = upiIntentUrl;
      upiPayNow.textContent = 'Pay Now via UPI App';
      upiDonate.appendChild(upiPayNow);
    }

    if (config.upiSupport.note) {
      const upiNote = document.createElement('p');
      upiNote.className = 'ufi-modal-description';
      upiNote.textContent = config.upiSupport.note;
      upiDonate.appendChild(upiNote);
    }

    form.appendChild(upiDonate);
  }
  return form;
}

function createModal(config) {
  // Reusable modal shell: creates overlay, header, body and open/close behavior.
  const overlay = document.createElement('div');
  overlay.className = 'ufi-modal-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('div');
  panel.className = 'ufi-modal-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', config.title);

  const header = document.createElement('div');
  header.className = 'ufi-modal-header';

  const title = document.createElement('h3');
  title.className = 'ufi-modal-title';
  title.textContent = config.title;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ufi-modal-close';
  closeButton.setAttribute('aria-label', 'Close modal');
  closeButton.innerHTML = '&times;';

  header.append(title, closeButton);
  panel.appendChild(header);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let lastActiveElement = null;
  let closeTimer = null;

  const closeModal = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      overlay.style.display = 'none';
      if (lastActiveElement instanceof HTMLElement) {
        lastActiveElement.focus();
      }
    }, 240);
  };

  const form = config.type === 'donate'
    ? createDonateForm(config, closeModal)
    : createStandardForm(config, closeModal);
  panel.appendChild(form);

  const openModal = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    lastActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
    });

    const firstInput = form.querySelector('input, textarea, button');
    if (firstInput instanceof HTMLElement) {
      firstInput.focus();
    }
  };

  closeButton.addEventListener('click', closeModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  return { openModal, closeModal, overlay };
}

function initInvolvedSectionModals() {
  // Maps existing card titles to their respective modal + form configuration.
  const involvedCards = document.querySelectorAll('#involved .involved-cards .card');
  if (!involvedCards.length) return;

  injectModalStyles();

  const modalConfigByHeading = {
    'Volunteer Signup': {
      title: 'Volunteer Form',
      submitLabel: 'Submit',
      fields: [
        {
          type: 'description',
          text: 'Thank you for your interest in joining Ummeed Foundation of India. Your support and time mean a lot to us. Together, even small efforts can bring positive change. We look forward to working with you and spreading hope in our communities.'
        },
        { label: 'Full Name', name: 'fullName', type: 'text' },
        { label: 'Email', name: 'email', type: 'email' },
        { label: 'Phone', name: 'phone', type: 'tel' },
        { label: 'City', name: 'city', type: 'text' },
        { label: 'Skills / Expertise', name: 'skillsExpertise', type: 'text' },
        { label: 'Availability', name: 'availability', type: 'text' },
        { label: 'Message', name: 'message', type: 'textarea', rows: 4 }
      ]
    },
    'Partner With Us': {
      title: 'Partnership Request',
      submitLabel: 'Submit Partnership Request',
      fields: [
        {
          type: 'description',
          text: 'Ummeed Foundation of India welcomes partnerships with schools, universities, NGOs, and corporate organizations that share our vision of improving access to quality education. Together we can create meaningful learning opportunities for students across India.'
        },
        { type: 'section', text: 'Organization Details' },
        { label: 'Organization / Institution Name', name: 'organizationName', type: 'text' },
        {
          label: 'Type of Organization',
          name: 'organizationType',
          type: 'select',
          options: ['School', 'College', 'NGO', 'Company', 'Corporate CSR', 'Other']
        },
        {
          label: 'Website (optional)',
          name: 'website',
          type: 'url',
          required: false,
          placeholder: 'https://example.org'
        },

        { type: 'section', text: 'Contact Person' },
        { label: 'Name of Contact Person', name: 'contactPerson', type: 'text' },
        { label: 'Email Address', name: 'email', type: 'email', autocomplete: 'email' },
        { label: 'Phone Number', name: 'phone', type: 'tel', autocomplete: 'tel', inputMode: 'tel' },

        { type: 'section', text: 'Location' },
        { label: 'City', name: 'city', type: 'text' },
        { label: 'State / Country', name: 'stateCountry', type: 'text' },

        { type: 'section', text: 'Type of Partnership' },
        {
          label: 'How would you like to collaborate?',
          name: 'partnershipTypes',
          type: 'select',
          multiple: true,
          options: [
            'Educational programs for students',
            'Workshops / seminars',
            'Sponsorship or CSR support',
            'Internship opportunities for students',
            'Technology or resource support'
          ],
          help: 'Select one or more options.'
        },

        { type: 'section', text: 'Proposal / Message' },
        { label: 'Partnership Idea', name: 'partnershipMessage', type: 'textarea', rows: 4 }
      ]
    },
    'Campus Chapter': {
      title: 'Campus Chapter Lead Application',
      submitLabel: 'Submit Application',
      fields: [
        {
          type: 'description',
          text: 'The Campus Chapter Lead represents Ummeed Foundation in their college or university. The lead builds a small team of volunteers, organizes awareness activities, and coordinates with the main foundation team to create positive impact on campus.'
        },
        { type: 'section', text: 'Key Responsibilities' },
        {
          type: 'list',
          items: [
            'Build and manage a volunteer team in your college',
            'Organize awareness campaigns or small events',
            'Promote social initiatives on campus',
            'Coordinate with the Ummeed Foundation core team',
            'Share updates about activities and impact'
          ]
        },
        { type: 'section', text: 'What You Will Gain' },
        {
          type: 'list',
          items: [
            'Leadership experience',
            'Certificate of recognition',
            'Opportunity to create real social impact'
          ]
        },
        {
          type: 'description',
          text: 'Monthly Support: ₹500–₹2000 based on chapter activity and available funding.'
        },

        { type: 'section', text: 'Personal Information' },
        { label: 'Full Name', name: 'fullName', type: 'text' },
        { label: 'Email Address', name: 'email', type: 'email', autocomplete: 'email' },
        { label: 'Phone Number', name: 'phone', type: 'tel', autocomplete: 'tel', inputMode: 'tel' },

        { type: 'section', text: 'College Information' },
        { label: 'College / University Name', name: 'collegeUniversity', type: 'text' },
        { label: 'Course / Department', name: 'courseDepartment', type: 'text' },
        { label: 'Year of Study', name: 'yearOfStudy', type: 'text' },

        { type: 'section', text: 'Location' },
        { label: 'City', name: 'city', type: 'text' },
        { label: 'State', name: 'state', type: 'text' },

        { type: 'section', text: 'Leadership Interest' },
        { label: 'Why do you want to start a chapter?', name: 'chapterReason', type: 'textarea', rows: 4 },
        {
          label: 'Any prior leadership or volunteering experience? (optional)',
          name: 'leadershipExperience',
          type: 'textarea',
          rows: 3,
          required: false
        },
        {
          label: 'What activities would you like to organize?',
          name: 'proposedActivities',
          type: 'textarea',
          rows: 4,
          help: 'Examples: mentoring students, education drives, workshops, volunteering programs'
        },

        { type: 'section', text: 'Team Members (Optional)' },
        {
          label: 'Do you already have friends who want to join the chapter?',
          name: 'teamMembers',
          type: 'textarea',
          rows: 3,
          required: false
        },

        { type: 'section', text: 'Commitment' },
        {
          label: 'How many hours per week can you dedicate?',
          name: 'hoursPerWeek',
          type: 'number',
          min: 1,
          placeholder: 'e.g. 4'
        }
      ]
    },
    Donate: {
      title: 'Support Student Learning',
      type: 'donate',
      introText: 'Your support helps Ummeed Foundation of India provide mentorship, educational programs, and scholarships to students who need them most. Every contribution brings us closer to creating equal opportunities for learning.',
      impactStatements: [
        'Supporting students through mentorship programs.',
        'Providing scholarships and educational resources.',
        'Expanding programs to new regions.'
      ],
      upiSupport: {
        upiId: 'usmangaui435@ybl',
        qrImage: 'qr.png',
        note: "Every contribution lights a child's path to education and hope. Thank you for standing with Ummeed Foundation of India."
      }
    }
  };

  const modalByHeading = {};

  Object.keys(modalConfigByHeading).forEach((heading) => {
    modalByHeading[heading] = createModal(modalConfigByHeading[heading]);
  });

  // Allows external triggers (for example hero buttons) to open the same involved modals.
  const modalTriggers = document.querySelectorAll('[data-involved-modal]');
  modalTriggers.forEach((trigger) => {
    const heading = trigger.getAttribute('data-involved-modal')?.trim();
    if (!heading || !modalByHeading[heading]) return;

    const modal = modalByHeading[heading];
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      modal.openModal();
    });
  });

  involvedCards.forEach((card) => {
    const heading = card.querySelector('h3')?.textContent?.trim();
    if (!heading || !modalByHeading[heading]) return;

    const modal = modalByHeading[heading];
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    card.addEventListener('click', () => {
      modal.openModal();
    });

    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      modal.openModal();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    Object.values(modalByHeading).forEach(({ overlay, closeModal }) => {
      if (!overlay.classList.contains('is-open')) return;
      closeModal();
    });
  });
}

initInvolvedSectionModals();


