/* Keep sheets inside the visible screen when a mobile keyboard or browser toolbar changes its height. */
(() => {
  const root = document.documentElement;
  if (!root?.style?.setProperty) return;
  let frame = 0, restingHeight = 0;
  function update() {
    frame = 0;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    if (!(height > 0)) return;
    const editing = !!document.activeElement?.matches?.('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]),[contenteditable="true"]');
    if (!editing) restingHeight = height;
    const keyboard = !!window.matchMedia?.('(pointer:coarse)')?.matches && editing && Math.max(window.innerHeight || height, restingHeight) - height > 110;
    root.style.setProperty('--viewport-height', Math.round(height) + 'px');
    root.style.setProperty('--viewport-top', Math.round(viewport?.offsetTop || 0) + 'px');
    root.dataset.keyboard = String(keyboard);
  }
  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(update);
  }
  update();
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('orientationchange', () => { restingHeight=0;schedule(); }, {passive:true});
  window.visualViewport?.addEventListener('resize', schedule, {passive:true});
  window.visualViewport?.addEventListener('scroll', schedule, {passive:true});
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
})();
