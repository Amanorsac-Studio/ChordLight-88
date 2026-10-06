'use strict';
/* Chordlight 88 Free Trial — the trial-ended screen. */
(function () {
  const $ = (id) => document.getElementById(id);
  const day = (ms) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const L = window.trialLock;
  $('buy').addEventListener('click', () => L && L.buy());
  $('quit').addEventListener('click', () => L && L.quit());
  if (!L) return;
  L.status().then((st) => {
    if (!st) return;
    if (st.reason === 'clock') {
      $('head').textContent = 'Check your computer’s date and time';
      $('body').textContent = 'The clock on this computer is earlier than the last time Chordlight ran. Set the correct date and time, then open Chordlight again.';
    } else if (st.reason === 'build') {
      $('head').textContent = 'This trial version has expired';
      $('body').textContent = 'This copy of the free trial is too old to run. Get the full version of Chordlight 88 from amanorsac.studio.';
    }
    if (st.reason === 'expired') $('when').textContent = `Trial started ${day(st.startedAt)} · ended ${day(st.endsAt)}`;
    else if (st.startedAt) $('when').textContent = `Trial started ${day(st.startedAt)}`;
  }).catch(() => {});
})();
