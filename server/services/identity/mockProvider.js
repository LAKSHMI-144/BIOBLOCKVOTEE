// DEVELOPMENT / DEMO identity provider. It does NOT verify anyone's identity with any authority
// (no Aadhaar, no government database). It only proves the OTP plumbing works end to end.
// Replace with a real, authorised provider by implementing the same three members.
const OTP = () => String(process.env.DEV_MOCK_OTP || '123456');

module.exports = {
    name: 'mock',
    development: true,
    label: 'Development / Demo Verification',
    // A real provider would send an SMS here. The mock sends nothing.
    async sendOtp(/* contact, ctx */) {
        return { dispatched: true, dev_hint: `Development / Demo Verification: use the configured test OTP (default 123456). No SMS is sent.` };
    },
    // A real provider would ask its API whether this OTP is correct for this contact.
    async checkOtp(_contact, otp) {
        return String(otp) === OTP();
    }
};
