/**
 * 조이 아이스핀 360 i-Size 랜딩 페이지 인터랙션 스크립트 (script.js)
 * Vanilla JavaScript (No React, No external dependencies)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const header = document.getElementById('header');
  const heroSection = document.getElementById('hero');
  const finalCtaSection = document.getElementById('final-cta');
  const stickyCta = document.getElementById('sticky-cta');
  const navLinks = document.querySelectorAll('.nav-link');
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  const revealElements = document.querySelectorAll('.reveal');

  // Modals & Lightbox
  const ctaModal = document.getElementById('cta-modal');
  const ctaSourceLabel = document.getElementById('modal-clicked-source');
  const modalCloseBtn = ctaModal?.querySelector('.modal-close-btn');
  const modalConfirmBtn = ctaModal?.querySelector('.btn-modal-confirm');
  
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxCloseBtn = lightbox?.querySelector('.lightbox-close-btn');

  let lastFocusedElement = null;

  /* --------------------------------------------------------------------------
     1. Smooth Anchor Scrolling with Header Offset Compensation
     -------------------------------------------------------------------------- */
  anchorLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerHeight = header ? header.offsetHeight : 64;
        const targetTop = targetEl.getBoundingClientRect().top + window.pageYOffset - headerHeight;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({
          top: targetTop,
          behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });

        // Set focus for accessibility without breaking smooth scroll
        targetEl.setAttribute('tabindex', '-1');
        targetEl.focus({ preventScroll: true });
      }
    });
  });

  /* --------------------------------------------------------------------------
     2. Header & Active Navigation Tracking via IntersectionObserver
     -------------------------------------------------------------------------- */
  const trackedSections = document.querySelectorAll('main > section');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (href === `#${id}`) {
            link.classList.add('is-active');
            link.setAttribute('aria-current', 'true');
          } else {
            link.classList.remove('is-active');
            link.removeAttribute('aria-current');
          }
        });
      }
    });
  }, {
    rootMargin: '-30% 0px -60% 0px'
  });

  trackedSections.forEach(sec => sectionObserver.observe(sec));

  /* --------------------------------------------------------------------------
     3. Header Background & Sticky CTA Bar Control via Scroll Observer
     -------------------------------------------------------------------------- */
  let isHeroPast = false;
  let isFinalCtaVisible = false;

  const updateHeaderAndSticky = () => {
    // Header Style
    if (header) {
      if (isFinalCtaVisible) {
        header.classList.remove('is-solid');
        header.classList.add('is-noir-solid');
      } else if (isHeroPast) {
        header.classList.remove('is-noir-solid');
        header.classList.add('is-solid');
      } else {
        header.classList.remove('is-solid');
        header.classList.remove('is-noir-solid');
      }
    }

    // Sticky CTA Bar Style & Accessibility
    if (stickyCta) {
      if (isHeroPast && !isFinalCtaVisible) {
        stickyCta.classList.add('is-visible');
        stickyCta.setAttribute('aria-hidden', 'false');
        stickyCta.removeAttribute('inert');
      } else {
        stickyCta.classList.remove('is-visible');
        stickyCta.setAttribute('aria-hidden', 'true');
        stickyCta.setAttribute('inert', '');
      }
    }
  };

  if (heroSection) {
    const heroObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // Hero is considered passed when its intersection ratio is <= 0.15
        isHeroPast = !entry.isIntersecting;
        updateHeaderAndSticky();
      });
    }, { threshold: [0.15] });

    heroObserver.observe(heroSection);
  }

  if (finalCtaSection) {
    const finalCtaObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isFinalCtaVisible = entry.isIntersecting;
        updateHeaderAndSticky();
      });
    }, { threshold: [0.1] });

    finalCtaObserver.observe(finalCtaSection);
  }

  /* --------------------------------------------------------------------------
     4. FAQ Accordion Interaction (Accessible ARIA Toggle)
     -------------------------------------------------------------------------- */
  const accordionBtns = document.querySelectorAll('.accordion-btn');

  accordionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      const bodyId = btn.getAttribute('aria-controls');
      const bodyEl = document.getElementById(bodyId);

      if (!bodyEl) return;

      if (isExpanded) {
        btn.setAttribute('aria-expanded', 'false');
        bodyEl.setAttribute('hidden', '');
        btn.closest('.accordion-item')?.classList.remove('is-open');
      } else {
        btn.setAttribute('aria-expanded', 'true');
        bodyEl.removeAttribute('hidden');
        btn.closest('.accordion-item')?.classList.add('is-open');
      }
    });
  });

  /* --------------------------------------------------------------------------
     5. CTA Buttons Modal ('아직 준비 중입니다' 안내 모달)
     -------------------------------------------------------------------------- */
  const ctaButtons = document.querySelectorAll('[data-cta]');

  const openCtaModal = (sourceType) => {
    lastFocusedElement = document.activeElement;

    // Friendly source text for user inspection
    const sourceMap = {
      'hero': '히어로 첫 화면 메인 버튼',
      'final': '하단 최종 구매 제안 버튼',
      'sticky': '하단 스티키 플로팅 바',
      'header': '상단 헤더 바로가기'
    };

    if (ctaSourceLabel) {
      ctaSourceLabel.textContent = sourceMap[sourceType] || 'CTA 버튼';
    }

    if (ctaModal) {
      ctaModal.removeAttribute('hidden');
      modalConfirmBtn?.focus();
    }
  };

  const closeCtaModal = () => {
    if (ctaModal) {
      ctaModal.setAttribute('hidden', '');
      if (lastFocusedElement) {
        lastFocusedElement.focus();
      }
    }
  };

  ctaButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // If it's a link to #final-cta, allow default navigation unless specified
      const href = btn.getAttribute('href');
      if (href && href.startsWith('#')) {
        return; // smooth scroll takes care of it
      }
      // 실제 쿠팡 파트너스 링크(외부 URL)는 모달 없이 새 탭으로 바로 이동
      if (href && /^https?:\/\//.test(href)) {
        return;
      }
      e.preventDefault();
      const ctaType = btn.getAttribute('data-cta');
      openCtaModal(ctaType);
    });
  });

  modalCloseBtn?.addEventListener('click', closeCtaModal);
  modalConfirmBtn?.addEventListener('click', closeCtaModal);

  ctaModal?.addEventListener('click', (e) => {
    if (e.target === ctaModal) {
      closeCtaModal();
    }
  });

  /* --------------------------------------------------------------------------
     6. Image Lightbox Interaction (Zoomable Proof Images)
     -------------------------------------------------------------------------- */
  const zoomableImages = document.querySelectorAll('[data-lightbox]');

  const openLightbox = (src, caption) => {
    lastFocusedElement = document.activeElement;

    if (lightbox && lightboxImg) {
      lightboxImg.src = src;
      lightboxImg.alt = caption || '확대 이미지';
      if (lightboxCaption) {
        lightboxCaption.textContent = caption || '';
      }
      lightbox.removeAttribute('hidden');
      lightboxCloseBtn?.focus();
    }
  };

  const closeLightbox = () => {
    if (lightbox) {
      lightbox.setAttribute('hidden', '');
      if (lightboxImg) {
        lightboxImg.src = '';
      }
      if (lastFocusedElement) {
        lastFocusedElement.focus();
      }
    }
  };

  zoomableImages.forEach(img => {
    img.addEventListener('click', () => {
      const src = img.getAttribute('data-lightbox') || img.src;
      const caption = img.getAttribute('data-caption') || img.alt;
      openLightbox(src, caption);
    });

    // Support Enter or Space on images
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        img.click();
      }
    });
  });

  lightboxCloseBtn?.addEventListener('click', closeLightbox);
  lightbox?.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox-media-wrap')) {
      closeLightbox();
    }
  });

  /* --------------------------------------------------------------------------
     7. Global Keydown Handler (ESC to close active modals)
     -------------------------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (ctaModal && !ctaModal.hasAttribute('hidden')) {
        closeCtaModal();
      } else if (lightbox && !lightbox.hasAttribute('hidden')) {
        closeLightbox();
      }
    }
  });

  /* --------------------------------------------------------------------------
     8. Scroll Reveal Observer
     -------------------------------------------------------------------------- */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    revealElements.forEach(el => el.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -60px 0px',
      threshold: 0.1
    });

    revealElements.forEach(el => revealObserver.observe(el));
  }

  /* --------------------------------------------------------------------------
     9. Interactive Before & After Motion Slider
     -------------------------------------------------------------------------- */
  const comparisonSlider = document.getElementById('comparisonSlider');
  const sliderLine = document.getElementById('sliderLine');
  const afterLayer = document.getElementById('afterLayer');
  const sliderHandle = sliderLine?.querySelector('.slider-handle');

  if (comparisonSlider && sliderLine && afterLayer) {
    let isDraggingSlider = false;

    const setSliderPosition = (percentage) => {
      const clamped = Math.max(5, Math.min(95, percentage));
      sliderLine.style.left = `${clamped}%`;
      afterLayer.style.clipPath = `polygon(${clamped}% 0, 100% 0, 100% 100%, ${clamped}% 100%)`;
      if (sliderHandle) {
        sliderHandle.setAttribute('aria-valuenow', Math.round(clamped));
      }
    };

    const handlePointerMove = (e) => {
      if (!isDraggingSlider) return;
      const rect = comparisonSlider.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
      if (clientX !== undefined) {
        const offset = clientX - rect.left;
        const percentage = (offset / rect.width) * 100;
        setSliderPosition(percentage);
      }
    };

    const startDrag = (e) => {
      isDraggingSlider = true;
      comparisonSlider.classList.add('is-dragging');
      handlePointerMove(e);
    };

    const stopDrag = () => {
      if (isDraggingSlider) {
        isDraggingSlider = false;
        comparisonSlider.classList.remove('is-dragging');
      }
    };

    comparisonSlider.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopDrag);

    comparisonSlider.addEventListener('touchstart', startDrag, { passive: true });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('touchend', stopDrag);

    // Keyboard support for accessibility
    sliderHandle?.addEventListener('keydown', (e) => {
      const currentVal = parseFloat(sliderHandle.getAttribute('aria-valuenow') || '50');
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSliderPosition(currentVal - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSliderPosition(currentVal + 5);
      }
    });
  }

  /* 10~12. 각도·회전·측면 보호대 시뮬레이터는 v2에서 삭제 (3D 뷰어는 seat3d-v2.js) */

  /* --------------------------------------------------------------------------
     13. Hero Image 3D Parallax Tilt (Desktop only)
     -------------------------------------------------------------------------- */
  const heroTiltCard = document.getElementById('heroTiltCard');
  if (heroTiltCard && window.innerWidth >= 1024 && !prefersReducedMotion) {
    heroTiltCard.addEventListener('mousemove', (e) => {
      const rect = heroTiltCard.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const rotateX = (-y / (rect.height / 2)) * 6;
      const rotateY = (x / (rect.width / 2)) * 6;
      heroTiltCard.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
    });

    heroTiltCard.addEventListener('mouseleave', () => {
      heroTiltCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    });
  }
});

