const User = require("../models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const otpGenerator = require("../utils/otpGenerator");
const { sendEmail } = require("../utils/sendEmail");
const { sendSms } = require("../utils/sendSms");

// Register user with validations, OTP generation and notifications
exports.registerUser = async (req, res) => {
  try {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const phoneRegex = /^\+91\d{10}$/;
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;

    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res
        .status(400)
        .json({
          message: "All fields are required",
          messageType: "failure",
          userId: "",
        });
    }

    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({
          message: "Invalid email format",
          messageType: "failure",
          userId: "",
        });
    }

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        message: "Invalid phone number format. Use country code (+91)",

        messageType: "failure",
        userId: "",
      });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long, include an uppercase letter, a number, and a special character.",
        messageType: "failure",
        userId: "",
      });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        message: "Email or phone number already registered",

        messageType: "failure",
        userId: "",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const phoneOtp = otpGenerator(6);
    const emailOtp = otpGenerator(6);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // await sendEmail(email, "OTP Verification", `Your OTP is ${emailOtp}`);
    // await sendSms(phone, `Hi, your OTP is ${phoneOtp}`);

    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      verification: {
        emailOtp,
        phoneOtp,
        otpExpiry,
      },
    });

    await newUser.save();

    res.status(201).json({
      message: "User registered successfully",
      messageType: "success",
      userId: newUser._id,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Server error", messageType: "failure", userId: "" });
  }
};
// Verify OTPs for both email and phone
exports.verifyOtp = async (req, res) => {
  try {
    const { email, phone, emailOtp, phoneOtp } = req.body;

    if (!email || !phone || !emailOtp || !phoneOtp) {
      return res
        .status(400)
        .json({ message: "Email, phone number, and OTPs are required" });
    }

    const user = await User.findOne({ $or: [{ email }, { phone }] });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.verification.emailOtp !== emailOtp) {
      return res.status(400).json({ message: "Invalid email OTP" });
    }

    if (user.verification.phoneOtp !== phoneOtp) {
      return res.status(400).json({ message: "Invalid phone OTP" });
    }

    if (user.verification.otpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    user.verification.emailVerified = true;
    user.verification.phoneVerified = true;
    user.verification.emailOtp = null;
    user.verification.phoneOtp = null;
    user.verification.otpExpiry = null;

    await user.save();

    res.json({ message: "OTP verified successfully", userId: user._id });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",

        messageType: "failure",
        userId: "",
      });
    }

    const userExist = await User.findOne({ email });
    if (!userExist) {
      return res.status(400).json({
        message: "User not found",

        messageType: "failure",
        userId: "",
      });
    }

    const isMatch = await bcrypt.compare(password, userExist.password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",

        messageType: "failure",
        userId: "",
      });
    }

    const token = jwt.sign({ userId: userExist._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Create a safe user object without password
    const user = {
      _id: userExist._id,
      name: userExist.name,
      email: userExist.email,
      role: userExist.role, // if you have roles like admin/customer etc.
    };

    res.json({
      message: "Logged in successfully",
      messageType: "success",
      token:token,
      userId: user._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", messageType: "failure" ,
             messageType: "failure",
              userId: "",
    });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const { street, city, state, zip, longitude, latitude, userId } = req.body;

    if (
      !street ||
      !city ||
      !state ||
      !zip ||
      !longitude ||
      !latitude ||
      !userId
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const userExist = await User.findById(userId);
    if (!userExist) {
      return res.status(404).json({ message: "User not found" });
    }

    userExist.address = {
      street,
      city,
      state,
      zip,
      location: {
        type: "Point", // ✅ Important for GeoJSON!
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
    };

    await userExist.save();

    res.json({ message: "Address updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteAddressById = async (req, res) => {
  try {
    const { userId, addressId } = req.params;

    // Find the user by userId
    const userExist = await User.findById(userId);
    if (!userExist) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the user has the specified addressId
    const addressExists = userExist.address.id(addressId); // If it's a subdocument (array of addresses)
    if (!addressExists) {
      return res.status(404).json({ message: "Address not found" });
    }

    // Remove the address
    userExist.address.id(addressId).remove();

    // Save the updated user
    await userExist.save();

    res.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateAddressById = async (req, res) => {
  try {
    const { userId, addressId } = req.params; // Extract userId and addressId from request params
    const { street, city, state, zip, longitude, latitude } = req.body; // Extract address fields from request body

    // Validate the required fields
    if (!street || !city || !state || !zip || !longitude || !latitude) {
      return res
        .status(400)
        .json({ message: "All address fields are required" });
    }

    // Find the user by userId
    const userExist = await User.findById(userId);
    if (!userExist) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find the address by addressId within the user's address subdocument
    const address = userExist.address.id(addressId);
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    // Update the address fields
    address.street = street;
    address.city = city;
    address.state = state;
    address.zip = zip;
    address.location = {
      type: "Point", // Required for GeoJSON
      coordinates: [parseFloat(longitude), parseFloat(latitude)], // Ensure coordinates are floats
    };

    // Save the updated user document
    await userExist.save();

    res.json({ message: "Address updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
// Resend new OTPs
exports.resendOtp = async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res
        .status(400)
        .json({ message: "Email or phone number is required" });
    }

    const user = await User.findOne({ $or: [{ email }, { phone }] });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentTime = new Date();
    const timeDifference = (currentTime - user.verification.otpExpiry) / 60000;

    if (timeDifference < 5) {
      return res
        .status(400)
        .json({ message: "You can only request a new OTP after 5 minutes" });
    }

    const emailOtp = otpGenerator(6);
    const phoneOtp = otpGenerator(6);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.verification.emailOtp = emailOtp;
    user.verification.phoneOtp = phoneOtp;
    user.verification.otpExpiry = otpExpiry;

    await user.save();

    await sendEmail(
      user.email,
      "OTP Verification",
      `Your new email OTP is ${emailOtp}`
    );
    await sendSms(user.phone, `Your new phone OTP is ${phoneOtp}`);

    res.json({ message: "OTP sent successfully to email and phone" });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};



exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email is provided
    if (!email) {
      return res.status(400).json({
        message: "Email is required.",
        messageType: "failure",
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "No user with that email.",
        messageType: "failure",
      });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set OTP and expiry (5 mins)
    user.resetPasswordToken = otp;
    user.resetPasswordExpires = Date.now() + 5 * 60 * 1000;

    await user.save();

    // Send email with OTP
    const emailResult = await sendEmail(
      user.email,
      "Your Password Reset OTP",
      `Your OTP for password reset is: ${otp}. It will expire in 5 minutes.`
    );

    // Check if email was successfully sent
    if (!emailResult.accepted || !emailResult.accepted.length) {
      return res.status(500).json({
        message: "Failed to deliver OTP email.",
        messageType: "failure",
      });
    }

    // Success Response
    res.status(200).json({
      message: "OTP sent to your email.",
      messageType: "success",
      userId: user._id,
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      message: "Server error.",
      messageType: "failure",
    });
  }
};




exports.resetPassword = async (req, res) => {
  try {
   
    const { newPassword , otp} = req.body;

    // Validate newPassword is provided
    if (!newPassword || !otp) {
      return res.status(400).json({
        message: "New password or otp  is required.",
        messageType: "failure",
      });
    }

    // Password strength validation
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long, include an uppercase letter, a number, and a special character.",
        messageType: "failure",
      });
    }

    // Find user by OTP and check if it's not expired
    const user = await User.findOne({
      resetPasswordToken: otp,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired OTP.",
        messageType: "failure",
      });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear OTP fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.status(200).json({
      message: "Password reset successful.",
      messageType: "success",
    });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      message: "Server error.",
      messageType: "failure",
    });
  }
};
