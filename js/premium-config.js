/* Bellatrix Premium: the products, the demo prices and the durations (1.16, 10 Nov 2026).
   The ONLY place with a Premium price. Read by js/premium.js and js/library.js (Care Team), and by the
   family portal server (labland/family-portal.mjs reads products[product].monthCents and currency).
   PILOT (Rahma, 10 Nov): the FAMILIES see and "pay" the real price; "free" only means the developer pays
   for no service (no API, no payment provider). So pilotFree is false: the price below is shown to the
   team and to the family. testPayment true = the payment is SIMULATED: no payment provider, nothing is
   ever debited, no card data is kept, and both sides say so in one short line.
   pilotFree true would show 0 everywhere. To change the price, change monthCents (euro cents a month,
   for ONE resident).
   The texts are English keys, translated by ST() (js/i18n-staff.js). ES5 (Chrome 95 WebView). */
var PREMIUM_CONFIG = {
  version: '1.16',
  pilotFree: false,
  testPayment: true,
  currency: 'EUR',
  months: [1, 3, 12],
  requestDays: 14,
  products: {
    /* Bellatrix Play Premium: no ads, offline listening, better sound, free choice, listening together. */
    play: {
      id: 'play', name: 'Bellatrix Play Premium', short: 'Music', icon: 'crown', category: 'music-movement',
      monthCents: 1099,
      tagline: 'No ads, offline listening, listen together.',
      about: 'For one resident: no ads, music and podcasts offline, better sound, any song at any time, listening together with the family.',
      benefits: ['No ads', 'Offline listening', 'Listen together']
    },
    /* Books Premium: the Premium books of the reading app. Never implied by Play Premium. */
    books: {
      id: 'books', name: 'Books Premium', short: 'Books', icon: 'book', category: 'reading',
      monthCents: 1099,
      tagline: 'The Premium books, page by page.',
      about: 'For one resident: the Premium books and favourite books.',
      benefits: ['Premium books', 'Favourite books']
    }
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = PREMIUM_CONFIG;
