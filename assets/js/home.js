// scroll reveal
const io = new IntersectionObserver((entries) => {
  entries.forEach(en => { if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
}, {threshold:.16, rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// waitlist → Coach Libra box API (stored in our own DB; approvable from /admin)
const WAITLIST_API = 'https://esbserver-m4.taild49f53.ts.net/waitlist';
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
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch(WAITLIST_API, {
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({
        first_name: first.value.trim(),
        last_name: last.value.trim(),
        email: email.value.trim(),
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
