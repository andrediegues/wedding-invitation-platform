// Runtime configuration for the guest site and the printable invite.
//
// apiUrl  — the Google Apps Script web app URL (see backend/README.md).
//           Leave empty to run in demo mode: RSVPs are kept in this browser only
//           and the demo codes DEMO01 and AVOS22 are accepted.
// siteUrl — the public URL of the site. Used for the QR codes on printed invites.
window.APP_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbxTDNoDV0o7thBM13_KtJ4A6H6dzpvOMkKwItL5pjVjVYh5Mt-JEn1YguAdQ97LNtiZ3w/exec",
  siteUrl: "https://andrediegues.github.io/wedding-invitation-platform/",
};
