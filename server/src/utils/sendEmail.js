const nodemailer = require("nodemailer");

const sendEmail = async (to, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "OTP Verification",
    html: `
      <h2>Your OTP: ${otp}</h2>
      <p>Valid for 5 minutes</p>
    `,
  });
};

module.exports = sendEmail;