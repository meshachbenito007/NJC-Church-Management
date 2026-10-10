
const sessions = new Map();

function getApiKey() {
  const key = process.env.TWOFACTOR_API_KEY;

  if (!key) {
    throw new Error('SMS provider is not configured');
  }

  return key;
}

async function requestOtp(mobile) {
  const apiKey = getApiKey();
  const phone = String(mobile).replace(/\s+/g, '');

  // 2Factor expects an international phone number.
  const internationalPhone = phone.startsWith('+')
    ? phone
    : phone.startsWith('91')
      ? `+${phone}`
      : `+91${phone}`;

  const url =
    `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}` +
    `/SMS/${encodeURIComponent(internationalPhone)}/AUTOGEN`;

  const response = await fetch(url);
  const data = await response.json();

  if (
    !response.ok ||
    String(data.Status).toLowerCase() !== 'success' ||
    !data.Details
  ) {
    console.error('2Factor OTP request failed:', data.Status);
    throw new Error('Unable to send OTP. Please try again.');
  }

  sessions.set(String(mobile).trim(), {
    sessionId: String(data.Details),
    expires: Date.now() + 5 * 60 * 1000
  });

  return true;
}

async function verifyOtp(mobile, otp) {
  const key = String(mobile).trim();
  const session = sessions.get(key);

  if (!session || session.expires < Date.now()) {
    sessions.delete(key);
    return false;
  }

  const apiKey = getApiKey();
  const url =
    `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}` +
    `/SMS/VERIFY/${encodeURIComponent(session.sessionId)}` +
    `/${encodeURIComponent(String(otp).trim())}`;

  const response = await fetch(url);
  const data = await response.json();

  if (
    response.ok &&
    String(data.Status).toLowerCase() === 'success'
  ) {
    sessions.delete(key);
    return true;
  }

  return false;
}

module.exports = {
  requestOtp,
  verifyOtp
};
