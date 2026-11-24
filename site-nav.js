// One navigation bar for every page of the demo. Included with <script src="site-nav.js"></script>
// at the top of <body>; it marks the current page and works offline.
(function () {
  const pages = [
    ['index.html', 'Lake outlet simulator'],
    ['gate-types.html', 'Gate types and floods'],
    ['gate-assembly.html', 'Assemblies and materials'],
    ['bench.html', 'Bench prototype']
  ];
  const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const css = `
  html{overflow-x:clip}
  .site-nav{position:sticky;top:0;z-index:50;width:100vw;margin-left:calc(50% - 50vw);box-sizing:border-box;background:#102f2a;color:#e6f2ee;font:14px/1.3 system-ui,sans-serif;box-shadow:0 1px 0 rgba(255,255,255,.06),0 4px 14px rgba(0,0,0,.12)}
  .site-nav .in{max-width:1410px;margin:0 auto;padding:0 clamp(12px,3vw,32px);display:flex;align-items:center;gap:18px;min-height:52px;flex-wrap:wrap}
  .site-nav .brand{font-weight:700;letter-spacing:-.01em;color:#fff;text-decoration:none;white-space:nowrap}
  .site-nav .brand small{display:block;font-weight:400;color:#9fc3b7;font-size:11.5px}
  .site-nav ul{list-style:none;margin:0 0 0 auto;padding:0;display:flex;gap:4px;flex-wrap:wrap}
  .site-nav a.pg{display:block;color:#cfe5dd;text-decoration:none;padding:8px 12px;border-radius:7px}
  .site-nav a.pg:hover{background:rgba(255,255,255,.08);color:#fff}
  .site-nav a.pg[aria-current=page]{background:#e0a33a;color:#1d2a26;font-weight:600}
  .site-nav a:focus-visible{outline:3px solid #e0a33a;outline-offset:2px}
  @media(max-width:760px){.site-nav ul{margin:0 0 8px;width:100%;overflow-x:auto;flex-wrap:nowrap}.site-nav a.pg{white-space:nowrap;padding:7px 10px}}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const nav = document.createElement('nav'); nav.className = 'site-nav'; nav.setAttribute('aria-label', 'Site');
  nav.innerHTML = '<div class="in"><a class="brand" href="index.html">Bengaluru sluice gates<small>Technical demo · illustrative values</small></a><ul>' +
    pages.map(([href, label]) => `<li><a class="pg" href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a></li>`).join('') + '</ul></div>';
  const mount = () => {
    document.body.insertBefore(nav, document.body.firstChild);
    const pt = parseFloat(getComputedStyle(document.body).paddingTop) || 0; // pages with body padding: pull the bar to the top edge
    nav.style.marginTop = -pt + 'px'; if (pt) nav.style.marginBottom = '16px';
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
