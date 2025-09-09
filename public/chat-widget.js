(function(){
  try {
    var s = document.currentScript;
    var siteId = (s && s.dataset && s.dataset.siteId) || 'default';
    var theme = (s && s.dataset && s.dataset.theme) || 'dark';
    var position = (s && s.dataset && s.dataset.position) || 'bottom-right';

    var wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.zIndex = '999999';

    var spacing = '24px';
    if (position === 'bottom-right') { wrapper.style.bottom = spacing; wrapper.style.right = spacing; }
    else if (position === 'bottom-left') { wrapper.style.bottom = spacing; wrapper.style.left = spacing; }
    else if (position === 'top-right') { wrapper.style.top = spacing; wrapper.style.right = spacing; }
    else if (position === 'top-left') { wrapper.style.top = spacing; wrapper.style.left = spacing; }
    else { wrapper.style.bottom = spacing; wrapper.style.right = spacing; }

    var iframe = document.createElement('iframe');
    var origin = (new URL(s && s.src || window.location.href)).origin; // default to same origin if served locally
    iframe.src = origin + '/embed/chat.html?site=' + encodeURIComponent(siteId) + '&theme=' + encodeURIComponent(theme);
    iframe.allow = 'clipboard-write';
    iframe.style.width = '360px';
    iframe.style.height = '540px';
    iframe.style.border = '0';
    iframe.style.borderRadius = '12px';
    iframe.style.boxShadow = '0 8px 24px rgba(0,0,0,.2)';

    wrapper.appendChild(iframe);
    document.addEventListener('DOMContentLoaded', function(){
      document.body.appendChild(wrapper);
    });

    // Optional: auto-resize
    window.addEventListener('message', function(e){
      try {
        var expected = origin;
        if (e.origin !== expected) return;
        if (e.data && e.data.type === 'resize' && e.data.height) {
          iframe.style.height = e.data.height + 'px';
        }
      } catch(_e) {}
    });
  } catch (err) { console && console.error && console.error('[chat-widget] failed to init', err); }
})();


