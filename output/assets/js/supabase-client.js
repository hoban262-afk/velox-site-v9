/**
 * supabase-client.js — Shared Supabase client for Velox Peptides
 *
 * Load this AFTER the Supabase CDN script on any page that needs database
 * access:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="/assets/js/supabase-client.js"></script>
 *
 * The anon key is safe in client-side code because RLS policies ensure:
 *   - anon users can only INSERT (place orders, subscribe, apply as affiliate)
 *   - anon users cannot SELECT, UPDATE, or DELETE any rows
 *   - Authenticated admin sessions unlock full read/write access
 *
 * window._sb is the shared client used by checkout.js, admin.js, and core.js.
 */
(function () {
  'use strict';

  var SUPABASE_URL  = 'https://stkjdtyhaxejxqmbzyua.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0a2pkdHloYXhlanhxbWJ6eXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTUxMTgsImV4cCI6MjA5NTM5MTExOH0.QtkaubtNsJkFruoJ-hsxfd5qTlgX5Hs-9wTqJRQC4S0';

  if (typeof supabase !== 'undefined' && supabase.createClient) {
    window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  } else {
    console.warn('[supabase-client] Supabase CDN not loaded — _sb unavailable');
  }
}());
