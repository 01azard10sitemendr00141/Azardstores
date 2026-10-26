// Central place that decides which verification channels are actually usable
// right now, based on whether their credentials exist in .env. Nothing else
// in the codebase should check process.env for this directly — route
// through here so turning a channel on/off later is a one-file, zero-code
// change (just add the env vars and restart the server).

function getVerificationCapabilities() {
  return {
    email: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    sms: Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME && process.env.AT_SENDER_ID),
    // WhatsApp verification here uses the "loop" method (user sends us a
    // pre-filled code via WhatsApp, we catch it on the webhook) rather than
    // the paid Authentication-template API — so this checks for the webhook
    // setup, not a send-message token.
    whatsapp: Boolean(
      process.env.WHATSAPP_BUSINESS_NUMBER &&
      process.env.WHATSAPP_VERIFY_TOKEN &&
      process.env.WHATSAPP_APP_SECRET
    ),
  };
}

// True once email sending is actually configured. Email verification is
// only *required* at checkout once this is true — otherwise a customer
// could never receive the link to verify with, and would be permanently
// locked out of checkout with no way to fix it themselves. Mirrors
// isPhoneVerificationLive() below for the same reason.
function isEmailVerificationLive() {
  return isEmailDeliveryConfigured();
}

function isEmailDeliveryConfigured() {
  return getVerificationCapabilities().email;
}

// True once at least one phone-based channel (SMS or WhatsApp) is configured.
// Phone verification is only *required* at checkout once this is true —
// otherwise nothing would ever be able to check out while phone
// verification is still mid-setup.
function isPhoneVerificationLive() {
  const caps = getVerificationCapabilities();
  return caps.sms || caps.whatsapp;
}

module.exports = { getVerificationCapabilities, isEmailDeliveryConfigured, isEmailVerificationLive, isPhoneVerificationLive };
