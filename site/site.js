// TEA project site: reveal sections as they scroll in, and the copy button. No libraries.
document.documentElement.classList.add('js');

const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        reveal.unobserve(e.target);
      }
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
);
document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    const label = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = label), 1600);
  });
});
