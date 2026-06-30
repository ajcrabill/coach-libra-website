// scroll reveal
const io = new IntersectionObserver((entries) => {
  entries.forEach(en => { if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
}, {threshold:.16, rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// waitlist → Coach Libra box API (stored in our own DB; approvable from /admin)
const WAITLIST_API = 'https://esbcloud.taild49f53.ts.net/waitlist';
const form = document.getElementById('waitlist');
const done = document.getElementById('formdone');
const note = document.getElementById('formnote');
if (form) form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const first = document.getElementById('first_name');
  const last = document.getElementById('last_name');
  const email = document.getElementById('email');
  const btn = form.querySelector('button');
  if(!first.value.trim()){ first.focus(); return; }
  if(!last.value.trim()){ last.focus(); return; }
  if(!email.value || !email.validity.valid){ email.focus(); return; }
  // Pages that gate by referral (e.g. /esb) add a school-system + ESB-code field; require them
  // ONLY when present, so the other pages' forms are unaffected (null-safe).
  const district = document.getElementById('district');
  const esbCode = document.getElementById('esb_code');
  if(district && !district.value.trim()){ district.focus(); return; }
  if(esbCode && !esbCode.value.trim()){ esbCode.focus(); return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch(WAITLIST_API, {
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({
        first_name: first.value.trim(),
        last_name: last.value.trim(),
        email: email.value.trim(),
        // optional referral / seat code (the /invite page exposes it; blank elsewhere).
        // NB: null-safe — pages without a #code input must not throw on .trim() (that was silently
        // breaking the home/dialog/ed waitlist with the generic "didn't go through" error).
        code: ((document.getElementById('code')||{}).value || '').trim(),
        // specialty landing pages set a hidden source so AJ sees the segment in /admin
        note: (document.getElementById('wl-source')||{}).value || '',
        // /esb captures the school system + ESB referrer code for eligibility verification
        district: ((document.getElementById('district')||{}).value || '').trim(),
        esb_code: ((document.getElementById('esb_code')||{}).value || '').trim(),
        _gotcha: (form.querySelector('[name=_gotcha]')||{}).value || ''
      })
    });
    if(!res.ok) throw new Error('failed');
    form.style.display = 'none';
    done.classList.add('show');
  } catch(err) {
    btn.disabled = false; btn.textContent = 'Request an invitation';
    note.innerHTML = "Hmm — that didn't go through. Try again, or email " +
      "<a href='mailto:hello@coachlibra.com' style='color:var(--gold-soft)'>hello@coachlibra.com</a>.";
  }
});
