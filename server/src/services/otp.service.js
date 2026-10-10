
const codes = new Map();

function issueOtp(mobile) {
  const otp = String(
    Math.floor(100000 + Math.random() * 900000)
  );

  codes.set(String(mobile), {
    otp,
    expires: Date.now() + 5 * 60 * 1000
  });

  // Log only in development; Render production can use
  // its configured delivery provider instead.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV OTP] ${mobile}: ${otp}`);
  } else {
    console.log(`[OTP] Code generated for ${mobile}`);
  }

  return otp;
}

function verifyOtp(mobile, otp) {
  const key = String(mobile);
  const stored = codes.get(key);

  if (
    !stored ||
    stored.expires < Date.now() ||
    stored.otp !== String(otp).trim()
  ) {
    return false;
  }

  codes.delete(key);
  return true;
}

module.exports = {
  issueOtp,
  verifyOtp
};
